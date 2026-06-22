import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/scheduled/timeline
 *
 * Returns upcoming scheduled messages (status `pending` or `repeating`)
 * whose next fire time falls within the next 30 days from now.
 *
 * Defense in depth: `requireAuth()` is called even though middleware
 * already blocks unauthenticated `/api/*` traffic.
 *
 * Response shape — array of:
 *   {
 *     id, title, text (first 80 chars), format, repeat,
 *     channelCount, nextRunAt, scheduledAt
 *   }
 * sorted ascending by next-fire time (nextRunAt ?? scheduledAt).
 */
export async function GET() {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const horizon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Pull pending + repeating messages. Repeating messages keep status "pending"
  // in this codebase (see schema comment), but we also accept "repeating"
  // defensively in case the schema ever diverges.
  const rows = await db.scheduledMessage.findMany({
    where: {
      status: { in: ["pending", "repeating"] },
      // nextRunAt ?? scheduledAt must be within [now, horizon].
      OR: [
        {
          AND: [
            { nextRunAt: { gte: now } },
            { nextRunAt: { lte: horizon } },
          ],
        },
        {
          AND: [
            { nextRunAt: null },
            { scheduledAt: { gte: now } },
            { scheduledAt: { lte: horizon } },
          ],
        },
      ],
    },
    orderBy: [{ nextRunAt: "asc" }, { scheduledAt: "asc" }],
    take: 200,
  });

  const payload = rows.map((r) => {
    let channelCount = 0;
    try {
      const parsed = JSON.parse(r.channelIds);
      if (Array.isArray(parsed)) channelCount = parsed.length;
    } catch {
      /* ignore */
    }
    const fireAt = r.nextRunAt ?? r.scheduledAt;
    return {
      id: r.id,
      title: r.title,
      text: r.text.length > 80 ? r.text.slice(0, 80) + "…" : r.text,
      format: r.format as "markdown" | "html",
      repeat: r.repeat as "none" | "daily" | "weekly" | "monthly",
      channelCount,
      nextRunAt: r.nextRunAt ? r.nextRunAt.toISOString() : null,
      scheduledAt: r.scheduledAt.toISOString(),
      fireAt: fireAt.toISOString(),
    };
  });

  // Final ascending sort by fireAt (defensive — Prisma orderBy on nullable
  // nextRunAt can leave null entries interleaved).
  payload.sort((a, b) => new Date(a.fireAt).getTime() - new Date(b.fireAt).getTime());

  return NextResponse.json(payload);
}
