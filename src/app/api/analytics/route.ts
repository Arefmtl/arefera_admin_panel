import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/analytics
 * Returns aggregated analytics for the Analytics section.
 *
 * - successRate trend (last 14 days, % of successful deliveries)
 * - hourly heatmap (sent vs failed by hour of day, last 30 days)
 * - channel matrix (per-channel: sent / failed / success-rate / last delivery)
 * - top messages (by delivery count, last 30 days)
 * - error breakdown (most common error strings, last 30 days)
 * - repeat performance (avg success rate by repeat type)
 *
 * Results are memoized for 60 seconds to avoid hammering Prisma with ~30
 * queries on every dashboard reload.
 */

type AnalyticsPayload = {
  range: { from: string; to: string };
  totals: {
    totalLogs: number;
    totalSent: number;
    totalFailed: number;
    overallRate: number | null;
    totalScheduled: number;
    pendingScheduled: number;
  };
  trend: { date: string; total: number; sent: number; failed: number; rate: number }[];
  hourly: { hour: number; sent: number; failed: number }[];
  channelMatrix: {
    id: string;
    title: string;
    active: boolean;
    sent: number;
    failed: number;
    total: number;
    rate: number | null;
    lastAt: string | null;
  }[];
  topMessages: {
    id: string;
    title: string;
    status: string;
    repeat: string;
    deliveries: number;
  }[];
  errorBreakdown: { error: string; count: number }[];
  repeatPerformance: {
    repeat: string;
    sent: number;
    failed: number;
    total: number;
    rate: number | null;
  }[];
};

// Module-level cache — survives across requests in the same server process.
let __cache: { at: number; data: AnalyticsPayload } | null = null;
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

export async function GET(req: NextRequest) {
  // Allow callers to bypass the cache with ?fresh=1 (e.g. the Refresh button).
  const url = new URL(req.url);
  const fresh = url.searchParams.get("fresh") === "1";
  if (!fresh && __cache && Date.now() - __cache.at < CACHE_TTL_MS) {
    return NextResponse.json({
      ...__cache.data,
      _cached: true,
      _cacheAge: Math.round((Date.now() - __cache.at) / 1000),
      computedAt: new Date(__cache.at).toISOString(),
    });
  }

  const data = await computeAnalytics();
  const computedAt = new Date().toISOString();
  __cache = { at: Date.now(), data };
  return NextResponse.json({
    ...data,
    _cached: false,
    _cacheAge: 0,
    computedAt,
  });
}

