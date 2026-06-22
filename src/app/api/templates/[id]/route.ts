import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") data.name = body.name.trim();
  if (typeof body.text === "string") data.text = body.text;
  if (body.format === "html" || body.format === "markdown") data.format = body.format;
  if (body.buttons !== undefined) data.buttons = body.buttons ? JSON.stringify(body.buttons) : null;
  if (typeof body.category === "string") data.category = body.category.trim() || "general";
  const updated = await db.template.update({ where: { id }, data });
  await audit("update", "template", {
    entityId: updated.id,
    title: updated.name,
    detail: `Updated template fields: ${Object.keys(data).join(", ")}`,
    meta: { fields: Object.keys(data) },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = await db.template.findUnique({ where: { id } });
  await db.template.delete({ where: { id } }).catch(() => null);
  await audit("delete", "template", {
    entityId: id,
    title: existing?.name,
    detail: `Deleted template "${existing?.name ?? id}"`,
  });
  return NextResponse.json({ ok: true });
}
