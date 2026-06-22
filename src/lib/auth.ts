/**
 * Lightweight password-based panel authentication.
 *
 * Design:
 *  - Panel password is stored in the Setting table under key `panelPassword`
 *    as `salt:hash` (both hex, SHA-256). Default password is `admin123`.
 *  - On successful login we issue an httpOnly cookie `tg_admin_session`
 *    containing a signed token (HMAC-SHA256 of `email|expiry` using the
 *    password hash as the secret so changing the password invalidates old
 *    sessions automatically).
 *  - `requireAuth()` throws a 401-shaped error to short-circuit API routes
 *    when no valid session is present. The middleware (`src/middleware.ts`)
 *    also enforces this for all `/api/*` routes except `/api/auth/login`.
 *  - A per-IP in-memory rate limiter caps failed logins at 5 per 60s to
 *    mitigate brute-force attacks. Successful logins reset the counter.
 *  - The `panelPasswordIsDefault` Setting flag tracks whether the lazy
 *    default password (`admin123`) is still in use, so the UI can warn the
 *    admin until they actually change it.
 *
 * Session tracking (Task 8-c):
 *  - Every successful `login()` also creates a `Session` row in the DB. The
 *    `Session.id` IS the HMAC signature embedded in the cookie — this lets
 *    us look up a session by parsing the cookie without changing the cookie
 *    format (the cookie stays `admin|<expires>|<sig>`).
 *  - `getSession()` validates the HMAC, then checks the DB: if `active=false`
 *    the session has been revoked and is rejected. `lastSeenAt` is refreshed
 *    on access but debounced to 5 minutes to avoid DB writes on every
 *    request. Sessions issued before this change (no DB row) are treated as
 *    legacy: allowed, and a DB row is created on-the-fly so future
 *    revocation works.
 *  - `revokeSession(id)` / `revokeAllOtherSessions(currentId)` mark rows as
 *    `active=false` (we keep the rows for the audit trail — IP + UA +
 *    lastSeenAt are preserved).
 *  - `logout()` marks the current session as `active=false` in addition to
 *    clearing the cookie.
 */

import { cookies, headers } from "next/headers";
import { db } from "./db";
import { isTotpEnabled, verifyTOTP, getTotpSecret, verifyBackupCode } from "./totp";

const COOKIE_NAME = "tg_admin_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const IS_DEFAULT_SETTING_KEY = "panelPasswordIsDefault";
// 2FA temp-token TTL — short, just long enough for the user to fetch their
// authenticator code. The temp token is only valid for the `/api/auth/login/2fa`
// endpoint, NOT for any other route (the middleware still requires a session
// cookie for everything else).
const TEMP_TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes
// How stale `lastSeenAt` must be before we refresh it on a `getSession()`
// call. Avoids a DB write on every request while keeping activity tracking
// reasonably fresh (5-minute granularity).
const LAST_SEEN_REFRESH_MS = 5 * 60 * 1000;

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, "0");
  return s;
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function sha256(data: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", enc.encode(data));
}

async function hmac(key: Uint8Array, data: string): Promise<string> {
  const ck = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", ck, enc.encode(data));
  return toHex(sig);
}

function randomHex(bytes: number): string {
  const out = new Uint8Array(bytes);
  crypto.getRandomValues(out);
  return toHex(out);
}

/** Hash a password with a fresh salt. Returns `salt:hash` (both hex). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomHex(16);
  const hash = toHex(await sha256(`${salt}:${password}`));
  return `${salt}:${hash}`;
}

/** Verify a password against a stored `salt:hash` string. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, expectedHash] = stored.split(":");
  if (!salt || !expectedHash) return false;
  const hash = toHex(await sha256(`${salt}:${password}`));
  // Constant-time compare
  if (hash.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  return diff === 0;
}

async function getStoredPassword(): Promise<string | null> {
  const row = await db.setting.findUnique({ where: { id: "panelPassword" } });
  return row?.value ?? null;
}

async function getPanelPasswordHash(): Promise<string> {
  // Lazily set up the default password if none configured.
  let stored = await getStoredPassword();
  if (!stored) {
    stored = await hashPassword("admin123");
    await db.setting.upsert({
      where: { id: "panelPassword" },
      create: { id: "panelPassword", value: stored },
      update: { value: stored },
    });
    // Mark that the default password is currently in use.
    await db.setting.upsert({
      where: { id: IS_DEFAULT_SETTING_KEY },
      create: { id: IS_DEFAULT_SETTING_KEY, value: "true" },
      update: { value: "true" },
    });
  }
  return stored;
}

export async function setPanelPassword(newPassword: string): Promise<void> {
  if (!newPassword || newPassword.length < 4) {
    throw new Error("Password must be at least 4 characters");
  }
  const hash = await hashPassword(newPassword);
  await db.setting.upsert({
    where: { id: "panelPassword" },
    create: { id: "panelPassword", value: hash },
    update: { value: hash },
  });
  // The default password is no longer in use after an explicit change.
  await db.setting.upsert({
    where: { id: IS_DEFAULT_SETTING_KEY },
    create: { id: IS_DEFAULT_SETTING_KEY, value: "false" },
    update: { value: "false" },
  });
}

/**
 * Returns true if the panel is still using the lazily-created default
 * password (`admin123`). The UI uses this to keep the warning banner
 * visible until the admin actually changes the password.
 */
