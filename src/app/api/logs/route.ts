import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/logs — recent delivery logs.
 * Query params:
 *   - messageId: filter by message id
 *   - channelId: filter by channel id
 *   - since: ISO-date — only return entries with ranAt >= since
 *   - limit: max results (default 100, capped at 500)
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const messageId = url.searchParams.get("messageId");
  const channelId = url.searchParams.get("channelId");
  const sinceRaw = url.searchParams.get("since");
  const since = sinceRaw ? new Date(sinceRaw) : undefined;
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100", 10) || 100, 500);

  const where: Record<string, unknown> = {};
  if (messageId) where.messageId = messageId;
  if (channelId) where.channelId = channelId;
  if (since && !Number.isNaN(since.getTime())) where.ranAt = { gte: since };

  const logs = await db.scheduledMessageLog.findMany({
    where,
    orderBy: { ranAt: "desc" },
    take: limit,
    include: { message: { select: { title: true } } },
  });
  return NextResponse.json(logs);
}
