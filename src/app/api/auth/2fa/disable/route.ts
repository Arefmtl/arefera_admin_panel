import { NextResponse } from "next/server";
import { requireAuth, getClientIp, verifyPanelPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { clearTotp, isTotpEnabled } from "@/lib/totp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/2fa/disable
 *
 * Disables 2FA. Requires re-entering the panel password (defends against an
 * attacker who briefly gains panel access from disabling 2FA). Clears the
 * stored TOTP secret and marks all backup codes as used.
 *
 * Body: `{ password: string }`
 */
export async function POST(req: Request) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const password = (body?.password ?? "").toString();
  if (!password) {
    return NextResponse.json(
      { ok: false, error: "Password required to disable 2FA." },
      { status: 400 },
    );
  }

  // Re-verify the panel password. This is the critical security check —
  // without it, anyone with a momentary session could disable 2FA.
  if (!(await verifyPanelPassword(password))) {
    await audit("settings", "auth", {
      title: "2FA disable attempt — wrong password",
      detail: "Admin entered an incorrect password when disabling 2FA",
      actor: "admin",
      ip: getClientIp(req),
      userAgent: req.headers.get("user-agent") ?? undefined,
    }).catch(() => {});
    return NextResponse.json(
      { ok: false, error: "Incorrect password." },
      { status: 401 },
    );
  }

  const wasEnabled = await isTotpEnabled();
  await clearTotp();

  await audit("settings", "auth", {
    title: "2FA disabled",
    detail: wasEnabled
      ? "Admin re-entered the panel password and disabled two-factor authentication"
      : "Admin cleared an un-enabled TOTP secret",
    actor: "admin",
    ip: getClientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
