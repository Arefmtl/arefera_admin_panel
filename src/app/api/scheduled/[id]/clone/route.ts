import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

/**
 * POST /api/scheduled/[id]/clone
 * Creates a copy of a scheduled message with a new scheduled time (1h from now),
 * status pending, and "(copy)" suffix on the title.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const original = await db.scheduledMessage.findUnique({ where: { id } });
  if (!original) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const scheduledAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
  const nextRunAt = original.repeat !== "none" ? scheduledAt : null;
  const cloned = await db.scheduledMessage.create({
    data: {
      title: `${original.title} (copy)`,
      text: original.text,
      format: original.format,
      buttons: original.buttons,
      channelIds: original.channelIds,
      scheduledAt,
      repeat: original.repeat,
      status: "pending",
      nextRunAt,
    },
  });
  await audit("clone", "scheduled", {
    entityId: cloned.id,
    title: cloned.title,
    detail: `Cloned from \"${original.title}\" (${original.id})`,
    meta: { sourceId: original.id, scheduledAt: scheduledAt.toISOString() },
  });
  return NextResponse.json(cloned, { status: 201 });
}
