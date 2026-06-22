import { NextRequest, NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/telegram";
import { requireAuth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";

/**
 * Test chat configuration — the default chat ID the bot sends test
 * messages to (used by "Send test" buttons across the panel).
 *
 * GET    /api/settings/test-chat → { testChatId: string | null }
 * POST   /api/settings/test-chat body { chatId: string } → { ok, testChatId }
 * DELETE /api/settings/test-chat → { ok }
 *
 * Stored in the Setting table under key "testChatId".
 */

const KEY = "testChatId";

export async function GET() {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const value = (await getSetting(KEY, "")).trim();
  return NextResponse.json({ testChatId: value || null });
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body.chatId !== "string") {
    return NextResponse.json({ error: "chatId is required" }, { status: 400 });
  }
  const chatId = body.chatId.trim();
  if (!chatId) {
    return NextResponse.json({ error: "chatId cannot be empty" }, { status: 400 });
  }
  await setSetting(KEY, chatId);
  await audit("settings", "settings", {
    title: "Test chat configured",
    detail: `Default test chat ID set to ${chatId}`,
    meta: { key: KEY },
  });
  return NextResponse.json({ ok: true, testChatId: chatId });
}

export async function DELETE() {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Only delete if it exists — db.setting.delete throws P2025 if missing.
  const existing = await db.setting.findUnique({ where: { id: KEY } });
  if (existing) {
    await db.setting.delete({ where: { id: KEY } });
  }
  await audit("settings", "settings", {
    title: "Test chat cleared",
    detail: "Default test chat ID removed",
    meta: { key: KEY, cleared: true },
  });
  return NextResponse.json({ ok: true });
}
