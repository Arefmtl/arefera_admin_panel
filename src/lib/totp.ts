/**
 * TOTP (Time-based One-Time Password) utility library — RFC 6238.
 *
 * Implements the standard 30-second-step, 6-digit, SHA-1 TOTP algorithm used
 * by Google Authenticator / Authy / 1Password etc. Uses Node's built-in
 * `crypto` module — no external TOTP libraries.
 *
 * Persistence:
 *  - `totpSecret`         — base32-encoded 20-byte secret (plaintext in the
 *                            Setting table; acceptable for this sandbox).
 *  - `totpEnabled`         — "true" | "false".
 *  - `totpBackupCodes`     — JSON array of `{ hash: string, used: boolean }`
 *                            where `hash` is the SHA-256 hex of the code.
 *                            We never store the raw backup codes.
 *  - `totpBackupCodesHash` — (legacy key, unused) reserved for future use.
 *
 * Backup codes are 8-char hex strings, 8 of them generated from the secret
 * as a deterministic seed so that re-running `generateBackupCodes` on the
 * same secret produces a different set (each call mixes in `crypto.randomBytes`).
 */

import crypto from "node:crypto";
import { db } from "./db";

// ---------------------------------------------------------------------------
// Base32 encoding / decoding (RFC 4648) — used for TOTP secrets.
// ---------------------------------------------------------------------------

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(input: string): Buffer {
  const cleaned = input.replace(/=+$/, "").toUpperCase().replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// ---------------------------------------------------------------------------
// TOTP core (RFC 6238 / HOTP RFC 4226)
// ---------------------------------------------------------------------------

const STEP_SECONDS = 30;
const DIGITS = 6;
const WINDOW = 1; // ±1 step (~30s drift allowed)

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  // Write counter as big-endian 64-bit integer.
  // JS bitwise ops are 32-bit, so split high/low.
  const high = Math.floor(counter / 0x100000000);
  const low = counter >>> 0;
  buf.writeUInt32BE(high, 0);
  buf.writeUInt32BE(low, 4);

  const hmac = crypto.createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const otp = binary % 10 ** DIGITS;
  return otp.toString().padStart(DIGITS, "0");
}

function counterForTime(timestamp: number): number {
  return Math.floor(timestamp / 1000 / STEP_SECONDS);
}

/**
 * Generate a TOTP code for the given secret at the given timestamp
 * (defaults to now). 30-second step, 6 digits, SHA-1.
 */
export function generateTOTP(secret: string, timestamp: number = Date.now()): string {
  const key = base32Decode(secret);
  return hotp(key, counterForTime(timestamp));
}

/**
 * Verify a TOTP token against the secret within ±`window` steps (default 1,
 * i.e. ±30s of clock drift). Returns true on match.
 */
