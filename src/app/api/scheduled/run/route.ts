import { NextResponse } from "next/server";
import { runScheduler } from "@/lib/scheduler";
import { audit } from "@/lib/audit";

/**
 * POST /api/scheduled/run
 * Processes all scheduled messages that are due. Called by the admin panel's
 * background poller (every 30s while the panel is open). Safe to call
 * repeatedly — it only acts on due messages.
 */
export async function POST() {
  const result = await runScheduler();
  if (result.processed > 0) {
    await audit("run", "scheduled", {
      detail: `Scheduler fired ${result.processed} message(s): ${result.sent} sent, ${result.failed} failed`,
      meta: { processed: result.processed, sent: result.sent, failed: result.failed },
    });
  }
  return NextResponse.json(result);
}
