/**
 * Next.js instrumentation hook — runs once on server startup.
 * Starts a background interval that processes due scheduled messages
 * every 60 seconds, independent of whether any admin panel is open.
 *
 * This replaces the standalone mini-service approach, which doesn't
 * survive in sandboxed environments that reap background processes.
 */

export async function register() {
  // Only run in the Node.js runtime (not edge)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const g = globalThis as unknown as {
      __schedulerRunning?: boolean;
      __schedulerLastTick?: number;
      __schedulerTickCount?: number;
      __schedulerProcessed?: number;
    };

    // Guard against double-registration (hot reload in dev)
    if (g.__schedulerRunning) {
      console.log("[scheduler] already running, skipping registration");
      return;
    }

    const { runScheduler } = await import("./lib/scheduler");

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

    // Initial tick after 10s (let the server settle)
    setTimeout(tick, 10_000);
    // Then every 60 seconds
    setInterval(tick, 60_000);

    console.log("[scheduler] background interval registered (60s)");
  }
}
