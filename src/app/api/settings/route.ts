import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getBotToken, setBotToken } from "@/lib/telegram";
import { audit } from "@/lib/audit";
import { isAuthenticated, requireAuth } from "@/lib/auth";

/** GET /api/settings — returns non-secret settings + whether a token is set. */
export async function GET() {
  // If not authenticated, only reveal whether a panel password is configured
  // (so the login screen can show a hint). Everything else requires auth.
  const authed = await isAuthenticated();
  const token = await getBotToken();
  const rows = await db.setting.findMany();
  const settings: Record<string, string> = {};
  for (const r of rows) settings[r.id] = r.value;
  const hasPanelPassword = !!settings.panelPassword;
  // The `panelPasswordIsDefault` flag is created when the lazy default
  // password is first set. If the flag is missing we conservatively treat
  // the panel as still using the default (so the warning shows).
  const isDefaultPassword = settings.panelPasswordIsDefault !== "false";
  if (!authed) {
    return NextResponse.json({
      hasToken: !!token,
      tokenPreview: null,
      hasPanelPassword,
      settings: {},
    });
  }
  // SECURITY: never leak the panelPassword hash (or any other secret) to the
  // client. Only return non-secret flags + the bot token preview.
  const safeSettings: Record<string, string> = { ...settings };
  delete safeSettings.panelPassword;
  // Also strip TOTP-related secrets (the secret itself, the hashed backup
  // codes). The status endpoints (`/api/auth/2fa/status`) expose only the
  // boolean flags + a count, never the raw values.
  delete safeSettings.totpSecret;
  delete safeSettings.totpBackupCodes;
  return NextResponse.json({
    hasToken: !!token,
    tokenPreview: token ? `${token.slice(0, 8)}••••••${token.slice(-4)}` : null,
    hasPanelPassword,
    isDefaultPassword,
    settings: safeSettings,
  });
}

/** PUT /api/settings — update the bot token (and arbitrary key/values). */
export async function PUT(req: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  if (typeof body.botToken === "string") {
    const t = body.botToken.trim();
    if (t && !/^\d+:.+/.test(t)) {
      return NextResponse.json({ error: "Token format looks invalid (expected <id>:<hash>)" }, { status: 400 });
    }
    if (t) {
      await setBotToken(t);
      await audit("settings", "settings", {
        title: "Bot token updated",
        detail: `Bot token set (${t.slice(0, 8)}••••••${t.slice(-4)})`,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
