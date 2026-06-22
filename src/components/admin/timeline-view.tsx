"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarClock,
  Radio,
  Plus,
  RefreshCw,
  Clock,
  Repeat,
  Zap,
} from "lucide-react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import { apiFetch, formatDate } from "./shared";
import { useI18n } from "@/lib/i18n";

export type TimelineItem = {
  id: string;
  title: string;
  text: string;
  format: "markdown" | "html";
  repeat: "none" | "daily" | "weekly" | "monthly";
  channelCount: number;
  nextRunAt: string | null;
  scheduledAt: string;
  fireAt: string;
};

const DAY_WIDTH = 168; // px per day
export const TIMELINE_DAYS = 14;
const HEADER_HEIGHT = 56;
const LANE_HEIGHT = 56;
const LANE_GAP = 8;
const MIN_BODY_HEIGHT = 420;

type RepeatStyle = {
  /** solid bar color (bg-*) */
  bar: string;
  /** pill border + ring tint (static, complete class) */
  pill: string;
  pillHover: string;
  /** text color */
  text: string;
  /** dot color used in legend */
  dot: string;
  label: "Once" | "Daily" | "Weekly" | "Monthly";
  Icon: typeof Repeat;
};

const REPEAT_STYLE: Record<TimelineItem["repeat"], RepeatStyle> = {
  none: {
    bar: "bg-emerald-500",
    pill: "border-emerald-200 dark:border-emerald-900/60",
    pillHover: "hover:border-emerald-400 hover:shadow-emerald-200/40",
    text: "text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500",
    label: "Once",
    Icon: Zap,
  },
  daily: {
    bar: "bg-cyan-500",
    pill: "border-cyan-200 dark:border-cyan-900/60",
    pillHover: "hover:border-cyan-400 hover:shadow-cyan-200/40",
    text: "text-cyan-700 dark:text-cyan-300",
    dot: "bg-cyan-500",
    label: "Daily",
    Icon: Repeat,
  },
  weekly: {
    bar: "bg-teal-500",
    pill: "border-teal-200 dark:border-teal-900/60",
    pillHover: "hover:border-teal-400 hover:shadow-teal-200/40",
    text: "text-teal-700 dark:text-teal-300",
    dot: "bg-teal-500",
    label: "Weekly",
    Icon: Repeat,
  },
  monthly: {
    bar: "bg-amber-500",
    pill: "border-amber-200 dark:border-amber-900/60",
    pillHover: "hover:border-amber-400 hover:shadow-amber-200/40",
    text: "text-amber-700 dark:text-amber-300",
    dot: "bg-amber-500",
    label: "Monthly",
    Icon: Repeat,
  },
};

/**
 * Greedy first-fit lane assignment. Items are sorted ascending by fireAt.
 * Each item is placed into the first lane whose previous occupant ends
 * before this item starts (with a small horizontal padding so neighboring
 * pills don't visually crowd). New lanes are added as needed.
 */
function assignLanes(items: TimelineItem[]): Map<string, number> {
  const sorted = [...items].sort(
    (a, b) => new Date(a.fireAt).getTime() - new Date(b.fireAt).getTime(),
  );
  // Lanes track the timestamp of the last occupant's fire time + a min spacing
  // equal to ~6h (so two messages within the same 6h window end up in
  // different lanes to avoid overlap).
  const MIN_SPACING_MS = 6 * 60 * 60 * 1000;
  const lanes: number[] = [];
  const result = new Map<string, number>();
  for (const item of sorted) {
    const t = new Date(item.fireAt).getTime();
    let placed = -1;
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i] + MIN_SPACING_MS <= t) {
        placed = i;
        break;
      }
    }
    if (placed === -1) {
      placed = lanes.length;
      lanes.push(t);
    } else {
      lanes[placed] = t;
    }
    result.set(item.id, placed);
  }
  return result;
}

