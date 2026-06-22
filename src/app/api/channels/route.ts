import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getBotToken, getChat } from "@/lib/telegram";
import { audit } from "@/lib/audit";

export async function GET() {
  const channels = await db.channel.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(channels);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || !body.telegramId) {
    return NextResponse.json({ error: "Channel ID or @username is required" }, { status: 400 });
  }
  const raw = String(body.telegramId).trim();

  const token = await getBotToken();
  if (!token) {
    return NextResponse.json(
      { error: "Bot token not configured. Add it in Settings first." },
      { status: 400 },
    );
  }

  const chatIdArg: string | number = /^-?\d+$/.test(raw) ? Number(raw) : raw;
  const info = await getChat(token, chatIdArg);
  if (!info.ok) {
    return NextResponse.json(
      { error: info.description || "Could not fetch channel info. Make sure the bot is an admin of the channel." },
      { status: 400 },
    );
  }
  const result = info.result as { id: number; title?: string; username?: string; type?: string };
  const telegramId = String(result.id);
  const existing = await db.channel.findUnique({ where: { telegramId } });
  if (existing) {
    return NextResponse.json({ error: "This channel is already registered" }, { status: 409 });
  }

  const created = await db.channel.create({
    data: {
      telegramId,
      title: result.title || result.username || raw,
      username: result.username || null,
      type: result.type || "channel",
    },
  });
  await audit("create", "channel", {
    entityId: created.id,
    title: created.title,
    detail: `Added channel \"${created.title}\" (${created.type})`,
    meta: { type: created.type, username: created.username },
  });
  return NextResponse.json(created, { status: 201 });
}
