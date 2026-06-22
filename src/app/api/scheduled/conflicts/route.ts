import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

/**
 * POST /api/scheduled/conflicts
 *
 * Detects scheduling conflicts: a pending scheduled message that targets
 * ANY overlapping channel AND fires within ±5 minutes of the requested time.
 *
 * Body:
 *   {
 *     scheduledAt: ISO string,
 *     channelIds: string[],
 *     repeat: "none" | "daily" | "weekly" | "monthly",
 *     excludeId?: string — schedule id currently being edited (so it doesn't
 *                         conflict with itself)
 *   }
 *
 * Returns:
 *   { conflicts: Array<{
 *       id, title, scheduledAt, channelIds, channelTitles, repeat
 *   }> }
 *
 * Conflict rules:
 *  - Only pending messages are considered (status="pending").
 *  - The "fire time" of each pending message is `nextRunAt` if set, else
 *    `scheduledAt` (matches the scheduler's own dispatch logic).
 *  - For repeating messages, the next 3 occurrences after the requested
 *    scheduledAt are also computed and compared against the existing
 *    pending message's fire times.
 *  - Two schedules conflict if their fire times are within ±5 minutes of
 *    each other AND they share at least one target channel.
 */
export async function POST(req: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const requestedAtRaw = typeof body.scheduledAt === "string" ? body.scheduledAt : null;
  if (!requestedAtRaw) {
    return NextResponse.json({ error: "scheduledAt is required" }, { status: 400 });
  }
  const requestedAt = new Date(requestedAtRaw);
  if (Number.isNaN(requestedAt.getTime())) {
    return NextResponse.json({ error: "Invalid scheduledAt date" }, { status: 400 });
  }

  const requestedChannelIds: string[] = Array.isArray(body.channelIds)
    ? body.channelIds.filter((x: unknown): x is string => typeof x === "string")
    : [];
  // If no target channels are selected yet, we can't have a channel overlap,
  // so short-circuit to an empty conflict list. (No need to query the DB.)
  if (requestedChannelIds.length === 0) {
    return NextResponse.json({ conflicts: [] });
  }

  const requestedRepeat = ["none", "daily", "weekly", "monthly"].includes(body.repeat)
    ? (body.repeat as "none" | "daily" | "weekly" | "monthly")
    : "none";
  const excludeId = typeof body.excludeId === "string" && body.excludeId ? body.excludeId : null;

  // ±5 minutes window.
  const WINDOW_MS = 5 * 60 * 1000;

  // Compute the set of candidate "fire times" for the *new* schedule:
  //   - The initial requestedAt.
  //   - For repeating schedules, the next 3 occurrences after requestedAt.
  // Each candidate fire time is checked against every existing pending
  // schedule's own candidate fire times (initial + next 3 occurrences if
  // repeating).
  const requestedFireTimes = computeOccurrences(requestedAt, requestedRepeat, 3);

  // Pull all pending scheduled messages except the excluded one. We do the
  // overlap math in JS because SQLite doesn't have nice interval arithmetic
  // and the pending set is small.
  const pending = await db.scheduledMessage.findMany({
    where: {
      status: "pending",
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });

  // Pre-fetch all channels once for title lookups (avoids N+1 queries when
  // building the channelTitles array per conflict).
  const allChannels = await db.channel.findMany();
  const channelTitleById = new Map<string, string>(allChannels.map((c) => [c.id, c.title]));

  const conflicts: Array<{
    id: string;
    title: string;
    scheduledAt: string;
    channelIds: string[];
    channelTitles: string[];
    repeat: string;
  }> = [];

  for (const msg of pending) {
    const msgChannels = parseChannelIds(msg.channelIds);
    if (msgChannels.length === 0) continue;

    // Channel overlap check — at least one shared channel.
    const overlap = msgChannels.some((id) => requestedChannelIds.includes(id));
    if (!overlap) continue;

    // Compute the candidate fire times for the existing pending message.
    // Its "next fire" is nextRunAt if set, else scheduledAt. For repeating
    // messages we also check the next 3 occurrences after that.
    const base = msg.nextRunAt ?? msg.scheduledAt;
    const msgRepeat = msg.repeat as "none" | "daily" | "weekly" | "monthly";
    const msgFireTimes = computeOccurrences(base, msgRepeat, 3);

    // Time overlap: does any requested fire time fall within ±5 min of any
    // existing fire time?
    const timeOverlap = requestedFireTimes.some((t1) =>
      msgFireTimes.some((t2) => Math.abs(t1.getTime() - t2.getTime()) <= WINDOW_MS),
    );
    if (!timeOverlap) continue;

    // Build channel titles — fall back to the id if the channel was deleted.
    const channelTitles = msgChannels.map((id) => channelTitleById.get(id) ?? id);

    conflicts.push({
      id: msg.id,
      title: msg.title,
      scheduledAt: msg.scheduledAt.toISOString(),
      channelIds: msgChannels,
      channelTitles,
      repeat: msg.repeat,
    });
  }

  return NextResponse.json({ conflicts });
}

/** Parse a JSON-encoded channelIds string into a string[]. */
function parseChannelIds(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as string[];
  } catch {
    /* ignore */
  }
  return [];
}

/**
 * Compute a list of candidate fire times starting from `base`. Includes the
 * base itself plus up to `extra` future occurrences for the given repeat
 * pattern. Returns a stable array of Date objects.
 */
function computeOccurrences(
  base: Date,
  repeat: "none" | "daily" | "weekly" | "monthly",
  extra: number,
): Date[] {
  const out = [new Date(base)];
  if (repeat === "none" || extra <= 0) return out;
  let cur = new Date(base);
  for (let i = 0; i < extra; i++) {
    const next = nextOccurrence(cur, repeat);
    if (!next) break;
    out.push(next);
    cur = next;
  }
  return out;
}

function nextOccurrence(from: Date, repeat: "daily" | "weekly" | "monthly"): Date | null {
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
