import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

/** GET /api/scheduled — list all scheduled messages. */
export async function GET() {
  const messages = await db.scheduledMessage.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { logs: true } } },
  });
  return NextResponse.json(messages);
}

/** POST /api/scheduled — create a new scheduled message. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || !body.text || !body.scheduledAt) {
    return NextResponse.json({ error: "text and scheduledAt are required" }, { status: 400 });
  }
  const channelIds: string[] = Array.isArray(body.channelIds) ? body.channelIds : [];
  if (channelIds.length === 0) {
    return NextResponse.json({ error: "Select at least one target channel" }, { status: 400 });
  }

  const scheduledAt = new Date(body.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime())) {
    return NextResponse.json({ error: "Invalid scheduledAt date" }, { status: 400 });
  }

  const repeat = ["none", "daily", "weekly", "monthly"].includes(body.repeat)
    ? body.repeat
    : "none";

  // For repeating messages, the first fire is scheduledAt and nextRunAt is set
  // so the scheduler picks it up. For one-off messages nextRunAt stays null
  // and the scheduler uses scheduledAt.
  const nextRunAt = repeat !== "none" ? scheduledAt : null;

  const created = await db.scheduledMessage.create({
    data: {
      title: body.title?.trim() || "Untitled message",
      text: body.text,
      format: body.format === "html" ? "html" : "markdown",
      buttons: body.buttons ? JSON.stringify(body.buttons) : null,
      channelIds: JSON.stringify(channelIds),
      scheduledAt,
      repeat,
      status: "pending",
      nextRunAt,
    },
  });
  await audit("create", "scheduled", {
    entityId: created.id,
    title: created.title,
    detail: `Scheduled for ${scheduledAt.toISOString()} · repeat=${repeat} · ${channelIds.length} channel(s)`,
    meta: { repeat, channelCount: channelIds.length, scheduledAt: scheduledAt.toISOString() },
  });
  return NextResponse.json(created, { status: 201 });
}
