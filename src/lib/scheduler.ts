import { db } from "./db";
import { getBotToken, sendRichMessage } from "./telegram";

export type SchedulerRunResult = {
  processed: number;
  sent: number;
  failed: number;
  details: {
    id: string;
    title: string;
    ok: boolean;
    channels: { title: string; ok: boolean; error?: string }[];
  }[];
};

function parseButtons(raw?: string | null): { text: string; url: string }[][] | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return undefined;
  } catch {
    return undefined;
  }
}

function parseChannelIds(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as string[];
  } catch {
    /* ignore */
  }
  return [];
}

function computeNextRun(from: Date, repeat: string): Date | null {
  const next = new Date(from);
  switch (repeat) {
    case "daily":
      next.setDate(next.getDate() + 1);
      return next;
    case "weekly":
      next.setDate(next.getDate() + 7);
      return next;
    case "monthly":
      next.setMonth(next.getMonth() + 1);
      return next;
    default:
      return null;
  }
}

/**
 * Substitute template variables in a message body. Supports:
 *   {{channel}}    — the target channel title (per-channel)
 *   {{channel_id}} — the target channel telegram id (per-channel)
 *   {{date}}       — current date (e.g. "21 Jun 2026")
 *   {{time}}       — current time (e.g. "14:32")
 *   {{datetime}}   — current date + time
 *   {{weekday}}    — current weekday name (e.g. "Saturday")
 *   {{count}}      — number of target channels for this send
 *   {{message_title}} — the scheduled message's own title
 *   {{bot}}        — placeholder, replaced only if token resolves (else "this bot")
 *
 * Variables are case-insensitive. Unknown placeholders are left as-is.
 */
export function substituteVariables(
  text: string,
  ctx: {
    channelTitle: string;
    channelId: string;
    channelCount: number;
    messageTitle: string;
    now: Date;
  },
): string {
  const dateStr = ctx.now.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const timeStr = ctx.now.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const datetimeStr = `${dateStr} ${timeStr}`;
  const weekdayStr = ctx.now.toLocaleDateString("en-GB", { weekday: "long" });

  return text.replace(/\{\{\s*([^}]+?)\s*\}\}/gi, (full, key: string) => {
    const k = key.trim().toLowerCase();
    switch (k) {
      case "channel":
      case "channel_title":
      case "channeltitle":
        return ctx.channelTitle;
      case "channel_id":
      case "channelid":
        return ctx.channelId;
      case "date":
        return dateStr;
      case "time":
        return timeStr;
      case "datetime":
      case "timestamp":
        return datetimeStr;
      case "weekday":
      case "day":
        return weekdayStr;
      case "count":
      case "channel_count":
        return String(ctx.channelCount);
      case "message_title":
      case "title":
      case "messagetitle":
        return ctx.messageTitle;
      default:
        return full; // leave unknown placeholders intact
    }
  });
}

/**
 * Process all scheduled messages that are due right now.
 * Safe to call repeatedly — it only picks up messages whose next/scheduled
 * run time has passed. Returns a summary of what happened.
 */
export async function runScheduler(): Promise<SchedulerRunResult> {
  const now = new Date();
  const result: SchedulerRunResult = { processed: 0, sent: 0, failed: 0, details: [] };

  const token = await getBotToken();

  // Find due messages: status pending, and either nextRunAt <= now OR
  // (nextRunAt null and scheduledAt <= now).
  const due = await db.scheduledMessage.findMany({
    where: {
      status: "pending",
      AND: [
        {
          OR: [{ nextRunAt: { lte: now } }, { nextRunAt: null, scheduledAt: { lte: now } }],
        },
      ],
    },
    orderBy: { scheduledAt: "asc" },
  });

  for (const msg of due) {
    result.processed += 1;
    const channelIds = parseChannelIds(msg.channelIds);
    const channels = await db.channel.findMany({ where: { id: { in: channelIds } } });

    const channelsReport: { title: string; ok: boolean; error?: string }[] = [];
    let allOk = true;

    if (channels.length === 0) {
      allOk = false;
      channelsReport.push({ title: "(no channels)", ok: false, error: "No target channels" });
    }

    const buttons = parseButtons(msg.buttons);
    const channelCount = channels.length;

    for (const ch of channels) {
      if (!token) {
        channelsReport.push({ title: ch.title, ok: false, error: "No bot token configured" });
        allOk = false;
        continue;
      }
      try {
        // Apply variable substitution per-channel so {{channel}} resolves
        // to the current channel's title.
        const finalText = substituteVariables(msg.text, {
          channelTitle: ch.title,
          channelId: ch.telegramId,
          channelCount,
          messageTitle: msg.title,
          now,
        });
        const res = await sendRichMessage(token, ch.telegramId, finalText, msg.format as "markdown" | "html", buttons);
        const ok = !!res.ok;
        channelsReport.push({
          title: ch.title,
          ok,
          error: ok ? undefined : res.description || "Telegram API error",
        });
        // Persist a per-channel log row.
        await db.scheduledMessageLog.create({
          data: {
            messageId: msg.id,
            channelId: ch.id,
            channelTitle: ch.title,
            success: ok,
            error: ok ? null : res.description || "Telegram API error",
          },
        });
        if (!ok) allOk = false;
      } catch (err) {
        channelsReport.push({
          title: ch.title,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
        await db.scheduledMessageLog.create({
          data: {
            messageId: msg.id,
            channelId: ch.id,
            channelTitle: ch.title,
            success: false,
            error: err instanceof Error ? err.message : String(err),
          },
        });
        allOk = false;
      }
    }

    if (allOk) result.sent += 1;
    else result.failed += 1;

    // Update the scheduled message.
    const next = computeNextRun(now, msg.repeat);
    if (next) {
      // Repeating message: keep pending, schedule next run.
      await db.scheduledMessage.update({
        where: { id: msg.id },
        data: {
          lastRunAt: now,
          nextRunAt: next,
          status: "pending",
          error: allOk ? null : "Some channels failed (see logs)",
        },
      });
    } else {
      // One-off message: mark sent or failed.
      await db.scheduledMessage.update({
        where: { id: msg.id },
        data: {
          lastRunAt: now,
          nextRunAt: null,
          status: allOk ? "sent" : "failed",
          error: allOk ? null : "Some channels failed (see logs)",
        },
      });
    }

    result.details.push({ id: msg.id, title: msg.title, ok: allOk, channels: channelsReport });
  }

  return result;
}

/** Count of messages waiting to fire — used by the dashboard. */
export async function getPendingCount(): Promise<number> {
  return db.scheduledMessage.count({ where: { status: "pending" } });
}