export function TimelineView({
  onEdit,
  onCreate,
}: {
  onEdit: (id: string) => void;
  onCreate: () => void;
}) {
  const { t } = useI18n();
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await apiFetch<TimelineItem[]>("/api/scheduled/timeline");
    if (error) {
      setItems([]);
    } else {
      setItems(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    const run = async () => {
      await load();
    };
    run();
  }, []);

  // Mobile breakpoint detection (< 640px switches to vertical list)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Tick "now" every 60s so the marker stays fresh.
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(i);
  }, []);

  const startOfToday = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  const endOfTimeline = startOfToday + TIMELINE_DAYS * 24 * 60 * 60 * 1000;

  // Filter items into the visible 14-day window (defensive — the API already
  // returns 30-day items so we narrow to the visible window here).
  const visibleItems = useMemo(
    () =>
      items.filter((it) => {
        const ts = new Date(it.fireAt).getTime();
        return ts >= startOfToday && ts <= endOfTimeline;
      }),
    [items, startOfToday, endOfTimeline],
  );

  const lanes = useMemo(() => assignLanes(visibleItems), [visibleItems]);
  const laneCount = useMemo(() => {
    let max = 0;
    for (const l of lanes.values()) if (l > max) max = l;
    return max + 1;
  }, [lanes]);

  const bodyHeight = Math.max(MIN_BODY_HEIGHT, laneCount * (LANE_HEIGHT + LANE_GAP) + 24);
  const timelineHeight = HEADER_HEIGHT + bodyHeight;

  // Days array for header
  const days = useMemo(() => {
    const arr: { ts: number; weekday: string; date: string; isToday: boolean }[] = [];
    for (let i = 0; i < TIMELINE_DAYS; i++) {
      const d = new Date(startOfToday + i * 24 * 60 * 60 * 1000);
      arr.push({
        ts: d.getTime(),
        weekday: d.toLocaleDateString("en-GB", { weekday: "short" }),
        date: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
        isToday: i === 0,
      });
    }
    return arr;
  }, [startOfToday]);

  // "Now" marker X position (px from left of timeline content). Clamped to
  // [0, TIMELINE_DAYS * DAY_WIDTH] so it never escapes the timeline.
  const nowX = Math.max(
    0,
    Math.min(
      TIMELINE_DAYS * DAY_WIDTH,
      ((now - startOfToday) / (24 * 60 * 60 * 1000)) * DAY_WIDTH,
    ),
  );

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 space-y-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-48 rounded-md" />
            <Skeleton className="h-7 w-7 rounded-md" />
          </div>
          <Skeleton className="h-72 w-full rounded-lg" />
          <Skeleton className="h-3 w-32 rounded-md" />
        </CardContent>
      </Card>
    );
  }

  // Mobile: vertical list view
  if (isMobile) {
    return (
      <MobileTimelineView
        items={visibleItems}
        onEdit={onEdit}
        onCreate={onCreate}
      />
    );
  }

  // Empty state
  if (visibleItems.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <div className="flex flex-col items-center justify-center text-center py-16 px-6">
            <div className="h-14 w-14 rounded-2xl bg-accent flex items-center justify-center mb-4">
              <CalendarClock className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="text-base font-semibold text-foreground">
              {t("timeline.empty")}
            </h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              {t("timeline.next14Days")}
            </p>
            <div className="mt-5">
              <Button size="sm" onClick={onCreate}>
                <Plus className="h-4 w-4" /> {t("timeline.emptyCta")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        {/* Header row */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-emerald-600" />
              {t("timeline.upcoming")}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("timeline.next14Days")}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 mb-4 text-xs">
          {(["none", "daily", "weekly", "monthly"] as const).map((r) => {
            const s = REPEAT_STYLE[r];
            return (
              <div key={r} className="flex items-center gap-1.5">
                <span className={cn("h-2.5 w-2.5 rounded-sm", s.dot)} />
                <span className="text-muted-foreground">{s.label}</span>
              </div>
            );
          })}
        </div>

        {/* Timeline scroll area */}
        <div
          ref={scrollRef}
          className="overflow-x-auto scrollbar-thin rounded-lg border border-border bg-background/50"
        >
          <div
            className="relative"
            style={{ width: TIMELINE_DAYS * DAY_WIDTH, height: timelineHeight }}
          >
            {/* Day columns (background) */}
            {days.map((d, i) => (
              <div
                key={i}
                className={cn(
                  "absolute top-0 bottom-0 border-l border-border/60",
                  d.isToday && "bg-emerald-50/60 dark:bg-emerald-950/20",
                )}
                style={{ left: i * DAY_WIDTH, width: DAY_WIDTH }}
              >
                {/* Date label at top */}
                <div
                  className={cn(
                    "px-2 py-1.5 border-b border-border/60 text-xs",
                    d.isToday && "bg-emerald-100/70 dark:bg-emerald-900/30",
                  )}
                  style={{ height: HEADER_HEIGHT }}
                >
                  <div className="font-semibold truncate">{d.weekday}</div>
                  <div className="text-[10px] text-muted-foreground">{d.date}</div>
                </div>
                {/* Hour gridlines (every 6h) */}
                {[6, 12, 18].map((h) => (
                  <div
                    key={h}
                    className="absolute left-0 right-0 border-t border-dashed border-border/30"
                    style={{
                      top: HEADER_HEIGHT + (h / 24) * bodyHeight,
                    }}
                  >
                    <span className="absolute left-1 -top-2 text-[9px] text-muted-foreground bg-background/80 px-1 rounded">
                      {String(h).padStart(2, "0")}:00
                    </span>
                  </div>
                ))}
              </div>
            ))}

            {/* "Now" marker — dashed rose vertical line with badge at top */}
            <div
              className="absolute top-0 bottom-0 pointer-events-none z-30"
              style={{ left: nowX }}
              aria-hidden
            >
              <div className="h-full border-l-2 border-dashed border-rose-500" />
              <div className="absolute top-0 -translate-x-1/2 -translate-y-0 px-1.5 py-0.5 rounded bg-rose-500 text-white text-[10px] font-bold shadow-sm ring-2 ring-background whitespace-nowrap">
                {t("timeline.now")}
              </div>
            </div>

            {/* Pills */}
            <AnimatePresence>
              {visibleItems.map((item, idx) => {
                const lane = lanes.get(item.id) ?? 0;
                const x =
                  ((new Date(item.fireAt).getTime() - startOfToday) /
                    (24 * 60 * 60 * 1000)) *
                  DAY_WIDTH;
                const y = HEADER_HEIGHT + lane * (LANE_HEIGHT + LANE_GAP);
                const s = REPEAT_STYLE[item.repeat];
                const fireTime = new Date(item.fireAt).toLocaleTimeString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.25, delay: Math.min(idx * 0.03, 0.4) }}
                    className="absolute z-20"
                    style={{ left: x, top: y, width: DAY_WIDTH - 8, minWidth: 140 }}
                  >
                    <HoverCard openDelay={200} closeDelay={150}>
                      <HoverCardTrigger asChild>
                        <button
                          onClick={() => onEdit(item.id)}
                          title={item.title}
                          className={cn(
                            "group block w-full text-left rounded-md bg-card shadow-sm cursor-pointer",
                            "border ring-1 ring-transparent transition-all hover:scale-[1.02]",
                            "px-2.5 py-2",
                            s.pill,
                            s.pillHover,
                            "hover:shadow-md",
                          )}
                        >
                          <div className="flex items-center gap-1.5">
                            <span
                              className={cn(
                                "h-2 w-2 rounded-full shrink-0",
                                s.bar,
                              )}
                            />
                            <span className="text-sm font-semibold line-clamp-2 flex-1 leading-tight">
                              {item.title}
                            </span>
                            <s.Icon className={cn("h-3 w-3 shrink-0", s.text)} />
                          </div>
                          <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                            <Clock className="h-2.5 w-2.5" />
                            <span>{fireTime}</span>
                            <span className="ml-auto flex items-center gap-0.5">
                              <Radio className="h-2.5 w-2.5" /> {item.channelCount}
                            </span>
                          </div>
                        </button>
                      </HoverCardTrigger>
                      <HoverCardContent
                        className="w-72 p-3"
                        side="top"
                        align="center"
                        sideOffset={4}
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="text-sm font-semibold leading-tight">
                              {item.title}
                            </h4>
                            <span
                              className={cn(
                                "text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-accent shrink-0",
                                s.text,
                              )}
                            >
                              {s.label}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground font-mono line-clamp-3 whitespace-pre-wrap break-words">
                            {item.text}
                          </p>
                          <div className="flex items-center justify-between pt-1 border-t border-border/60 mt-2">
                            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {t("timeline.fireAt")}
                            </span>
                            <span className="text-[11px] font-medium tabular-nums">
                              {formatDate(item.fireAt)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                              <Radio className="h-3 w-3" />
                              {t("timeline.channels")}
                            </span>
                            <span className="text-[11px] font-medium tabular-nums">
                              {item.channelCount}
                            </span>
                          </div>
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MobileTimelineView({
  items,
  onEdit,
  onCreate,
}: {
  items: TimelineItem[];
  onEdit: (id: string) => void;
  onCreate: () => void;
}) {
  const { t } = useI18n();

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <div className="flex flex-col items-center justify-center text-center py-12 px-4">
            <div className="h-12 w-12 rounded-2xl bg-accent flex items-center justify-center mb-3">
              <CalendarClock className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-semibold">{t("timeline.empty")}</h3>
            <Button size="sm" onClick={onCreate} className="mt-3">
              <Plus className="h-4 w-4" /> {t("timeline.emptyCta")}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <CalendarClock className="h-4 w-4 text-emerald-600" />
          {t("timeline.upcoming")}
        </h3>
        <div className="space-y-2">
          <AnimatePresence>
            {items.map((item, idx) => {
              const s = REPEAT_STYLE[item.repeat];
              return (
                <motion.button
                  key={item.id}
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.2, delay: Math.min(idx * 0.02, 0.3) }}
                  onClick={() => onEdit(item.id)}
                  className={cn(
                    "w-full text-left rounded-lg bg-card p-3 shadow-sm",
                    "border ring-1 ring-transparent transition-all",
                    s.pill,
                    s.pillHover,
                    "hover:shadow-md",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2 w-2 rounded-full shrink-0", s.bar)} />
                    <span className="text-sm font-semibold truncate flex-1">
                      {item.title}
                    </span>
                    <s.Icon className={cn("h-3.5 w-3.5 shrink-0", s.text)} />
                  </div>
                  <p className="text-xs text-muted-foreground font-mono line-clamp-2 mt-1">
                    {item.text}
                  </p>
                  <div className="flex items-center justify-between mt-2 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {formatDate(item.fireAt)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Radio className="h-3 w-3" /> {item.channelCount}{" "}
                      {t("timeline.channels")}
                    </span>
                  </div>
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>
      </CardContent>
    </Card>
  );
}
