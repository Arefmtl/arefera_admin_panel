import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

/** GET /api/scheduled/calendar?month=1-12&year=2026
 *
 * Returns all pending/repeating scheduled messages that fall within the
 * requested month, plus a per-day summary for quick rendering.
 */
export async function GET(req: NextRequest) {
  await requireAuth();

  const { searchParams } = req.nextUrl;
  const month = Number(searchParams.get("month") || new Date().getMonth() + 1);
  const year = Number(searchParams.get("year") || new Date().getFullYear());

  // Clamp month to 1-12
  const m = Math.max(1, Math.min(12, month));
  const y = Math.max(2000, Math.min(2100, year));

  // Build month boundaries
  const monthStart = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const monthEnd = new Date(y, m, 1, 0, 0, 0, 0); // first of next month

  // Fetch scheduled messages that could land in this month:
  //  - status "pending" with scheduledAt or nextRunAt in the month
  //  - status "failed" with scheduledAt or nextRunAt in the month
  //  - repeating messages (repeat != "none") with nextRunAt in the month
  //    OR scheduledAt in the month
  const messages = await db.scheduledMessage.findMany({
    where: {
      status: { in: ["pending", "failed"] },
      OR: [
        { scheduledAt: { gte: monthStart, lt: monthEnd } },
        { nextRunAt: { gte: monthStart, lt: monthEnd } },
      ],
    },
    orderBy: { scheduledAt: "asc" },
    select: {
      id: true,
      title: true,
      status: true,
      repeat: true,
      scheduledAt: true,
      nextRunAt: true,
    },
  });

  // Build per-day summary: { "YYYY-MM-DD": { pending: N, repeating: N, failed: N } }
  const summary: Record<
    string,
    { pending: number; repeating: number; failed: number }
  > = {};

  for (const msg of messages) {
    // Determine which date(s) this message falls on within the month
    const dates: Date[] = [];

    if (msg.scheduledAt >= monthStart && msg.scheduledAt < monthEnd) {
      dates.push(msg.scheduledAt);
    }
    if (msg.nextRunAt && msg.nextRunAt >= monthStart && msg.nextRunAt < monthEnd) {
      // Avoid duplicate date if nextRunAt === scheduledAt
      if (!dates.some((d) => d.getTime() === msg.nextRunAt!.getTime())) {
        dates.push(msg.nextRunAt);
      }
    }

    for (const dt of dates) {
      const key = dt.toISOString().slice(0, 10); // "YYYY-MM-DD"
      if (!summary[key]) summary[key] = { pending: 0, repeating: 0, failed: 0 };

      if (msg.status === "failed") {
        summary[key].failed += 1;
      } else if (msg.repeat !== "none") {
        summary[key].repeating += 1;
      } else {
        summary[key].pending += 1;
      }
    }
  }

  // Map messages to a calendar-friendly shape
  const items = messages.map((msg) => ({
    id: msg.id,
    title: msg.title,
    status: msg.status,
    repeat: msg.repeat,
    scheduledAt: msg.scheduledAt.toISOString(),
    nextRunAt: msg.nextRunAt ? msg.nextRunAt.toISOString() : null,
  }));

  return NextResponse.json({
    month: m,
    year: y,
    items,
    summary,
  });
}
