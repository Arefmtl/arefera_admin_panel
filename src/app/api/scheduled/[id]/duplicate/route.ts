import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireAuth } from "@/lib/auth";

/**
 * POST /api/scheduled/[id]/duplicate
 *
 * Creates a new pending ScheduledMessage based on the source, optionally
 * offsetting the fire time by +1 day or +1 week.
 *
 * Body: { offset?: "none" | "1d" | "1w" } (default "none")
 *
 * Behavior:
 *  - title: appends " (copy)" for none, " (+1d)" for 1d, " (+1w)" for 1w
 *  - text / format / buttons / channelIds / repeat: copied verbatim
 *  - scheduledAt: source.scheduledAt + offset (1d=+86400000ms, 1w=+604800000ms)
 *  - nextRunAt: recalculated from new scheduledAt + repeat (same as POST /api/scheduled)
 *  - status: "pending", lastRunAt: null, error: null
 *  - new id, createdAt, updatedAt (auto)
 *
 * Response: { ok, duplicate: { id, title, scheduledAt } }
 *
 * Audit: action="create", entity="scheduled", entityId=newId,
 *        detail=`Duplicated from {sourceId}`, actor="admin"
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

type Offset = "none" | "1d" | "1w";

function isOffset(v: unknown): v is Offset {
  return v === "none" || v === "1d" || v === "1w";
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const offset: Offset = isOffset(body?.offset) ? body.offset : "none";

  const original = await db.scheduledMessage.findUnique({ where: { id } });
  if (!original) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const offsetMs = offset === "1d" ? DAY_MS : offset === "1w" ? WEEK_MS : 0;
  const scheduledAt = new Date(original.scheduledAt.getTime() + offsetMs);
  // nextRunAt mirrors the POST /api/scheduled behavior: repeating jobs get
  // the new scheduledAt as their first fire; one-offs stay null.
  const nextRunAt = original.repeat !== "none" ? scheduledAt : null;

  const suffix = offset === "1d" ? " (+1d)" : offset === "1w" ? " (+1w)" : " (copy)";
  const title = `${original.title}${suffix}`;

  const created = await db.scheduledMessage.create({
    data: {
      title,
      text: original.text,
      format: original.format,
      buttons: original.buttons,
      channelIds: original.channelIds,
      scheduledAt,
      repeat: original.repeat,
      status: "pending",
      lastRunAt: null,
      nextRunAt,
      error: null,
    },
  });

  await audit("create", "scheduled", {
    entityId: created.id,
    title: created.title,
    detail: `Duplicated from ${original.id}`,
    actor: "admin",
    meta: {
      sourceId: original.id,
      sourceTitle: original.title,
      offset,
      scheduledAt: scheduledAt.toISOString(),
    },
  });

  return NextResponse.json(
    {
      ok: true,
      duplicate: {
        id: created.id,
        title: created.title,
        scheduledAt: created.scheduledAt.toISOString(),
      },
    },
    { status: 201 },
  );
}
