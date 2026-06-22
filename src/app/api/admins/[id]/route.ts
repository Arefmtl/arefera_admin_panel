import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await db.admin.findUnique({ where: { id } });
  if (!admin) {
    return NextResponse.json({ error: "Admin not found" }, { status: 404 });
  }
  if (admin.isOwner) {
    return NextResponse.json({ error: "The owner admin cannot be removed" }, { status: 403 });
  }
  await db.admin.delete({ where: { id } });
  await audit("delete", "admin", {
    entityId: id,
    title: admin.name || admin.telegramId,
    detail: `Removed admin ${admin.name || admin.telegramId}`,
  });
  return NextResponse.json({ ok: true });
}
