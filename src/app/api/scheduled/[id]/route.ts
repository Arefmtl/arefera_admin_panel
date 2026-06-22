import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const msg = await db.scheduledMessage.findUnique({
    where: { id },
    include: { logs: { orderBy: { ranAt: "desc" }, take: 50 } },
  });
  if (!msg) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(msg);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const existing = await db.scheduledMessage.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (typeof body.title === "string") data.title = body.title.trim();
  if (typeof body.text === "string") data.text = body.text;
  if (body.format === "html" || body.format === "markdown") data.format = body.format;
  if (body.buttons !== undefined) data.buttons = body.buttons ? JSON.stringify(body.buttons) : null;
  if (Array.isArray(body.channelIds)) data.channelIds = JSON.stringify(body.channelIds);
  if (body.scheduledAt) {
    const d = new Date(body.scheduledAt);
    if (!Number.isNaN(d.getTime())) {
      data.scheduledAt = d;
      // Re-arm nextRunAt for repeating messages.
      if (existing.repeat !== "none") data.nextRunAt = d;
      else data.nextRunAt = null;
    }
  }
  if (["none", "daily", "weekly", "monthly"].includes(body.repeat)) {
    data.repeat = body.repeat;
    if (body.repeat !== "none" && existing.status === "pending") {
      data.nextRunAt = existing.scheduledAt;
    }
  }
  if (["pending", "paused"].includes(body.status)) {
    data.status = body.status;
  }

  const updated = await db.scheduledMessage.update({ where: { id }, data });
  await audit("update", "scheduled", {
    entityId: updated.id,
    title: updated.title,
    detail: `Updated fields: ${Object.keys(data).join(", ")}`,
    meta: { fields: Object.keys(data) },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = await db.scheduledMessage.findUnique({ where: { id } });
  await db.scheduledMessage.delete({ where: { id } }).catch(() => null);
  await audit("delete", "scheduled", {
    entityId: id,
    title: existing?.title,
    detail: `Deleted scheduled message "${existing?.title ?? id}"`,
  });
  return NextResponse.json({ ok: true });
}
