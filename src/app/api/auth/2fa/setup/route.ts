import { NextResponse } from "next/server";
import { requireAuth, getClientIp } from "@/lib/auth";
import { audit } from "@/lib/audit";
import {
  generateSecret,
  generateQRCodeURI,
  generateBackupCodes,
  setTotpSecret,
  setTotpEnabled,
  isTotpEnabled,
} from "@/lib/totp";
import QRCode from "qrcode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/2fa/setup
 *
 * Generates a new TOTP secret + 8 backup codes and stores them in the Setting
 * table. 2FA is NOT yet enabled — the user must verify a TOTP code via
 * `/api/auth/2fa/verify` to actually turn it on. Returns the secret, an
 * `otpauth://` QR code URI, a pre-rendered PNG data URL of the QR code (so
 * the client doesn't need a QR library), and the raw backup codes (only shown
 * once).
 *
 * If 2FA is already enabled, returns 400 (call `/api/auth/2fa/disable` first).
 */
export async function POST(req: Request) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Refuse to regenerate the secret while 2FA is already enabled — otherwise
  // an attacker who briefly gains access could silently swap the secret.
  if (await isTotpEnabled()) {
    return NextResponse.json(
      { error: "2FA is already enabled. Disable it first to regenerate the secret." },
      { status: 400 },
    );
  }

  const secret = generateSecret();
  await setTotpSecret(secret);
  // Make sure the enabled flag is false — the user must verify a code before
  // 2FA actually turns on.
  await setTotpEnabled(false);
  // Generate fresh backup codes (overwrites any existing ones). The raw codes
  // are returned to the client — the server only stores the SHA-256 hashes.
  const backupCodes = await generateBackupCodes(secret);
  const qrCodeURI = generateQRCodeURI(secret, "admin");
  // Pre-render the QR code as a PNG data URL. The client just embeds this in
  // an <img src="..."> tag — no QR library needed in the browser bundle.
  let qrCodeDataUrl: string | null = null;
  try {
    qrCodeDataUrl = await QRCode.toDataURL(qrCodeURI, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 240,
      color: { dark: "#0f172a", light: "#ffffff" },
    });
  } catch (e) {
    console.error("[2fa/setup] failed to render QR code:", e);
  }

  await audit("settings", "auth", {
    title: "2FA setup initiated",
    detail: "Admin generated a new TOTP secret (not yet enabled)",
    actor: "admin",
    ip: getClientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  }).catch(() => {});

  return NextResponse.json({
    secret,
    qrCodeURI,
    qrCodeDataUrl,
    backupCodes,
  });
}

