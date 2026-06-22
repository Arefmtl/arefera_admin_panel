import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/saved-views/[id]
 * Delete a saved view by id. Returns 404 if the view doesn't exist.
 */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const existing = await db.savedView.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Saved view not found" }, { status: 404 });
  }
  await db.savedView.delete({ where: { id } });
  await audit("delete", "scheduled", {
    title: "Saved view deleted",
    detail: `Saved view "${existing.name}" deleted`,
    entityId: id,
  }).catch(() => {});
  return NextResponse.json({ ok: true });
}
