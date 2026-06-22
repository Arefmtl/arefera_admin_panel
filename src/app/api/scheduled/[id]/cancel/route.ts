import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

/** POST /api/scheduled/[id]/cancel — cancel a pending/repeating scheduled message. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const msg = await db.scheduledMessage.findUnique({ where: { id } });
  if (!msg) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const updated = await db.scheduledMessage.update({
    where: { id },
    data: { status: "cancelled", nextRunAt: null },
  });
  await audit("cancel", "scheduled", {
    entityId: updated.id,
    title: updated.title,
    detail: `Cancelled scheduled message \"${updated.title}\"`,
  });
  return NextResponse.json(updated);
}
