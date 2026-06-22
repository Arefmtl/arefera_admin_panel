import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

type BulkAction = "delete" | "cancel" | "clone";

/**
 * POST /api/scheduled/bulk
 * Body: { ids: string[], action: "delete" | "cancel" | "clone" }
 * Performs the same action on multiple scheduled messages at once.
 * Returns per-id results.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: "ids array is required" }, { status: 400 });
  }
  const action: BulkAction = ["delete", "cancel", "clone"].includes(body.action)
    ? body.action
    : "delete";
  const ids: string[] = body.ids.slice(0, 100); // safety cap

  const results: { id: string; ok: boolean; error?: string; newId?: string }[] = [];

  for (const id of ids) {
    try {
      const existing = await db.scheduledMessage.findUnique({ where: { id } });
      if (!existing) {
        results.push({ id, ok: false, error: "not found" });
        continue;
      }
      if (action === "delete") {
        await db.scheduledMessage.delete({ where: { id } });
        results.push({ id, ok: true });
      } else if (action === "cancel") {
        if (existing.status !== "pending") {
          results.push({ id, ok: false, error: `cannot cancel (status=${existing.status})` });
          continue;
        }
        await db.scheduledMessage.update({
          where: { id },
          data: { status: "cancelled", nextRunAt: null },
        });
        results.push({ id, ok: true });
      } else if (action === "clone") {
        const scheduledAt = new Date(Date.now() + 60 * 60 * 1000);
        const nextRunAt = existing.repeat !== "none" ? scheduledAt : null;
        const cloned = await db.scheduledMessage.create({
          data: {
            title: `${existing.title} (copy)`,
            text: existing.text,
            format: existing.format,
            buttons: existing.buttons,
            channelIds: existing.channelIds,
            scheduledAt,
            repeat: existing.repeat,
            status: "pending",
            nextRunAt,
          },
        });
        results.push({ id, ok: true, newId: cloned.id });
      }
    } catch (e) {
      results.push({
        id,
        ok: false,
        error: e instanceof Error ? e.message : "unknown error",
      });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  await audit("bulk", "scheduled", {
    title: `Bulk ${action}`,
    detail: `Bulk ${action} on ${ids.length} message(s): ${okCount} ok, ${results.length - okCount} failed`,
    meta: { action, ids, ok: okCount, failed: results.length - okCount },
  });

  return NextResponse.json({ action, results, ok: okCount, failed: results.length - okCount });
}