export async function isDefaultPassword(): Promise<boolean> {
  // Ensure the flag exists (creates the lazy default + flag if needed).
  await getPanelPasswordHash();
  const row = await db.setting.findUnique({ where: { id: IS_DEFAULT_SETTING_KEY } });
  // Treat missing flag as "default" (conservative — show the warning).
  return row?.value !== "false";
}

/**
 * Optional context passed to `login()` so the new `Session` row can record
 * the originating IP + User-Agent. Both default to `null` when not provided
 * (e.g. when called from a context without request headers).
 */
export type LoginContext = {
  ip?: string | null;
  userAgent?: string | null;
};

/**
 * Result of a `login()` attempt. When 2FA is enabled and the password is
 * correct, `requires2FA` is `true` and `tempToken` is set — the caller must
 * then collect a TOTP code from the user and call `verify2FALogin()`.
 */
export type LoginResult =
  | { ok: true }
  | { ok: false; requires2FA?: false }
  | { ok: false; requires2FA: true; tempToken: string };

/**
 * Verify a candidate panel password against the currently-configured hash.
 * Used by routes that need to re-confirm the password before a sensitive
 * action (e.g. disabling 2FA). Returns true on match.
 */
export async function verifyPanelPassword(password: string): Promise<boolean> {
  const stored = await getStoredPassword();
  if (!stored) return false;
  return verifyPassword(password, stored);
}

/**
 * Verify login credentials. If 2FA is disabled, issues a session cookie and
 * returns `{ ok: true }`. If 2FA is enabled and the password is correct,
 * returns `{ ok: false, requires2FA: true, tempToken }` — the caller must
 * then prompt for a TOTP code and POST it to `/api/auth/login/2fa`.
 *
 * The temp token is HMAC-signed using the password hash as the key (same as
 * the session cookie) so changing the password invalidates pending 2FA
 * challenges. The temp token is short-lived (5 minutes) and only valid for
 * the 2FA verify endpoint.
 */
export async function login(password: string, ctx: LoginContext = {}): Promise<LoginResult> {
  const stored = await getPanelPasswordHash();
  const ok = await verifyPassword(password, stored);
  if (!ok) return { ok: false };

  // 2FA check: if TOTP is enabled, don't issue the full session yet —
  // require the user to also produce a TOTP code (or backup code).
  const totpEnabled = await isTotpEnabled();
  if (totpEnabled) {
    const tempToken = await signTempToken(stored);
    return { ok: false, requires2FA: true, tempToken };
  }

  await issueSession(stored, ctx);
  return { ok: true };
}

/**
 * Internal: issue the full session cookie + record the Session row. Split
 * out of `login()` so `verify2FALogin()` can reuse it without re-checking
 * the password.
 */
