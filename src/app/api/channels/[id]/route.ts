import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const data: Record<string, unknown> = {};
  if (typeof body.title === "string") data.title = body.title;
  if (typeof body.active === "boolean") data.active = body.active;
  const updated = await db.channel.update({
    where: { id },
    data,
  });
  await audit("update", "channel", {
    entityId: updated.id,
    title: updated.title,
    detail: Object.keys(data).includes("active")
      ? `Channel "${updated.title}" ${updated.active ? "activated" : "paused"}`
      : `Channel updated: ${Object.keys(data).join(", ")}`,
    meta: { fields: Object.keys(data), active: updated.active },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = await db.channel.findUnique({ where: { id } });
  await db.channel.delete({ where: { id } }).catch(() => null);
  await audit("delete", "channel", {
    entityId: id,
    title: existing?.title,
    detail: `Removed channel "${existing?.title ?? id}"`,
  });
  return NextResponse.json({ ok: true });
}
