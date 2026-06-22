import { NextResponse } from "next/server";
import {
  login,
  checkRateLimit,
  recordFailedLogin,
  recordSuccessfulLogin,
  getClientIp,
} from "@/lib/auth";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { password?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* ignore */
  }
  const password = body.password ?? "";
  if (!password) {
    return NextResponse.json({ error: "Password required" }, { status: 400 });
  }

  // Brute-force protection: enforce per-IP rate limit BEFORE we even check
  // the password. This ensures an attacker can't grind through thousands of
  // guesses from a single IP.
  const ip = getClientIp(req);
  const rate = checkRateLimit(ip);
  if (!rate.allowed) {
    // Record this as a rate-limited (rejected) attempt in the audit log so
    // admins can spot brute-force patterns. We don't increment the counter
    // again here — it's already at the limit.
    await audit("login", "auth", {
      title: "Login rate-limited",
      detail: `Too many failed attempts from ${ip}`,
      actor: "anonymous",
      ip,
      userAgent: req.headers.get("user-agent") ?? undefined,
    }).catch(() => {});
    return NextResponse.json(
      { error: "Too many attempts", retryAfterSeconds: rate.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const result = await login(password, {
    ip,
    userAgent: req.headers.get("user-agent") ?? null,
  });
  if (!result.ok) {
    // If 2FA is enabled and the password was correct, return a special flag
    // so the client can prompt for a TOTP code. The tempToken is short-lived
    // (5 min) and only valid for the `/api/auth/login/2fa` endpoint.
    if (result.requires2FA) {
      // Don't record this as a "failed login" — the password was correct.
      // We do reset the rate-limit counter so the user can't be locked out
      // by repeatedly typing the correct password.
      recordSuccessfulLogin(ip);
      return NextResponse.json({
        ok: false,
        requires2FA: true,
        tempToken: result.tempToken,
      });
    }
    recordFailedLogin(ip);
    await audit("login", "auth", {
      title: "Failed login attempt",
      detail: "Invalid panel password",
      actor: "anonymous",
      ip,
      userAgent: req.headers.get("user-agent") ?? undefined,
    }).catch(() => {});
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }
  recordSuccessfulLogin(ip);
  await audit("login", "auth", {
    title: "Panel login",
    detail: "Admin signed in to the panel",
    actor: "admin",
    ip,
    userAgent: req.headers.get("user-agent") ?? undefined,
  }).catch(() => {});
  return NextResponse.json({ ok: true });
}
