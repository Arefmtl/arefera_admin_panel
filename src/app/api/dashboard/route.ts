import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [
    adminCount,
    channelCount,
    activeChannelCount,
    pendingScheduled,
    sentScheduled,
    failedScheduled,
    totalScheduled,
    postsToday,
    logsToday,
    recentLogs,
    upcoming,
  ] = await Promise.all([
    db.admin.count(),
    db.channel.count(),
    db.channel.count({ where: { active: true } }),
    db.scheduledMessage.count({ where: { status: "pending" } }),
    db.scheduledMessage.count({ where: { status: "sent" } }),
    db.scheduledMessage.count({ where: { status: "failed" } }),
    db.scheduledMessage.count(),
    db.post.count({ where: { createdAt: { gte: startOfDay } } }),
    db.scheduledMessageLog.count({ where: { ranAt: { gte: startOfDay } } }),
    db.scheduledMessageLog.findMany({
      take: 8,
      orderBy: { ranAt: "desc" },
      include: { message: { select: { title: true } } },
    }),
    db.scheduledMessage.findMany({
      where: { status: "pending", scheduledAt: { gte: now } },
      take: 5,
      orderBy: { scheduledAt: "asc" },
    }),
  ]);

  // Build a 14-day delivery trend + sparklines.
  const days: { date: string; sent: number; failed: number }[] = [];
  const sparklinePending: number[] = [];
  const sparklineSent: number[] = [];
  const sparklineFailed: number[] = [];
  const sparklineChannels: number[] = []; // always 0 — no daily trend

  for (let i = 13; i >= 0; i--) {
    const dayStart = new Date(now);
    dayStart.setDate(now.getDate() - i);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayStart.getDate() + 1);

    const [sent, failed, pending] = await Promise.all([
      db.scheduledMessageLog.count({
        where: { success: true, ranAt: { gte: dayStart, lt: dayEnd } },
      }),
      db.scheduledMessageLog.count({
        where: { success: false, ranAt: { gte: dayStart, lt: dayEnd } },
      }),
      db.scheduledMessage.count({
        where: { status: "pending", scheduledAt: { gte: dayStart, lt: dayEnd } },
      }),
    ]);

    days.push({ date: dayStart.toISOString().slice(5, 10), sent, failed });
    sparklinePending.push(pending);
    sparklineSent.push(sent);
    sparklineFailed.push(failed);
    sparklineChannels.push(0);
  }

  // Repeat distribution for pending messages
  const [noneCount, dailyCount, weeklyCount, monthlyCount] = await Promise.all([
    db.scheduledMessage.count({ where: { repeat: "none" } }),
    db.scheduledMessage.count({ where: { repeat: "daily" } }),
    db.scheduledMessage.count({ where: { repeat: "weekly" } }),
    db.scheduledMessage.count({ where: { repeat: "monthly" } }),
  ]);

  // Channel performance — deliveries per channel (last 30 days)
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);
  const allLogs = await db.scheduledMessageLog.findMany({
    where: { ranAt: { gte: thirtyDaysAgo } },
    select: { channelTitle: true, success: true },
  });
  const channelPerfMap = new Map<string, { title: string; sent: number; failed: number }>();
  for (const log of allLogs) {
    const key = log.channelTitle;
    const entry = channelPerfMap.get(key) || { title: key, sent: 0, failed: 0 };
    if (log.success) entry.sent += 1;
    else entry.failed += 1;
    channelPerfMap.set(key, entry);
  }
  const channelPerformance = Array.from(channelPerfMap.values())
    .sort((a, b) => b.sent + b.failed - (a.sent + a.failed))
    .slice(0, 6);

  // Status distribution
  const cancelledCount = await db.scheduledMessage.count({ where: { status: "cancelled" } });

  return NextResponse.json({
    counts: {
      admins: adminCount,
      channels: channelCount,
      activeChannels: activeChannelCount,
      pendingScheduled,
      sentScheduled,
      failedScheduled,
      cancelledScheduled: cancelledCount,
      totalScheduled,
      postsToday,
      logsToday,
    },
    trend: days,
    sparklines: {
      pending: sparklinePending,
      sent: sparklineSent,
      failed: sparklineFailed,
      channels: sparklineChannels,
    },
    repeatDistribution: [
      { name: "Once", value: noneCount, color: "#94a3b8" },
      { name: "Daily", value: dailyCount, color: "#10b981" },
      { name: "Weekly", value: weeklyCount, color: "#14b8a6" },
      { name: "Monthly", value: monthlyCount, color: "#06b6d4" },
    ],
    channelPerformance,
    recentLogs,
    upcoming,
  });
}
