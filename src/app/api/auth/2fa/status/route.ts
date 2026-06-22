import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { isTotpEnabled, getTotpSecret, countUnusedBackupCodes } from "@/lib/totp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/auth/2fa/status
 *
 * Returns the current 2FA configuration (no secrets). Used by the Settings
 * card to decide whether to show "Enable" or "Disable" + the remaining
 * backup-code count.
 *
 *   { enabled: boolean, hasSecret: boolean, backupCodesRemaining: number }
 */
export async function GET() {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [enabled, secret, backupCodesRemaining] = await Promise.all([
    isTotpEnabled(),
    getTotpSecret(),
    countUnusedBackupCodes(),
  ]);

  return NextResponse.json({
    enabled,
    hasSecret: !!secret,
    backupCodesRemaining,
  });
}
