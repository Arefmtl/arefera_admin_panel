"use client";

/**
 * Notification Center — bell icon in the topbar with live event stream.
 *
 * Redesigned with category tabs (All / Deliveries / Schedules / Auth),
 * color-coded left-border event cards, mark-as-read, mark-all-read,
 * sound/mute toggle, and framer-motion AnimatePresence on items.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  CheckCircle2,
  XCircle,
  Plus,
  Pencil,
  Trash2,
  Ban,
  Copy,
  Send,
  RefreshCw,
  Settings as SettingsIcon,
  Radio,
  CalendarClock,
  Users,
  FileText,
  Zap,
  X,
  CheckCheck,
  Volume2,
  VolumeX,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useRealtimeEvents, type RealtimeEvent } from "@/lib/realtime";
import { timeAgo } from "./shared";

type Category = "all" | "deliveries" | "schedules" | "auth";

const CATEGORY_TABS: { id: Category; label: string }[] = [
  { id: "all", label: "All" },
  { id: "deliveries", label: "Deliveries" },
  { id: "schedules", label: "Schedules" },
  { id: "auth", label: "Auth" },
];

function eventCategory(e: RealtimeEvent): Category {
  if (e.kind === "delivery") return "deliveries";
  if (e.kind === "scheduler") return "schedules";
  // Audit events
  if (e.kind === "audit") {
    if (e.entity === "scheduled" || e.action === "run" || e.action === "pause" || e.action === "resume") return "schedules";
    if (e.entity === "admin" || e.action === "auth" || e.action === "login" || e.action === "logout") return "auth";
    if (e.entity === "settings") return "auth";
  }
  return "schedules";
}

const AUDIT_ICON: Record<string, typeof Plus> = {
  create: Plus,
  update: Pencil,
  delete: Trash2,
  cancel: Ban,
  clone: Copy,
  send: Send,
  run: RefreshCw,
  settings: SettingsIcon,
  bulk: Zap,
  pause: Ban,
  resume: RefreshCw,
};

const ENTITY_ICON: Record<string, typeof Radio> = {
  scheduled: CalendarClock,
  channel: Radio,
  admin: Users,
  template: FileText,
  post: Send,
  settings: SettingsIcon,
  broadcast: Send,
};

function eventIcon(e: RealtimeEvent): { Icon: typeof Plus; color: string; bg: string } {
  if (e.kind === "delivery") {
    return e.success
      ? { Icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-950/50" }
      : { Icon: XCircle, color: "text-rose-600", bg: "bg-rose-100 dark:bg-rose-950/50" };
  }
  if (e.kind === "scheduler") {
    return { Icon: Zap, color: "text-amber-600", bg: "bg-amber-100 dark:bg-amber-950/50" };
  }
  const Icon = AUDIT_ICON[e.action] || ENTITY_ICON[e.entity] || Bell;
  // Color by action
  switch (e.action) {
    case "create":
    case "send":
      return { Icon, color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-950/50" };
    case "delete":
    case "cancel":
      return { Icon, color: "text-rose-600", bg: "bg-rose-100 dark:bg-rose-950/50" };
    case "update":
    case "settings":
      return { Icon, color: "text-amber-600", bg: "bg-amber-100 dark:bg-amber-950/50" };
    case "clone":
    case "bulk":
      return { Icon, color: "text-teal-600", bg: "bg-teal-100 dark:bg-teal-950/50" };
    case "run":
      return { Icon, color: "text-teal-600", bg: "bg-teal-100 dark:bg-teal-950/50" };
    default:
      return { Icon, color: "text-zinc-600", bg: "bg-zinc-100 dark:bg-zinc-900" };
  }
}

/** Color-coded left border per event category. */
function eventBorderColor(e: RealtimeEvent): string {
  const cat = eventCategory(e);
  switch (cat) {
    case "deliveries":
      return e.kind === "delivery" && !(e as any).success ? "border-l-rose-500" : "border-l-emerald-500";
    case "schedules":
      return "border-l-amber-500";
    case "auth":
      return "border-l-rose-500";
    default:
      return "border-l-zinc-400";
  }
}