async function issueSession(stored: string, ctx: LoginContext): Promise<void> {
  const expires = Date.now() + SESSION_TTL_MS;
  const payload = `admin|${expires}`;
  // Use the password hash bytes as the signing key so changing the password
  // invalidates outstanding sessions automatically.
  const keyBytes = fromHex(stored.split(":")[1]);
  const sig = await hmac(keyBytes, payload);
  // Token format: `admin|<expires>|<sig>` — pipe-separated so it's a single
  // opaque string with no colons that could confuse cookie parsers.
  const token = `${payload}|${sig}`;
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });

  // Resolve the originating IP + User-Agent for the Session row. Prefer the
  // explicit `ctx` (callers that already have the request handy), fall back
  // to `headers()` so existing callers (e.g. the unmodified login route)
  // still get IP/UA recorded without a signature change.
  let ip = ctx.ip ?? null;
  let userAgent = ctx.userAgent ?? null;
  if (ip === null || userAgent === null) {
    try {
      const h = await headers();
      if (ip === null) {
        const fwd = h.get("x-forwarded-for");
        if (fwd) ip = fwd.split(",")[0]?.trim() || null;
        else if (h.get("x-real-ip")) ip = h.get("x-real-ip")!.trim();
      }
      if (userAgent === null) {
        const ua = h.get("user-agent");
        if (ua) userAgent = ua;
      }
    } catch {
      /* headers() not available in this context — leave as null */
    }
  }

  // Track the issued session server-side so the admin can list/revoke it
  // from the Active Sessions card. The Session.id IS the HMAC signature —
  // this lets us look up the session from the cookie without changing the
  // cookie format. We use upsert so two logins in the same millisecond
  // (same `expires` → same `sig`) coalesce into one row instead of crashing.
  try {
    await db.session.upsert({
      where: { id: sig },
      create: {
        id: sig,
        expiresAt: new Date(expires),
        ip,
        userAgent,
        active: true,
        lastSeenAt: new Date(),
      },
      update: {
        // If a row already exists (e.g. cookie was cleared + re-login within
        // the same ms), refresh its metadata and reactivate it.
        expiresAt: new Date(expires),
        ip,
        userAgent,
        active: true,
        lastSeenAt: new Date(),
      },
    });
  } catch (e) {
    // Session tracking is best-effort — never block login on a DB write.
    console.error("[auth] failed to record Session row:", e);
  }
}

// ---------------------------------------------------------------------------
// 2FA login flow — temp-token signing + verification
// ---------------------------------------------------------------------------

/**
 * Sign a short-lived (5-minute) temp token for the 2FA login flow. The token
 * format is `2fa|<expires>|<sig>` where `sig` is HMAC-SHA256 of `2fa|<expires>`
 * using the password hash as the key. The token is returned to the caller
 * (NOT set as a cookie) so the client can POST it back to
 * `/api/auth/login/2fa` along with the TOTP code.
 *
 * The 2FA temp token is intentionally a separate namespace from the session
 * cookie (`admin|...`) so the middleware cookie-presence check (which only
 * looks for `tg_admin_session`) doesn't accidentally accept a temp token.
 */
async function signTempToken(passwordHash: string): Promise<string> {
  const expires = Date.now() + TEMP_TOKEN_TTL_MS;
  const payload = `2fa|${expires}`;
  const keyBytes = fromHex(passwordHash.split(":")[1]);
  const sig = await hmac(keyBytes, payload);
  return `${payload}|${sig}`;
}

/**
 * Verify a 2FA temp token's signature and expiry. Returns the expiry
 * timestamp on success, or null if invalid/expired. Does NOT consume the
 * token — callers should call `verify2FALogin()` to also check the TOTP code
 * and issue the session.
 */
async function verifyTempToken(token: string): Promise<number | null> {
  const parts = token.split("|");
  if (parts.length !== 3) return null;
  const [tag, expStr, sig] = parts;
  if (tag !== "2fa" || !expStr || !sig) return null;
  const expires = parseInt(expStr, 10);
  if (!Number.isFinite(expires) || expires < Date.now()) return null;
  const stored = await getStoredPassword();
  if (!stored) return null;
  const keyBytes = fromHex(stored.split(":")[1]);
  const expectedSig = await hmac(keyBytes, `${tag}|${expires}`);
  if (expectedSig !== sig) return null;
  return expires;
}

/**
 * Complete the 2FA login flow: verify the temp token + TOTP code (or backup
 * code), then issue the full session cookie. Returns true on success.
 *
 * If `code` is 6 digits, it's treated as a TOTP code; otherwise it's treated
 * as a backup code (8-char hex).
 */
