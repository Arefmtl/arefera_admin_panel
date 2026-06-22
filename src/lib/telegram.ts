import { db } from "./db";

/**
 * Server-side Telegram Bot API helper.
 * The bot token is stored in the Setting table (key: "bot_token") so it can be
 * configured from the admin UI. Falls back to the env var TELEGRAM_BOT_TOKEN.
 */

const TOKEN_KEY = "bot_token";

export async function getBotToken(): Promise<string | null> {
  const row = await db.setting.findUnique({ where: { id: TOKEN_KEY } });
  if (row?.value) return row.value;
  return process.env.TELEGRAM_BOT_TOKEN || null;
}

export async function setBotToken(token: string): Promise<void> {
  await db.setting.upsert({
    where: { id: TOKEN_KEY },
    update: { value: token.trim() },
    create: { id: TOKEN_KEY, value: token.trim() },
  });
}

export async function getSetting(key: string, fallback = ""): Promise<string> {
  const row = await db.setting.findUnique({ where: { id: key } });
  return row?.value ?? fallback;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.setting.upsert({
    where: { id: key },
    update: { value },
    create: { id: key, value },
  });
}

async function tgFetch(token: string, method: string, body: unknown) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({ ok: false }));
  return json as { ok: boolean; description?: string; result?: unknown };
}

export type TgResult = { ok: boolean; description?: string; result?: unknown };

/** Get information about the bot (used to test the token). */
export async function getMe(token?: string): Promise<TgResult> {
  const t = token ?? (await getBotToken());
  if (!t) return { ok: false, description: "No bot token configured." };
  return tgFetch(t, "getMe", {});
}

/** Fetch chat info (used when adding a channel to validate + resolve title). */
export async function getChat(token: string, chatId: string | number): Promise<TgResult> {
  return tgFetch(token, "getChat", { chat_id: chatId });
}

/**
 * Send a rich message (Markdown or HTML) to a chat. We use the standard
 * sendMessage endpoint with parse_mode, plus an optional inline keyboard.
 */
export async function sendRichMessage(
  token: string,
  chatId: string | number,
  text: string,
  format: "markdown" | "html",
  buttons?: { text: string; url: string }[][],
): Promise<TgResult> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: format === "html" ? "HTML" : "MarkdownV2",
    disable_web_page_preview: false,
  };
  if (buttons && buttons.length > 0) {
    body.reply_markup = { inline_keyboard: buttons };
  }
  return tgFetch(token, "sendMessage", body);
}

/**
 * MarkdownV2 requires escaping a set of special characters. This is a best
 * effort escaper so admin-written plain markdown still sends cleanly. If the
 * caller writes raw HTML we send it as-is.
 */
export function escapeMarkdownV2(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (m) => `\\${m}`);
}

/**
 * Send a single test message to a single chat. Reuses the existing
 * `sendRichMessage` helper so behavior (parse_mode + inline keyboard) is
 * identical to the real broadcast path. Intentionally NOT wrapped in a
 * try/catch — callers should let any error bubble up with a clear message
 * (the route handler catches and reports it).
 *
 * The optional `overrideChatId` parameter lets callers override the target
 * chat id without changing the function signature for existing callers —
 * used by the channel "Send test" action to send to the channel's own
 * `telegramId` regardless of the configured `testChatId` default.
 */
export async function sendTestMessage(
  token: string,
  chatId: string | number,
  text: string,
  format: "markdown" | "html",
  buttons?: { text: string; url: string }[][],
  overrideChatId?: string | number,
): Promise<TgResult> {
  const target = overrideChatId ?? chatId;
  return sendRichMessage(token, target, text, format, buttons);
}

/**
 * Resolve the bot token from the Setting table (or env fallback). Returns
 * null if no token is configured — callers should surface a friendly
 * "Bot token not configured" error to the user in that case.
 */
export async function resolveBotToken(): Promise<string | null> {
  return getBotToken();
}

/**
 * Send a test message to a specific registered channel by its database id.
 * Used by the "Send test" action on channel cards. Looks up the channel's
 * `telegramId` and forwards a short test message to it.
 *
 * Returns `{ ok, success, error?, messageId? }`. The `success` flag mirrors
 * `ok` for ergonomic frontend consumption; both are included because some
 * callers expect `ok` (HTTP-ish) and others expect `success` (action-ish).
 *
 * Throws only on transport-level failures — the caller is responsible for
 * catching and converting to a 500 response.
 */
export async function sendTestToChannel(
  channelId: string,
): Promise<{ ok: boolean; success: boolean; error?: string; messageId?: number | null }> {
  const { db } = await import("./db");
  const channel = await db.channel.findUnique({ where: { id: channelId } });
  if (!channel) {
    return { ok: false, success: false, error: "Channel not found" };
  }
  const token = await getBotToken();
  if (!token) {
    return { ok: false, success: false, error: "Bot token not configured" };
  }
  // Compose a friendly test message identifying the channel by title.
  const text = `🧪 Test message from the Telegram Bot Admin Panel.\n\nThis confirms the bot can post to *${escapeMarkdownV2(
    channel.title,
  )}*.\n\n_Channel:_ ${escapeMarkdownV2(channel.title)}\n_Sent:_ ${new Date().toISOString()}`;
  const res = await sendRichMessage(token, channel.telegramId, text, "markdown");
  if (!res.ok) {
    return {
      ok: false,
      success: false,
      error: res.description || "Telegram API error",
    };
  }
  const result = (res.result ?? {}) as { message_id?: number };
  return {
    ok: true,
    success: true,
    messageId: result.message_id ?? null,
  };
}