export function verifyTOTP(secret: string, token: string, window: number = WINDOW): boolean {
  if (!/^\d{6}$/.test(token)) return false;
  const key = base32Decode(secret);
  const now = Date.now();
  const current = counterForTime(now);
  // Constant-time comparison helper
  const safeEqual = (a: string, b: string): boolean => {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  };
  for (let i = -window; i <= window; i++) {
    const expected = hotp(key, current + i);
    if (safeEqual(expected, token)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Secret + QR code URI generation
// ---------------------------------------------------------------------------

/**
 * Generate a fresh 20-byte random TOTP secret, base32-encoded.
 */
export function generateSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

/**
 * Build an `otpauth://` URI for QR code generators. The format is documented
 * in the Google Authenticator Key URI spec:
 *
 *   otpauth://totp/<label>?secret=<secret>&issuer=<issuer>&algorithm=SHA1&digits=6&period=30
 */
export function generateQRCodeURI(secret: string, label: string, issuer: string = "TG Bot Admin"): string {
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  // The label may contain a colon — encode it as "Issuer:Account".
  const encodedLabel = encodeURIComponent(`${issuer}:${label}`);
  return `otpauth://totp/${encodedLabel}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Backup codes
// ---------------------------------------------------------------------------

type StoredBackupCode = { hash: string; used: boolean };

/**
 * Generate 8 one-time-use backup codes (8-char hex each).
 * Returns the *raw* codes (only shown to the admin once at setup time).
 * Also persists the SHA-256 hashes to the Setting table.
 */
export async function generateBackupCodes(secret: string): Promise<string[]> {
  // Mix the secret with random bytes so each call produces a fresh set
  // (deterministic per-call, not per-secret).
  const codes: string[] = [];
  const stored: StoredBackupCode[] = [];
  for (let i = 0; i < 8; i++) {
    const seed = crypto
      .createHash("sha256")
      .update(`${secret}:${i}:${Date.now()}:${crypto.randomBytes(8).toString("hex")}`)
      .digest();
    const code = seed.subarray(0, 4).toString("hex"); // 8 hex chars
    codes.push(code);
    const hash = crypto.createHash("sha256").update(code).digest("hex");
    stored.push({ hash, used: false });
  }
  await db.setting.upsert({
    where: { id: "totpBackupCodes" },
    create: { id: "totpBackupCodes", value: JSON.stringify(stored) },
    update: { value: JSON.stringify(stored) },
  });
  return codes;
}

/**
 * Verify a backup code against the stored (hashed) codes. If valid, marks the
 * code as used so it can't be reused. Returns true on success.
 */
export async function verifyBackupCode(code: string): Promise<boolean> {
  const normalized = code.trim().toLowerCase();
  if (!normalized) return false;
  const row = await db.setting.findUnique({ where: { id: "totpBackupCodes" } });
  if (!row) return false;
  let stored: StoredBackupCode[] = [];
  try {
    const parsed = JSON.parse(row.value);
    if (Array.isArray(parsed)) stored = parsed;
  } catch {
    return false;
  }
  const hash = crypto.createHash("sha256").update(normalized).digest("hex");
  const matchIdx = stored.findIndex((c) => !c.used && c.hash === hash);
  if (matchIdx === -1) return false;
  stored[matchIdx].used = true;
  await db.setting.update({
    where: { id: "totpBackupCodes" },
    data: { value: JSON.stringify(stored) },
  });
  return true;
}

/**
 * Return the count of unused backup codes remaining. 0 if not configured.
 */
export async function countUnusedBackupCodes(): Promise<number> {
  const row = await db.setting.findUnique({ where: { id: "totpBackupCodes" } });
  if (!row) return 0;
  try {
    const parsed = JSON.parse(row.value);
    if (!Array.isArray(parsed)) return 0;
    return parsed.filter((c: StoredBackupCode) => !c.used).length;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Setting-table persistence helpers
// ---------------------------------------------------------------------------

/** Returns the stored TOTP secret (base32), or null if not configured. */
export async function getTotpSecret(): Promise<string | null> {
  const row = await db.setting.findUnique({ where: { id: "totpSecret" } });
  return row?.value ?? null;
}

/** Returns whether 2FA is currently enabled (i.e. login requires a TOTP code). */
export async function isTotpEnabled(): Promise<boolean> {
  const row = await db.setting.findUnique({ where: { id: "totpEnabled" } });
  return row?.value === "true";
}

/** Persist a TOTP secret to the Setting table. */
export async function setTotpSecret(secret: string): Promise<void> {
  await db.setting.upsert({
    where: { id: "totpSecret" },
    create: { id: "totpSecret", value: secret },
    update: { value: secret },
  });
}

/** Toggle the `totpEnabled` flag. */
export async function setTotpEnabled(enabled: boolean): Promise<void> {
  await db.setting.upsert({
    where: { id: "totpEnabled" },
    create: { id: "totpEnabled", value: enabled ? "true" : "false" },
    update: { value: enabled ? "true" : "false" },
  });
}

/**
 * Clear all TOTP-related settings. Used when 2FA is disabled. Preserves the
 * backup-code row (marked used) for the audit trail.
 */
export async function clearTotp(): Promise<void> {
  await db.setting.deleteMany({ where: { id: { in: ["totpSecret", "totpEnabled"] } } });
  // Mark all backup codes as used (preserve the row for audit).
  const row = await db.setting.findUnique({ where: { id: "totpBackupCodes" } });
  if (row) {
    try {
      const parsed = JSON.parse(row.value);
      if (Array.isArray(parsed)) {
        const used = parsed.map((c: StoredBackupCode) => ({ ...c, used: true }));
        await db.setting.update({
          where: { id: "totpBackupCodes" },
          data: { value: JSON.stringify(used) },
        });
      }
    } catch {
      /* ignore parse errors */
    }
  }
}