export async function verify2FALogin(
  tempToken: string,
  code: string,
  ctx: LoginContext = {},
): Promise<boolean> {
  const expires = await verifyTempToken(tempToken);
  if (expires === null) return false;
  const trimmed = code.trim();
  if (!trimmed) return false;

  // 6-digit numeric → TOTP. Otherwise → backup code.
  if (/^\d{6}$/.test(trimmed)) {
    const secret = await getTotpSecret();
    if (!secret) return false;
    if (!verifyTOTP(secret, trimmed)) return false;
  } else {
    const ok = await verifyBackupCode(trimmed);
    if (!ok) return false;
  }

  const stored = await getPanelPasswordHash();
  await issueSession(stored, ctx);
  return true;
}

/**
 * Mark the current session as inactive in the DB (audit trail preserved)
 * and clear the auth cookie. Safe to call when no session is present.
 */
export async function logout(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) {
    const sig = sigFromToken(token);
    if (sig) {
      try {
        await db.session.update({
          where: { id: sig },
          data: { active: false },
        });
      } catch (e) {
        console.error("[auth] failed to mark session inactive on logout:", e);
      }
    }
  }
  store.delete(COOKIE_NAME);
}

/** Extract the HMAC signature (Session.id) from a raw cookie token. */
function sigFromToken(token: string): string | null {
  const parts = token.split("|");
  if (parts.length !== 3) return null;
  const sig = parts[2];
  return sig || null;
}

export type SessionInfo = { authenticated: boolean; expiresAt?: number };

export async function getSession(): Promise<SessionInfo> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return { authenticated: false };
  // Token format: `admin|<expires>|<sig>`
  const parts = token.split("|");
  if (parts.length !== 3) return { authenticated: false };
  const [actor, expStr, sig] = parts;
  if (!actor || !expStr || !sig) return { authenticated: false };
  const expires = parseInt(expStr, 10);
  if (!Number.isFinite(expires) || expires < Date.now()) {
    return { authenticated: false };
  }
  // Validate signature against the currently-configured password hash.
  const stored = await getStoredPassword();
  if (!stored) return { authenticated: false };
  const keyBytes = fromHex(stored.split(":")[1]);
  const expectedSig = await hmac(keyBytes, `${actor}|${expires}`);
  if (expectedSig !== sig) return { authenticated: false };

  // HMAC is valid — now check the server-side Session row for revocation.
  // We treat DB failures as "legacy/allow" so a transient DB issue doesn't
  // lock the admin out of the panel.
  try {
    const row = await db.session.findUnique({ where: { id: sig } });
    if (row) {
      if (!row.active) {
        // Explicitly revoked (via the Active Sessions UI or logout).
        return { authenticated: false };
      }
      // Debounced lastSeenAt refresh — only write if older than 5 minutes.
      const now = Date.now();
      if (now - row.lastSeenAt.getTime() > LAST_SEEN_REFRESH_MS) {
        db.session
          .update({
            where: { id: sig },
            data: { lastSeenAt: new Date(now) },
          })
          .catch(() => {
            /* best-effort, fire-and-forget */
          });
      }
    } else {
      // Legacy session: cookie is valid but no DB row exists (issued before
      // Session tracking was added). Create a row on-the-fly with null
      // ip/userAgent so future revocation works. We don't have request
      // headers in `getSession()` (cookies() doesn't expose them), so the
      // IP/UA for legacy rows is unknown.
      db.session
        .create({
          data: {
            id: sig,
            expiresAt: new Date(expires),
            ip: null,
            userAgent: null,
            active: true,
            lastSeenAt: new Date(),
          },
        })
        .catch(() => {
          /* best-effort — ignore race conditions / duplicates */
        });
    }
  } catch (e) {
    console.error("[auth] failed to look up Session row:", e);
  }

  return { authenticated: true, expiresAt: expires };
}

/**
 * Returns the Session.id (HMAC signature) of the current request's session,
 * or `null` if not authenticated. Used by the Active Sessions UI/API to
 * mark which row is the "current" session.
 */
export async function getCurrentSessionId(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return sigFromToken(token);
}

/**
 * Mark a single session as inactive (revoked). The row is preserved for the
 * audit trail. Returns true if a row was updated, false if it didn't exist
 * or was already inactive.
 */
export async function revokeSession(id: string): Promise<boolean> {
  try {
    const row = await db.session.findUnique({ where: { id } });
    if (!row || !row.active) return false;
    await db.session.update({
      where: { id },
      data: { active: false },
    });
    return true;
  } catch (e) {
    console.error("[auth] failed to revoke session:", e);
    return false;
  }
}

