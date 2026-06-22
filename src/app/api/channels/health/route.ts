import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

const MS_DAY = 24 * 60 * 60 * 1000;
const MS_7DAYS = 7 * MS_DAY;

/**
 * GET /api/channels/health
 *
 * Returns per-channel operational health metrics:
 *   channelId, title, username, active,
 *   totalDeliveries, successfulDeliveries, failedDeliveries,
 *   successRate (0–100, null if no deliveries),
 *   lastDeliveryAt (ISO | null),
 *   lastFailureAt (ISO | null),
 *   lastErrorMessage (string | null),
 *   healthScore (0–100, weighted by successRate 70% + recency 30%),
 *   status ("healthy" | "degraded" | "critical" | "inactive").
 *
 * Defense in depth: `requireAuth()` is called even though middleware
 * already blocks unauthenticated `/api/*` traffic.
 */
export async function GET() {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Pull all channels — even those with zero deliveries show up so the
  // operator can spot never-delivered channels.
  const channels = await db.channel.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, username: true, active: true },
  });

  if (channels.length === 0) {
    return NextResponse.json([]);
  }

  const now = Date.now();
  const cutoff7d = new Date(now - MS_7DAYS);
  const cutoff14d = new Date(now - 2 * MS_7DAYS);
  const cutoff24h = new Date(now - MS_DAY);

  // Aggregate per-channel counts + last delivery timestamp.
  // Three groupBy queries (all / success / failed) plus a scan for the
  // most-recent failed log per channel (for the error message preview).
  // Also fetch current-7d and prior-7d success/total for trend, and
  // 24h error counts.
  const [allAgg, successAgg, failedAgg, recentFailedLogs, current7dAll, current7dSuccess, prior7dAll, prior7dSuccess, errors24h] = await Promise.all([
    db.scheduledMessageLog.groupBy({
      by: ["channelId"],
      _count: { _all: true },
      _max: { ranAt: true },
    }),
    db.scheduledMessageLog.groupBy({
      by: ["channelId"],
      where: { success: true },
      _count: { _all: true },
    }),
    db.scheduledMessageLog.groupBy({
      by: ["channelId"],
      where: { success: false },
      _count: { _all: true },
      _max: { ranAt: true },
    }),
    // Fetch failed logs ordered by ranAt desc — iterate and keep only the
    // first (most recent) per channelId. Capped at 2000 rows for safety.
    db.scheduledMessageLog.findMany({
      where: { success: false },
      orderBy: { ranAt: "desc" },
      select: { channelId: true, error: true, ranAt: true },
      take: 2000,
    }),
    // Current 7-day total deliveries per channel
    db.scheduledMessageLog.groupBy({
      by: ["channelId"],
      where: { ranAt: { gte: cutoff7d } },
      _count: { _all: true },
    }),
    // Current 7-day successful deliveries per channel
    db.scheduledMessageLog.groupBy({
      by: ["channelId"],
      where: { ranAt: { gte: cutoff7d }, success: true },
      _count: { _all: true },
    }),
    // Prior 7-day total deliveries per channel
    db.scheduledMessageLog.groupBy({
      by: ["channelId"],
      where: { ranAt: { gte: cutoff14d, lt: cutoff7d } },
      _count: { _all: true },
    }),
    // Prior 7-day successful deliveries per channel
    db.scheduledMessageLog.groupBy({
      by: ["channelId"],
      where: { ranAt: { gte: cutoff14d, lt: cutoff7d }, success: true },
      _count: { _all: true },
    }),
    // Errors in last 24h per channel
    db.scheduledMessageLog.groupBy({
      by: ["channelId"],
      where: { success: false, ranAt: { gte: cutoff24h } },
      _count: { _all: true },
    }),
  ]);

  const totalByChannel = new Map<string, number>();
  const lastDeliveryByChannel = new Map<string, Date>();
  for (const row of allAgg) {
    totalByChannel.set(row.channelId, row._count._all);
    if (row._max.ranAt) lastDeliveryByChannel.set(row.channelId, row._max.ranAt);
  }

  const successByChannel = new Map<string, number>();
  for (const row of successAgg) {
    successByChannel.set(row.channelId, row._count._all);
  }

  const failedByChannel = new Map<string, number>();
  const lastFailureAtByChannel = new Map<string, Date>();
  for (const row of failedAgg) {
    failedByChannel.set(row.channelId, row._count._all);
    if (row._max.ranAt) lastFailureAtByChannel.set(row.channelId, row._max.ranAt);
  }

  // First-seen-wins for the most-recent-failed-log error message per channel.
  const lastErrorByChannel = new Map<string, string | null>();
  for (const log of recentFailedLogs) {
    if (!lastErrorByChannel.has(log.channelId)) {
      lastErrorByChannel.set(log.channelId, log.error);
    }
  }

  // Build trend maps — current 7d vs prior 7d success rate comparison.
  const current7dTotalMap = new Map<string, number>();
  for (const row of current7dAll) current7dTotalMap.set(row.channelId, row._count._all);
  const current7dSuccessMap = new Map<string, number>();
  for (const row of current7dSuccess) current7dSuccessMap.set(row.channelId, row._count._all);
  const prior7dTotalMap = new Map<string, number>();
  for (const row of prior7dAll) prior7dTotalMap.set(row.channelId, row._count._all);
  const prior7dSuccessMap = new Map<string, number>();
  for (const row of prior7dSuccess) prior7dSuccessMap.set(row.channelId, row._count._all);

  // 24h error counts per channel
  const errors24hMap = new Map<string, number>();
  for (const row of errors24h) errors24hMap.set(row.channelId, row._count._all);

  const payload = channels.map((ch) => {
    const total = totalByChannel.get(ch.id) ?? 0;
    const success = successByChannel.get(ch.id) ?? 0;
    const failed = failedByChannel.get(ch.id) ?? 0;
    const successRate = total === 0 ? null : Math.round((success / total) * 100);

    const lastDeliveryAt = lastDeliveryByChannel.get(ch.id) ?? null;
    const lastFailureAt = lastFailureAtByChannel.get(ch.id) ?? null;
    const lastErrorMessage = lastErrorByChannel.get(ch.id) ?? null;

    // Health score formula:
    //   success component (70%): null success rate → 0 contribution
    //   recency component (30%): 30 if delivered within 24h, linearly
    //                            scaled to 0 by day 7, then 0 (or never).
    const successComponent = successRate === null ? 0 : (successRate / 100) * 70;
    let recencyComponent = 0;
    if (lastDeliveryAt) {
      const hoursAgo = (now - lastDeliveryAt.getTime()) / (60 * 60 * 1000);
      if (hoursAgo <= 24) {
        recencyComponent = 30;
      } else if (hoursAgo < 7 * 24) {
        // Linear scale: 30 at 24h → 0 at 168h.
        recencyComponent = 30 * (1 - (hoursAgo - 24) / (7 * 24 - 24));
      }
    }
    const healthScore = Math.round(successComponent + recencyComponent);

    let status: "healthy" | "degraded" | "critical" | "inactive";
    if (!ch.active) {
      status = "inactive";
    } else if (healthScore >= 80) {
      status = "healthy";
    } else if (healthScore >= 50) {
      status = "degraded";
    } else {
      status = "critical";
    }

    // Compute trend: compare current 7d success rate vs prior 7d.
    const curTotal = current7dTotalMap.get(ch.id) ?? 0;
    const curOk = current7dSuccessMap.get(ch.id) ?? 0;
    const prevTotal = prior7dTotalMap.get(ch.id) ?? 0;
    const prevOk = prior7dSuccessMap.get(ch.id) ?? 0;
    let trend: "up" | "down" | "flat" = "flat";
    if (curTotal >= 3 && prevTotal >= 3) {
      const curRate = (curOk / curTotal) * 100;
      const prevRate = (prevOk / prevTotal) * 100;
      const diff = curRate - prevRate;
      if (diff > 5) trend = "up";
      else if (diff < -5) trend = "down";
    }

    const recentErrors24h = errors24hMap.get(ch.id) ?? 0;

    return {
      channelId: ch.id,
      title: ch.title,
      username: ch.username,
      active: ch.active,
      totalDeliveries: total,
      successfulDeliveries: success,
      failedDeliveries: failed,
      successRate,
      lastDeliveryAt: lastDeliveryAt ? lastDeliveryAt.toISOString() : null,
      lastFailureAt: lastFailureAt ? lastFailureAt.toISOString() : null,
      lastErrorMessage,
      healthScore,
      status,
      trend,
      recentErrors24h,
    };
  });

  // Sort worst-first (lowest healthScore first) so the operator's attention
  // is drawn to problem channels.
  payload.sort((a, b) => a.healthScore - b.healthScore);

  return NextResponse.json(payload);
}
