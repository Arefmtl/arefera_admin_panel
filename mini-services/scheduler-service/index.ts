/**
 * Scheduler Service — standalone background worker
 *
 * Polls the Next.js app's /api/scheduled/run endpoint every 60 seconds so
 * that due scheduled messages fire even when no admin has the panel open.
 *
 * Runs independently on port 3010 (exposes a tiny health endpoint).
 * The main Next.js app stays on port 3000.
 */

const PORT = 3010;
const NEXT_APP = "http://localhost:3000";
const POLL_INTERVAL_MS = 60_000; // 60 seconds

const stats = {
  startedAt: new Date(),
  ticks: 0,
  processed: 0,
  sent: 0,
  failed: 0,
  lastTickAt: null as Date | null,
  lastError: null as string | null,
};

async function tick() {
  stats.ticks += 1;
  stats.lastTickAt = new Date();
  try {
    const res = await fetch(`${NEXT_APP}/api/scheduled/run?t=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) {
      stats.lastError = `HTTP ${res.status} ${res.statusText}`;
      console.error(`[${new Date().toISOString()}] tick failed: ${stats.lastError}`);
      return;
    }
    const data = (await res.json()) as {
      processed?: number;
      sent?: number;
      failed?: number;
    };
    stats.lastError = null;
    if (data.processed && data.processed > 0) {
      stats.processed += data.processed;
      stats.sent += data.sent || 0;
      stats.failed += data.failed || 0;
      console.log(
        `[${new Date().toISOString()}] processed ${data.processed} message(s) — sent: ${data.sent}, failed: ${data.failed}`,
      );
    }
  } catch (err) {
    stats.lastError = err instanceof Error ? err.message : String(err);
    console.error(`[${new Date().toISOString()}] tick error:`, stats.lastError);
  }
}

// Simple HTTP server for health checks
Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response(
        JSON.stringify(
          {
            service: "scheduler-service",
            status: "running",
            uptime: Math.floor((Date.now() - stats.startedAt.getTime()) / 1000),
            ...stats,
            lastTickAt: stats.lastTickAt?.toISOString() || null,
            startedAt: stats.startedAt.toISOString(),
          },
          null,
          2,
        ),
        { headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.pathname === "/trigger") {
      tick();
      return new Response(JSON.stringify({ triggered: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log(`[scheduler-service] listening on port ${PORT}`);
console.log(`[scheduler-service] polling ${NEXT_APP}/api/scheduled/run every ${POLL_INTERVAL_MS / 1000}s`);

// Initial tick shortly after startup
setTimeout(tick, 3000);
setInterval(tick, POLL_INTERVAL_MS);