function eventTitle(e: RealtimeEvent): string {
  if (e.kind === "delivery") {
    return e.success
      ? `Delivered to ${e.channelTitle}`
      : `Failed: ${e.channelTitle}`;
  }
  if (e.kind === "scheduler") {
    return `Scheduler fired ${e.processed} message${e.processed === 1 ? "" : "s"}`;
  }
  return e.title || `${e.action} ${e.entity}`;
}

function eventDescription(e: RealtimeEvent): string | null {
  if (e.kind === "delivery") {
    return e.messageTitle ? `"${e.messageTitle}"${e.error ? ` — ${e.error}` : ""}` : e.error || null;
  }
  if (e.kind === "scheduler") {
    return `${e.sent} sent, ${e.failed} failed`;
  }
  return e.detail || null;
}

function eventTimestamp(e: RealtimeEvent): string {
  if (e.kind === "scheduler") return e.at;
  if (e.kind === "delivery") return e.ranAt;
  return e.createdAt;
}

function eventCategoryIcon(cat: Category): typeof Bell {
  switch (cat) {
    case "deliveries": return Send;
    case "schedules": return CalendarClock;
    case "auth": return Shield;
    default: return Bell;
  }
}

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [activeCategory, setActiveCategory] = useState<Category>("all");
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const { events, status, clearEvents } = useRealtimeEvents({
    enabled: true,
  });
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Mark all as seen when opened — defers setState to avoid synchronous call in effect body.
  useEffect(() => {
    if (!open || events.length === 0) return;
    const id = setTimeout(() => {
      setReadIds((prev) => {
        const next = new Set(prev);
        for (const e of events) next.add(e.id);
        return next;
      });
    }, 0);
    return () => clearTimeout(id);
  }, [open, events]);

  // Compute unread count (only count events not in readIds)
  const unreadCount = useMemo(() => {
    if (muted) return 0;
    return events.filter((e) => !readIds.has(e.id)).length;
  }, [events, readIds, muted]);

  const markAsRead = useCallback((id: string) => {
    setReadIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const markAllRead = useCallback(() => {
    setReadIds(new Set(events.map((e) => e.id)));
  }, [events]);

  // Filter events by category
  const filteredEvents = useMemo(() => {
    if (activeCategory === "all") return events;
    return events.filter((e) => eventCategory(e) === activeCategory);
  }, [events, activeCategory]);

  const statusColor =
    status === "online"
      ? "bg-emerald-500"
      : status === "connecting"
        ? "bg-amber-500 animate-pulse"
        : "bg-zinc-400";

  const statusLabel =
    status === "online" ? "Live" : status === "connecting" ? "Connecting…" : "Polling";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "relative h-9 w-9 rounded-lg border border-border bg-card hover:bg-accent flex items-center justify-center transition-colors",
          open && "bg-accent ring-2 ring-emerald-500/30",
        )}
        title="Notifications"
        aria-label="Notifications"
      >
        <Bell className={cn("h-4 w-4 text-muted-foreground", unreadCount > 0 && "text-emerald-600")} />
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </motion.span>
        )}
        <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-card">
          <span className={cn("block h-full w-full rounded-full", statusColor)} />
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-border bg-card shadow-2xl z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-border bg-gradient-to-r from-emerald-50/50 to-teal-50/50 dark:from-emerald-950/30 dark:to-teal-950/30">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-emerald-600" />
                <p className="text-sm font-semibold">Notifications</p>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="text-[10px] gap-1">
                  <span className={cn("h-1.5 w-1.5 rounded-full", statusColor)} />
                  {statusLabel}
                </Badge>
                <button
                  onClick={() => setMuted((m) => !m)}
                  className="h-7 w-7 rounded-md border border-border bg-card hover:bg-accent flex items-center justify-center transition-colors"
                  title={muted ? "Unmute badge" : "Mute badge"}
                  aria-label={muted ? "Unmute notifications" : "Mute notifications"}
                >
                  {muted ? (
                    <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <Volume2 className="h-3.5 w-3.5 text-emerald-600" />
                  )}
                </button>
              </div>
            </div>

            {/* Category tabs */}
            <div className="flex border-b border-border">
              {CATEGORY_TABS.map((tab) => {
                const TabIcon = eventCategoryIcon(tab.id);
                const isActive = activeCategory === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveCategory(tab.id)}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-medium transition-colors border-b-2",
                      isActive
                        ? "text-emerald-700 dark:text-emerald-300 border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20"
                        : "text-muted-foreground border-transparent hover:text-foreground hover:bg-accent/50",
                    )}
                  >
                    <TabIcon className="h-3 w-3" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Mark all read */}
            {filteredEvents.length > 0 && (
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/60 bg-muted/20">
                <span className="text-[10px] text-muted-foreground">
                  {filteredEvents.length} event{filteredEvents.length === 1 ? "" : "s"}
                </span>
                <button
                  onClick={markAllRead}
                  className="text-[10px] text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 font-medium flex items-center gap-1 transition-colors"
                >
                  <CheckCheck className="h-3 w-3" /> Mark all read
                </button>
              </div>
            )}

            {/* Events list */}
            <ScrollArea className="max-h-80">
              <div className="p-2">
                {filteredEvents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                    <div className="h-12 w-12 rounded-full bg-accent flex items-center justify-center mb-3">
                      <Bell className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium">
                      {activeCategory === "all" ? "No live events yet" : `No ${activeCategory} events`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {activeCategory === "all"
                        ? "New audit logs, deliveries, and scheduler ticks will appear here in real time."
                        : "Events matching this category will appear here."}
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-1">
                    <AnimatePresence initial={false}>
                      {filteredEvents.map((e) => {
                        const { Icon, color, bg } = eventIcon(e);
                        const isNew = !readIds.has(e.id);
                        const borderColor = eventBorderColor(e);
                        return (
                          <motion.li
                            key={`${e.kind}-${e.id}`}
                            initial={isNew ? { opacity: 0, x: -16 } : false}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 16, height: 0 }}
                            transition={{ duration: 0.3 }}
                            onClick={() => markAsRead(e.id)}
                            className={cn(
                              "flex items-start gap-2.5 rounded-lg p-2.5 border-l-3 cursor-pointer transition-all",
                              borderColor,
                              isNew
                                ? "bg-emerald-50/60 dark:bg-emerald-950/20 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                                : "opacity-60 hover:opacity-80 hover:bg-accent/40",
                            )}
                          >
                            <div className={cn("h-7 w-7 shrink-0 rounded-lg flex items-center justify-center", bg)}>
                              <Icon className={cn("h-3.5 w-3.5", color)} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className={cn("text-xs leading-tight", isNew ? "font-semibold" : "font-medium")}>
                                {eventTitle(e)}
                              </p>
                              {eventDescription(e) && (
                                <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                                  {eventDescription(e)}
                                </p>
                              )}
                              <p className="text-[10px] text-muted-foreground/70 mt-1">
                                {timeAgo(eventTimestamp(e))}
                              </p>
                            </div>
                            {isNew && (
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0 mt-2" />
                            )}
                          </motion.li>
                        );
                      })}
                    </AnimatePresence>
                  </ul>
                )}
              </div>
            </ScrollArea>

            {/* Footer */}
            <div className="flex items-center justify-between p-2.5 border-t border-border bg-card">
              <span className="text-[11px] text-muted-foreground">
                {events.length} event{events.length === 1 ? "" : "s"} in stream
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={() => {
                  clearEvents();
                  setReadIds(new Set());
                }}
              >
                <CheckCheck className="h-3.5 w-3.5" /> Clear all
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