/**
 * Mark every active session EXCEPT the one with id=`currentId` as inactive.
 * Used by the "Revoke all other sessions" button. Returns the number of
 * sessions that were revoked.
 */
export async function revokeAllOtherSessions(currentId: string): Promise<number> {
  try {
    const result = await db.session.updateMany({
      where: { active: true, id: { not: currentId } },
      data: { active: false },
    });
    return result.count;
  } catch (e) {
    console.error("[auth] failed to revoke other sessions:", e);
    return 0;
  }
}

/**
 * Throw a 401-shaped error if the current request is not authenticated.
 * Call at the start of any API route handler that requires auth.
 */
export async function requireAuth(): Promise<void> {
  const s = await getSession();
  if (!s.authenticated) {
    const err = new Error("UNAUTHORIZED");
    (err as Error & { status?: number }).status = 401;
    throw err;
  }
}

/** Convenience helper for API routes — returns true if authenticated. */
export async function isAuthenticated(): Promise<boolean> {
  const s = await getSession();
  return s.authenticated;
}

export const AUTH_COOKIE_NAME = COOKIE_NAME;
export const DEFAULT_PANEL_PASSWORD = "admin123";

// ---------------------------------------------------------------------------
// Per-IP login rate limiting (in-memory, brute-force mitigation)
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 60_000; // 60 seconds

type RateBucket = { count: number; firstAttemptAt: number };

/**
 * In-memory map of IP -> failed-attempt bucket. Persists for the lifetime of
 * the Node.js process (cleared on full server restart). This is acceptable for
 * a single-instance admin panel — for a multi-instance deployment a shared
 * store (Redis) would be needed.
 */
const rateBuckets = new Map<string, RateBucket>();

// Periodic cleanup of stale buckets so the map doesn't grow unbounded.
// Runs every 5 minutes; stale = no attempts in the last 2 minutes.
let cleanupScheduled = false;
function scheduleCleanup() {
  if (cleanupScheduled) return;
  cleanupScheduled = true;
  setTimeout(() => {
    cleanupScheduled = false;
    const now = Date.now();
    const staleCutoff = now - 2 * RATE_LIMIT_WINDOW_MS;
    for (const [ip, bucket] of rateBuckets) {
      if (bucket.firstAttemptAt < staleCutoff) {
        rateBuckets.delete(ip);
      }
    }
    // Re-arm if there are still entries.
    if (rateBuckets.size > 0) scheduleCleanup();
  }, 5 * 60_000).unref?.();
}

/**
 * Extracts a best-effort client IP from request headers. Used by login
 * route handlers (and audit logging). Falls back to "unknown" when no
 * forwarding headers are present (e.g. direct localhost access).
 */
export function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    // x-forwarded-for may be a comma-separated list; the first entry is
    // the original client.
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

/**
 * Returns whether the given IP is currently allowed to attempt a login.
 * Does NOT increment the counter — call `recordFailedLogin()` for that.
 */
export function checkRateLimit(ip: string): {
  allowed: boolean;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket) {
    return { allowed: true, retryAfterSeconds: 0 };
  }
  // Reset the bucket if the window has elapsed since the first attempt.
  if (now - bucket.firstAttemptAt > RATE_LIMIT_WINDOW_MS) {
    rateBuckets.delete(ip);
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (bucket.count >= RATE_LIMIT_MAX_ATTEMPTS) {
    const elapsed = now - bucket.firstAttemptAt;
    const remainingMs = Math.max(0, RATE_LIMIT_WINDOW_MS - elapsed);
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil(remainingMs / 1000),
    };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Increment the failed-attempt counter for an IP. Creates the bucket if new. */
export function recordFailedLogin(ip: string): void {
  const now = Date.now();
  const existing = rateBuckets.get(ip);
  if (!existing) {
    rateBuckets.set(ip, { count: 1, firstAttemptAt: now });
    scheduleCleanup();
    return;
  }
  // Reset window if it has fully elapsed.
  if (now - existing.firstAttemptAt > RATE_LIMIT_WINDOW_MS) {
    rateBuckets.set(ip, { count: 1, firstAttemptAt: now });
    return;
  }
  existing.count += 1;
}

/** Clear the failed-attempt counter for an IP (called on successful login). */
export function recordSuccessfulLogin(ip: string): void {
  rateBuckets.delete(ip);
}
