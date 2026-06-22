import { NextResponse } from "next/server";
import { verify2FALogin, getClientIp, checkRateLimit, recordFailedLogin, recordSuccessfulLogin } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/login/2fa
 *
 * Completes the 2FA login flow. The client POSTs the tempToken (returned by
 * `/api/auth/login` when 2FA is enabled) plus a TOTP code (or backup code).
 * On success, the session cookie is issued and the client can navigate to
 * the panel.
 *
 * Body: `{ tempToken: string, token: string }`
 *
 * Rate-limited per IP — but with a slightly looser window than the password
 * login (the password is already verified at this stage, so this is just to
 * stop brute-forcing the 6-digit TOTP code, which has only 1M combinations).
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const tempToken = (body?.tempToken ?? "").toString();
  const token = (body?.token ?? "").toString().trim();
  if (!tempToken || !token) {
    return NextResponse.json(
      { error: "tempToken and token are required." },
      { status: 400 },
    );
  }

  // Per-IP rate limit on 2FA attempts. Reuse the same `checkRateLimit`
  // machinery as the password login — same 5-per-60s window.
  const ip = getClientIp(req);
  const rate = checkRateLimit(ip);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many attempts", retryAfterSeconds: rate.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const ok = await verify2FALogin(tempToken, token, {
    ip,
    userAgent: req.headers.get("user-agent") ?? null,
  });
  if (!ok) {
    recordFailedLogin(ip);
    await audit("login", "auth", {
      title: "Failed 2FA login",
      detail: "Invalid TOTP token or backup code",
      actor: "anonymous",
      ip,
      userAgent: req.headers.get("user-agent") ?? undefined,
    }).catch(() => {});
    return NextResponse.json(
      { error: "Invalid 2FA code. Try again." },
      { status: 401 },
    );
  }
  recordSuccessfulLogin(ip);
  await audit("login", "auth", {
    title: "Panel login (2FA)",
    detail: "Admin completed two-factor authentication",
    actor: "admin",
    ip,
    userAgent: req.headers.get("user-agent") ?? undefined,
  }).catch(() => {});
  return NextResponse.json({ ok: true });
}
