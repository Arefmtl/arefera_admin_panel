import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/templates/usage
 *
 * Returns per-template usage stats for the Templates section:
 *   {
 *     templates: [{
 *       id, name, category,
 *       usageCount,        // # of ScheduledMessage rows that match this template's text
 *       lastUsedAt,        // ISO8601 of the most recent matching ScheduledMessage.createdAt, or null
 *       successRate        // 0..100 (rounded) based on ScheduledMessageLog rows linked to those messages, or null
 *     }]
 *   }
 *
 * All templates are returned, even those with 0 usage — the UI shows "Never used".
 *
 * "Usage" is computed by matching ScheduledMessage.text against Template.text.
 * We prefer text-match because the audit log for `entity: "scheduled"` doesn't
 * carry a stable template-id reference (the original scheduled-create handler
 * doesn't currently record the source template id in `meta`). When a richer
 * linkage is added later, this can be upgraded to read that.
 */
export async function GET() {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1) Pull all templates (small dataset — safe to load fully into memory).
  const templates = await db.template.findMany({
    select: { id: true, name: true, text: true, category: true },
  });

  // 2) Pull all scheduled messages with their createdAt (we only need id +
  //    text + createdAt for the usageCount + lastUsedAt computations).
  const scheduledMessages = await db.scheduledMessage.findMany({
    select: { id: true, text: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  // 3) Build a per-text index of scheduled-message ids so we can compute
  //    success rates from ScheduledMessageLog without re-scanning per template.
  //    Using a Map<text, ScheduledMessage[]> keeps this O(N) in scheduled count.
  const byText = new Map<string, { id: string; createdAt: Date }[]>();
  for (const sm of scheduledMessages) {
    const key = sm.text;
    const bucket = byText.get(key);
    if (bucket) bucket.push({ id: sm.id, createdAt: sm.createdAt });
    else byText.set(key, [{ id: sm.id, createdAt: sm.createdAt }]);
  }

  // 4) Pre-aggregate per-message success/failure counts from the logs table
  //    so we can compute successRate per template without one extra query per
  //    template. We pull only success + messageId — the dataset is small.
  const logs = await db.scheduledMessageLog.findMany({
    select: { messageId: true, success: true },
  });
  const logStats = new Map<string, { sent: number; failed: number }>();
  for (const log of logs) {
    const entry = logStats.get(log.messageId);
    if (entry) {
      if (log.success) entry.sent += 1;
      else entry.failed += 1;
    } else {
      logStats.set(log.messageId, {
        sent: log.success ? 1 : 0,
        failed: log.success ? 0 : 1,
      });
    }
  }

  // 5) Build the per-template usage payload.
  const payload = templates.map((tpl) => {
    const matches = byText.get(tpl.text) ?? [];
    const usageCount = matches.length;
    // `scheduledMessages` is ordered desc by createdAt, but the bucket above is
    // built in iteration order — so the first entry is the newest.
    const lastUsedAt = matches.length > 0 ? matches[0].createdAt.toISOString() : null;

    // Success rate across all logs linked to matching scheduled messages.
    let sent = 0;
    let failed = 0;
    for (const m of matches) {
      const s = logStats.get(m.id);
      if (s) {
        sent += s.sent;
        failed += s.failed;
      }
    }
    const total = sent + failed;
    const successRate = total === 0 ? null : Math.round((sent / total) * 100);

    return {
      id: tpl.id,
      name: tpl.name,
      category: tpl.category,
      usageCount,
      lastUsedAt,
      successRate,
    };
  });

  // Sort by usage desc so the UI gets the most-used first by default — the
  // client can re-sort as needed.
  payload.sort((a, b) => b.usageCount - a.usageCount || a.name.localeCompare(b.name));

  return NextResponse.json({ templates: payload });
}
