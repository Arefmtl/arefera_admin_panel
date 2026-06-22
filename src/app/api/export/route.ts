import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/export?type=<scheduled|logs|audit|templates|channels>&format=<json|csv>
 *
 * Returns a downloadable dataset for offline analysis / backup. CSV is
 * generated server-side so we don't pull the entire dataset through the
 * browser if it grows large.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const type = url.searchParams.get("type") || "scheduled";
  const format = url.searchParams.get("format") || "json";

  let rows: Record<string, unknown>[] = [];
  let filename = "export";

  switch (type) {
    case "scheduled": {
      const msgs = await db.scheduledMessage.findMany({
        orderBy: { createdAt: "desc" },
      });
      rows = msgs.map((m) => ({
        id: m.id,
        title: m.title,
        text: m.text,
        format: m.format,
        buttons: m.buttons,
        channelIds: m.channelIds,
        scheduledAt: m.scheduledAt,
        repeat: m.repeat,
        status: m.status,
        lastRunAt: m.lastRunAt,
        nextRunAt: m.nextRunAt,
        error: m.error,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      }));
      filename = "scheduled-messages";
      break;
    }
    case "logs": {
      const logs = await db.scheduledMessageLog.findMany({
        orderBy: { ranAt: "desc" },
        take: 1000,
        include: { message: { select: { title: true } }, channel: { select: { title: true } } },
      });
      rows = logs.map((l) => ({
        id: l.id,
        messageId: l.messageId,
        messageTitle: l.message?.title ?? null,
        channelId: l.channelId,
        channelTitle: l.channel?.title ?? null,
        success: l.success,
        error: l.error,
        ranAt: l.ranAt,
      }));
      filename = "delivery-logs";
      break;
    }
    case "audit": {
      const logs = await db.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 1000,
      });
      rows = logs.map((l) => ({
        id: l.id,
        action: l.action,
        entity: l.entity,
        entityId: l.entityId,
        title: l.title,
        detail: l.detail,
        actor: l.actor,
        meta: l.meta,
        createdAt: l.createdAt,
      }));
      filename = "audit-logs";
      break;
    }
    case "templates": {
      const tpls = await db.template.findMany({
        orderBy: { createdAt: "desc" },
      });
      rows = tpls.map((t) => ({
        id: t.id,
        name: t.name,
        text: t.text,
        format: t.format,
        buttons: t.buttons,
        category: t.category,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      }));
      filename = "templates";
      break;
    }
    case "channels": {
      const chs = await db.channel.findMany({
        orderBy: { createdAt: "desc" },
      });
      rows = chs.map((c) => ({
        id: c.id,
        telegramId: c.telegramId,
        title: c.title,
        username: c.username,
        type: c.type,
        active: c.active,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      }));
      filename = "channels";
      break;
    }
    default:
      return NextResponse.json({ error: `Unknown export type: ${type}` }, { status: 400 });
  }

  if (format === "csv") {
    const csv = toCSV(rows);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}.csv"`,
      },
    });
  }

  // JSON
  return new NextResponse(JSON.stringify(rows, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.json"`,
    },
  });
}

/**
 * Convert an array of records to a CSV string. Handles nested objects by
 * JSON-stringifying them, and properly escapes quotes / commas / newlines.
 */
function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]);
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    let s = typeof v === "object" ? JSON.stringify(v) : String(v);
    if (/[",\n\r]/.test(s)) {
      s = `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const header = cols.map(escape).join(",");
  const body = rows
    .map((r) => cols.map((c) => escape((r as Record<string, unknown>)[c])).join(","))
    .join("\n");
  return `${header}\n${body}`;
}
