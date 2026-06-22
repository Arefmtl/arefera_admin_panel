"use client";

/**
 * Realtime client for the Telegram Bot Admin Panel.
 *
 * Connects to the realtime-service (socket.io on port 3003 via XTransformPort)
 * and surfaces new audit-log and delivery events to React components.
 *
 * Falls back to 10-second polling of /api/audit-logs and /api/logs when the
 * socket connection cannot be established (e.g., the mini-service is offline).
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { io, type Socket } from "socket.io-client";

export type RealtimeEvent =
  | {
      kind: "audit";
      id: string;
      action: string;
      entity: string;
      title: string | null;
      detail: string | null;
      actor: string;
      createdAt: string;
    }
  | {
      kind: "delivery";
      id: string;
      channelTitle: string;
      success: boolean;
      error: string | null;
      ranAt: string;
      messageTitle: string | null;
    }
  | {
      kind: "scheduler";
      processed: number;
      sent: number;
      failed: number;
      at: string;
    };

export type RealtimeStatus = "connecting" | "online" | "offline";

const MAX_EVENTS = 50;

type Options = {
  enabled?: boolean;
  onEvent?: (event: RealtimeEvent) => void;
};

export function useRealtimeEvents(options: Options = {}) {
  const { enabled = true, onEvent } = options;
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  const [lastTick, setLastTick] = useState<{
    processed: number;
    sent: number;
    failed: number;
    at: string;
  } | null>(null);
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const pushEvent = useCallback((event: RealtimeEvent) => {
    setEvents((prev) => {
      const next = [event, ...prev];
      return next.slice(0, MAX_EVENTS);
    });
    onEventRef.current?.(event);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let socket: Socket | null = null;
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let lastAuditSeen = new Date().toISOString();
    let lastDeliverySeen = new Date().toISOString();
    let mounted = true;

    const startPolling = () => {
      if (pollInterval) return;
      // Poll every 10s as a fallback / supplement to socket.io
      const poll = async () => {
        if (!mounted) return;
        try {
          const [auditRes, logsRes] = await Promise.all([
            fetch(`/api/audit-logs?since=${encodeURIComponent(lastAuditSeen)}&limit=20`).then((r) => r.json()),
            fetch(`/api/logs?since=${encodeURIComponent(lastDeliverySeen)}&limit=20`).then((r) => r.json()),
          ]);
          if (!mounted) return;
          const auditRows: any[] = auditRes?.rows || [];
          const logRows: any[] = Array.isArray(logsRes) ? logsRes : logsRes?.rows || [];
          if (auditRows.length > 0) {
            auditRows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
            for (const row of auditRows) {
              pushEvent({
                kind: "audit",
                id: row.id,
                action: row.action,
                entity: row.entity,
                title: row.title,
                detail: row.detail,
                actor: row.actor,
                createdAt: row.createdAt,
              });
            }
            lastAuditSeen = auditRows[auditRows.length - 1].createdAt;
          }
          if (logRows.length > 0) {
            logRows.sort((a, b) => a.ranAt.localeCompare(b.ranAt));
            for (const row of logRows) {
              pushEvent({
                kind: "delivery",
                id: row.id,
                channelTitle: row.channelTitle,
                success: row.success,
                error: row.error,
                ranAt: row.ranAt,
                messageTitle: row.message?.title || null,
              });
            }
            lastDeliverySeen = logRows[logRows.length - 1].ranAt;
          }
        } catch {
          /* swallowed */
        }
      };
      poll();
      pollInterval = setInterval(poll, 10000);
    };

    const stopPolling = () => {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    };

    try {
      socket = io("/?XTransformPort=3003", {
        transports: ["websocket", "polling"],
        forceNew: true,
        reconnection: true,
        reconnectionAttempts: 8,
        reconnectionDelay: 1500,
        timeout: 8000,
      });

      socket.on("connect", () => {
        if (!mounted) return;
        setStatus("online");
        // Keep polling at lower frequency as a redundancy check.
      });

      socket.on("disconnect", () => {
        if (!mounted) return;
        setStatus("offline");
        startPolling();
      });

      socket.on("connect_error", () => {
        if (!mounted) return;
        setStatus("offline");
        startPolling();
      });

      socket.on("audit:new", (data: { row: any }) => {
        if (!mounted || !data?.row) return;
        const row = data.row;
        pushEvent({
          kind: "audit",
          id: row.id,
          action: row.action,
          entity: row.entity,
          title: row.title,
          detail: row.detail,
          actor: row.actor,
          createdAt: row.createdAt,
        });
        lastAuditSeen = row.createdAt;
      });

      socket.on("delivery:new", (data: { row: any }) => {
        if (!mounted || !data?.row) return;
        const row = data.row;
        pushEvent({
          kind: "delivery",
          id: row.id,
          channelTitle: row.channelTitle,
          success: row.success,
          error: row.error,
          ranAt: row.ranAt,
          messageTitle: row.message?.title || null,
        });
        lastDeliverySeen = row.ranAt;
      });

      socket.on("scheduler:tick", (data: { processed: number; sent: number; failed: number; at: string }) => {
        if (!mounted || !data) return;
        setLastTick(data);
        pushEvent({
          kind: "scheduler",
          processed: data.processed,
          sent: data.sent,
          failed: data.failed,
          at: data.at,
        });
      });
    } catch {
      // Defer to avoid synchronous setState in effect body.
      setTimeout(() => setStatus("offline"), 0);
      startPolling();
    }

    // Always start polling as a safety net for the first 10s before socket connects.
    // If socket connects successfully, polling will run alongside (harmless duplication
    // is avoided because both update `lastAuditSeen` / `lastDeliverySeen`).
    const initialPoll = setTimeout(startPolling, 1500);

    return () => {
      mounted = false;
      clearTimeout(initialPoll);
      stopPolling();
      if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
      }
    };
  }, [enabled, pushEvent]);

  const clearEvents = useCallback(() => setEvents([]), []);

  return { events, status, lastTick, clearEvents };
}