async function computeAnalytics(): Promise<AnalyticsPayload> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // 1) Success rate trend (last 14 days)
  const trend: { date: string; total: number; sent: number; failed: number; rate: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - i);
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    const [sent, failed] = await Promise.all([
      db.scheduledMessageLog.count({
        where: { success: true, ranAt: { gte: day, lt: next } },
      }),
      db.scheduledMessageLog.count({
        where: { success: false, ranAt: { gte: day, lt: next } },
      }),
    ]);
    const total = sent + failed;
    trend.push({
      date: day.toISOString().slice(5, 10),
      total,
      sent,
      failed,
      rate: total === 0 ? 0 : Math.round((sent / total) * 100),
    });
  }

  // 2) Hourly heatmap (24 buckets, last 30 days)
  const hourly: { hour: number; sent: number; failed: number }[] = Array.from(
    { length: 24 },
    (_, h) => ({ hour: h, sent: 0, failed: 0 }),
  );
  const allLogs = await db.scheduledMessageLog.findMany({
    where: { ranAt: { gte: thirtyDaysAgo } },
    select: { success: true, ranAt: true },
  });
  for (const log of allLogs) {
    const h = log.ranAt.getHours();
    if (log.success) hourly[h].sent += 1;
    else hourly[h].failed += 1;
  }

  // 3) Channel matrix (last 30 days)
  const channels = await db.channel.findMany({
    include: {
      logs: {
        where: { ranAt: { gte: thirtyDaysAgo } },
        select: { success: true, ranAt: true },
        orderBy: { ranAt: "desc" },
      },
    },
  });
  const channelMatrix = channels
    .map((ch) => {
      const sent = ch.logs.filter((l) => l.success).length;
      const failed = ch.logs.filter((l) => !l.success).length;
      const total = sent + failed;
      const lastAt = ch.logs[0]?.ranAt ?? null;
      return {
        id: ch.id,
        title: ch.title,
        active: ch.active,
        sent,
        failed,
        total,
        rate: total === 0 ? null : Math.round((sent / total) * 100),
        lastAt: lastAt ? lastAt.toISOString() : null,
      };
    })
    .sort((a, b) => b.total - a.total);

  // 4) Top messages by delivery count (last 30 days)
  const topMessageLogs = await db.scheduledMessageLog.findMany({
    where: { ranAt: { gte: thirtyDaysAgo } },
    select: { messageId: true },
  });
  const topCountMap = new Map<string, number>();
  for (const log of topMessageLogs) {
    topCountMap.set(log.messageId, (topCountMap.get(log.messageId) || 0) + 1);
  }
  const topMessageIds = Array.from(topCountMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([id]) => id);
  const topMessageMeta = await db.scheduledMessage.findMany({
    where: { id: { in: topMessageIds } },
    select: { id: true, title: true, status: true, repeat: true },
  });
  const topMessages = topMessageIds.map((id) => {
    const meta = topMessageMeta.find((m) => m.id === id);
    return {
      id,
      title: meta?.title || "(deleted message)",
      status: meta?.status || "unknown",
      repeat: meta?.repeat || "none",
      deliveries: topCountMap.get(id) || 0,
    };
  });

  // 5) Error breakdown (top error strings, last 30 days)
  const errorLogs = await db.scheduledMessageLog.findMany({
    where: { success: false, ranAt: { gte: thirtyDaysAgo }, NOT: { error: null } },
    select: { error: true },
    take: 1000,
  });
  const errorMap = new Map<string, number>();
  for (const log of errorLogs) {
    if (!log.error) continue;
    // Bucket similar errors by taking the first 80 chars
    const key = log.error.slice(0, 80);
    errorMap.set(key, (errorMap.get(key) || 0) + 1);
  }
  const errorBreakdown = Array.from(errorMap.entries())
    .map(([error, count]) => ({ error, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  // 6) Repeat performance
  const repeatTypes = ["none", "daily", "weekly", "monthly"] as const;
  const repeatPerformance: { repeat: string; sent: number; failed: number; total: number; rate: number | null }[] = [];
  for (const repeat of repeatTypes) {
    const messages = await db.scheduledMessage.findMany({
      where: { repeat },
      select: { id: true },
    });
    const ids = messages.map((m) => m.id);
    if (ids.length === 0) {
      repeatPerformance.push({ repeat, sent: 0, failed: 0, total: 0, rate: null });
      continue;
    }
    const [sent, failed] = await Promise.all([
      db.scheduledMessageLog.count({ where: { success: true, messageId: { in: ids } } }),
      db.scheduledMessageLog.count({ where: { success: false, messageId: { in: ids } } }),
    ]);
    const total = sent + failed;
    repeatPerformance.push({
      repeat,
      sent,
      failed,
      total,
      rate: total === 0 ? null : Math.round((sent / total) * 100),
    });
  }

  // 7) Totals
  const [totalLogs, totalSent, totalFailed, totalScheduled, pendingScheduled] = await Promise.all([
    db.scheduledMessageLog.count(),
    db.scheduledMessageLog.count({ where: { success: true } }),
    db.scheduledMessageLog.count({ where: { success: false } }),
    db.scheduledMessage.count(),
    db.scheduledMessage.count({ where: { status: "pending" } }),
  ]);

  return {
    range: { from: thirtyDaysAgo.toISOString(), to: now.toISOString() },
    totals: {
      totalLogs,
      totalSent,
      totalFailed,
      overallRate: totalLogs === 0 ? null : Math.round((totalSent / totalLogs) * 100),
      totalScheduled,
      pendingScheduled,
    },
    trend,
    hourly,
    channelMatrix,
    topMessages,
    errorBreakdown,
    repeatPerformance,
  };
}
