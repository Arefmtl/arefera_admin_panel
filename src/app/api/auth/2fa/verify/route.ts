import { NextResponse } from "next/server";
import { requireAuth, getClientIp } from "@/lib/auth";
import { audit } from "@/lib/audit";
import {
  verifyTOTP,
  getTotpSecret,
  setTotpEnabled,
  isTotpEnabled,
} from "@/lib/totp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/2fa/verify
 *
 * Verifies a 6-digit TOTP token against the stored secret. If valid, enables
 * 2FA (`totpEnabled = "true"`). This is the final step of the 2FA setup
 * flow — the user has scanned the QR code, generated codes in their
 * authenticator app, and is now proving they have the secret by entering a
 * current code.
 *
 * Body: `{ token: string }` (6 digits)
 */
export async function POST(req: Request) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (await isTotpEnabled()) {
    return NextResponse.json(
      { ok: false, error: "2FA is already enabled." },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => null);
  const token = (body?.token ?? "").toString().trim();
  if (!/^\d{6}$/.test(token)) {
    return NextResponse.json(
      { ok: false, error: "Token must be exactly 6 digits." },
      { status: 400 },
    );
  }

  const secret = await getTotpSecret();
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "No TOTP secret configured. Run setup first." },
      { status: 400 },
    );
  }

  if (!verifyTOTP(secret, token)) {
    await audit("settings", "auth", {
      title: "2FA verification failed",
      detail: "Admin entered an incorrect TOTP token during setup",
      actor: "admin",
      ip: getClientIp(req),
      userAgent: req.headers.get("user-agent") ?? undefined,
    }).catch(() => {});
    return NextResponse.json(
      { ok: false, error: "Invalid TOTP token. Make sure your device clock is correct." },
      { status: 400 },
    );
  }

  await setTotpEnabled(true);
  await audit("settings", "auth", {
    title: "2FA enabled",
    detail: "Admin verified a TOTP token — two-factor authentication is now active",
    actor: "admin",
    ip: getClientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
