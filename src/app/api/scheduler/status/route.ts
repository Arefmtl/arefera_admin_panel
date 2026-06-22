import { NextResponse } from "next/server";
import { runScheduler } from "@/lib/scheduler";

/**
 * Lazily starts the in-process scheduler if it isn't already running.
 * This is called on the first status check (and by instrumentation.ts on
 * server boot). In dev mode the server may not restart to pick up
 * instrumentation, so this lazy init ensures the scheduler starts as soon
 * as any admin panel loads.
 */
function ensureScheduler() {
  const g = globalThis as unknown as {
    __schedulerRunning?: boolean;
    __schedulerLastTick?: number;
    __schedulerTickCount?: number;
    __schedulerProcessed?: number;
  };

  if (g.__schedulerRunning) return;
  g.__schedulerRunning = true;
  g.__schedulerTickCount = 0;
  g.__schedulerProcessed = 0;

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await runScheduler();
      g.__schedulerLastTick = Date.now();
      g.__schedulerTickCount = (g.__schedulerTickCount || 0) + 1;
      g.__schedulerProcessed = (g.__schedulerProcessed || 0) + result.processed;
      if (result.processed > 0) {
        console.log(
          `[scheduler] processed ${result.processed} message(s) — sent: ${result.sent}, failed: ${result.failed}`,
        );
      }
    } catch (err) {
      console.error("[scheduler] tick error:", err);
    } finally {
      running = false;
    }
  };

  // Initial tick after 5s, then every 60s
  setTimeout(tick, 5_000);
  setInterval(tick, 60_000);
  console.log("[scheduler] background interval started (60s) via lazy init");
}

/**
 * GET /api/scheduler/status
 * Reports whether the in-process scheduler is running and starts it
 * lazily if it isn't.
 */
export async function GET() {
  ensureScheduler();
  const g = globalThis as unknown as {
    __schedulerRunning?: boolean;
    __schedulerLastTick?: number;
    __schedulerTickCount?: number;
    __schedulerProcessed?: number;
  };

  return NextResponse.json({
    status: g.__schedulerRunning ? "online" : "offline",
    lastTickAt: g.__schedulerLastTick ? new Date(g.__schedulerLastTick).toISOString() : null,
    ticks: g.__schedulerTickCount || 0,
    processed: g.__schedulerProcessed || 0,
  });
}
