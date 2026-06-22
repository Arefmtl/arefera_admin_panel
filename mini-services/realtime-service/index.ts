/**
 * Realtime Service — WebSocket push for live admin panel updates.
 *
 * Polls the Next.js app's audit-logs and recent-delivery endpoints every 5s
 * and broadcasts any NEW entries to all connected admin panel clients via
 * socket.io on port 3003.
 *
 * Events emitted to clients:
 *   - "audit:new"        { row: AuditLogRow }
 *   - "delivery:new"     { row: LogRow }
 *   - "scheduler:tick"   { processed, sent, failed, at }
 *   - "stats"            { connections, lastTickAt, auditPushed, deliveryPushed }
 *
 * Clients emit:
 *   - "subscribe"        { channels: string[] }  // optional filter
 *
 * The frontend connects via:  io('/?XTransformPort=3003')
 */

import { createServer } from "http";
import { Server } from "socket.io";

const PORT = 3003;
const NEXT_APP = "http://localhost:3000";
const POLL_INTERVAL_MS = 5_000;
const SCHEDULER_TICK_MS = 30_000;

type AuditRow = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  title: string | null;
  detail: string | null;
  actor: string;
  meta: string | null;
  createdAt: string;
};

type DeliveryRow = {
  id: string;
  channelTitle: string;
  success: boolean;
  error: string | null;
  ranAt: string;
  message: { title: string } | null;
};

const stats = {
  startedAt: new Date(),
  connections: 0,
  ticks: 0,
  auditPushed: 0,
  deliveryPushed: 0,
  lastAuditAt: new Date().toISOString(),
  lastDeliveryAt: new Date().toISOString(),
  lastTickAt: null as string | null,
  lastError: null as string | null,
};

const httpServer = createServer((req, res) => {
  // Health endpoint
  if (req.url === "/" || req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      service: "realtime-service",
      status: "running",
      uptime: Math.floor((Date.now() - stats.startedAt.getTime()) / 1000),
      ...stats,
    }, null, 2));
    return;
  }
  res.writeHead(404);
  res.end("Not found");
});

const io = new Server(httpServer, {
  path: "/",
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

io.on("connection", (socket) => {
  stats.connections = io.engine.clientsCount;
  console.log(`[realtime] client connected: ${socket.id} (total: ${stats.connections})`);

  // Send current stats on connect
  socket.emit("stats", { ...stats, lastTickAt: stats.lastTickAt });

  socket.on("subscribe", (data: { channels?: string[] }) => {
    // Optional filter — currently we broadcast to all, but this could be
    // extended to filter events by entity type.
    if (data?.channels?.length) {
      // Join channel-specific rooms
      for (const ch of data.channels) {
        socket.join(`ch:${ch}`);
      }
    }
  });

  socket.on("ping", () => {
    socket.emit("pong", { at: new Date().toISOString() });
  });

  socket.on("disconnect", () => {
    stats.connections = io.engine.clientsCount;
    console.log(`[realtime] client disconnected: ${socket.id} (total: ${stats.connections})`);
  });
});

/**
 * Poll the audit-logs API for entries newer than the last-seen timestamp.
 * Broadcast any new entries to all connected clients.
 */
async function pollAuditLogs() {
  try {
    const url = `${NEXT_APP}/api/audit-logs?since=${encodeURIComponent(stats.lastAuditAt)}&limit=50`;
    const res = await fetch(url);
    if (!res.ok) {
      stats.lastError = `audit HTTP ${res.status}`;
      return;
    }
    const data = (await res.json()) as { rows?: AuditRow[] };
    if (!data.rows || data.rows.length === 0) return;
    // Sort ascending by createdAt so we emit in chronological order
    const rows = data.rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const row of rows) {
      io.emit("audit:new", { row });
      stats.auditPushed++;
    }
    // Update last seen to the most recent entry
    stats.lastAuditAt = rows[rows.length - 1].createdAt;
    stats.lastError = null;
  } catch (err) {
    stats.lastError = err instanceof Error ? err.message : String(err);
  }
}

/**
 * Poll the recent delivery logs (via /api/logs) for entries newer than the
 * last seen timestamp.
 */
async function pollDeliveries() {
  try {
    const url = `${NEXT_APP}/api/logs?since=${encodeURIComponent(stats.lastDeliveryAt)}&limit=50`;
    const res = await fetch(url);
    if (!res.ok) {
      // Don't overwrite lastError from audit poll; just bail.
      return;
    }
    const data = (await res.json()) as DeliveryRow[] | { rows?: DeliveryRow[] };
    const rows = Array.isArray(data) ? data : data.rows || [];
    if (rows.length === 0) return;
    rows.sort((a, b) => a.ranAt.localeCompare(b.ranAt));
    for (const row of rows) {
      io.emit("delivery:new", { row });
      stats.deliveryPushed++;
    }
    stats.lastDeliveryAt = rows[rows.length - 1].ranAt;
  } catch {
    /* swallowed — audit poll handles error reporting */
  }
}

/**
 * Trigger the scheduler runner and broadcast the tick result.
 */
async function schedulerTick() {
  try {
    const res = await fetch(`${NEXT_APP}/api/scheduled/run?t=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) return;
    const data = (await res.json()) as { processed?: number; sent?: number; failed?: number };
    stats.ticks++;
    stats.lastTickAt = new Date().toISOString();
    if (data.processed && data.processed > 0) {
      io.emit("scheduler:tick", {
        processed: data.processed,
        sent: data.sent || 0,
        failed: data.failed || 0,
        at: stats.lastTickAt,
      });
      console.log(`[realtime] scheduler tick: processed ${data.processed}`);
    }
  } catch {
    /* swallowed */
  }
}

console.log(`[realtime-service] listening on port ${PORT}`);
console.log(`[realtime-service] polling ${NEXT_APP} every ${POLL_INTERVAL_MS / 1000}s`);

// Initial polls shortly after startup
setTimeout(pollAuditLogs, 1500);
setTimeout(pollDeliveries, 2000);
setTimeout(schedulerTick, 3000);

setInterval(pollAuditLogs, POLL_INTERVAL_MS);
setInterval(pollDeliveries, POLL_INTERVAL_MS);
setInterval(schedulerTick, SCHEDULER_TICK_MS);

// Broadcast stats every 10s
setInterval(() => {
  io.emit("stats", { ...stats });
}, 10000);

// Graceful shutdown
const shutdown = (signal: string) => {
  console.log(`[realtime-service] received ${signal}, shutting down...`);
  io.close();
  httpServer.close(() => process.exit(0));
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
