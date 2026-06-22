import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getBotToken, sendRichMessage } from "@/lib/telegram";
import { audit } from "@/lib/audit";
import { substituteVariables } from "@/lib/scheduler";

/**
 * POST /api/posts/send
 * Body: { text, format, buttons, channelIds }
 * Sends a one-off broadcast immediately to the chosen channels and records
 * the post in history. Returns per-channel results.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || !body.text) {
    return NextResponse.json({ error: "Message text is required" }, { status: 400 });
  }
  const channelIds: string[] = Array.isArray(body.channelIds) ? body.channelIds : [];
  if (channelIds.length === 0) {
    return NextResponse.json({ error: "Select at least one channel" }, { status: 400 });
  }

  const token = await getBotToken();
  if (!token) {
    return NextResponse.json({ error: "Bot token not configured" }, { status: 400 });
  }

  const channels = await db.channel.findMany({ where: { id: { in: channelIds } } });
  const buttons = body.buttons || undefined;
  const format = body.format === "html" ? "html" : "markdown";
  const now = new Date();

  // Save to post history.
  await db.post.create({
    data: {
      text: body.text,
      format,
      buttons: buttons ? JSON.stringify(buttons) : null,
    },
  });

  const results: { title: string; ok: boolean; error?: string }[] = [];
  for (const ch of channels) {
    try {
      // Apply variable substitution per-channel so {{channel}} resolves to
      // the current channel title (and other variables work too).
      const finalText = substituteVariables(body.text, {
        channelTitle: ch.title,
        channelId: ch.telegramId,
        channelCount: channels.length,
        messageTitle: "Broadcast",
        now,
      });
      const res = await sendRichMessage(token, ch.telegramId, finalText, format, buttons);
      results.push({
        title: ch.title,
        ok: !!res.ok,
        error: res.ok ? undefined : res.description,
      });
    } catch (err) {
      results.push({
        title: ch.title,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  await audit("send", "broadcast", {
    title: body.text.slice(0, 60),
    detail: `Broadcast to ${channels.length} channel(s): ${okCount} ok, ${results.length - okCount} failed`,
    meta: {
      channelCount: channels.length,
      ok: okCount,
      failed: results.length - okCount,
      format,
      textPreview: String(body.text).slice(0, 120),
    },
  });

  return NextResponse.json({ results });
}
