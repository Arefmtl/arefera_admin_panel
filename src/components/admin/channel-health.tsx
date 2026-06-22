"use client";

/**
 * Channel Health Monitor — operational status of every broadcast channel.
 *
 * Renders a grid of per-channel health cards (responsive: 1/2/3 columns).
 * Each card shows: title + @username, status badge, circular health-score
 * ring (SVG), 3-column mini stats (Total / Success rate / Last delivery),
 * last error preview, and a "View deliveries" button that opens an inline
 * delivery-log dialog powered by GET /api/logs?channelId=X.
 *
 * Channels are sorted worst-first (lowest healthScore first) so problems
 * draw attention. A header summary bar tallies healthy/degraded/critical.
 * The whole monitor is collapsible via a Show/Hide toggle.
 */

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  PauseCircle,
  ChevronDown,
  ChevronUp,
  Activity,
  Link2,
  RefreshCw,
  Inbox,
  ListChecks,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { apiFetch, formatDate, timeAgo, type LogRow } from "./shared";
import { useI18n } from "@/lib/i18n";

type HealthStatus = "healthy" | "degraded" | "critical" | "inactive";

type ChannelHealth = {
  channelId: string;
  title: string;
  username: string | null;
  active: boolean;
  totalDeliveries: number;
  successfulDeliveries: number;
  failedDeliveries: number;
  successRate: number | null;
  lastDeliveryAt: string | null;
  lastFailureAt: string | null;
  lastErrorMessage: string | null;
  healthScore: number;
  status: HealthStatus;
  trend: "up" | "down" | "flat";
  recentErrors24h: number;
};

const STATUS_META: Record<
  HealthStatus,
  {
    labelKey: string;
    icon: typeof CheckCircle2;
    badge: string;
    ring: string;
    score: string;
    glow: string;
  }
> = {
  healthy: {
    labelKey: "channels.health.status.healthy",
    icon: CheckCircle2,
    badge: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
    ring: "#10b981",
    score: "text-emerald-600 dark:text-emerald-400",
    glow: "from-emerald-400/15 to-transparent",
  },
  degraded: {
    labelKey: "channels.health.status.degraded",
    icon: AlertTriangle,
    badge: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
    ring: "#f59e0b",
    score: "text-amber-600 dark:text-amber-400",
    glow: "from-amber-400/15 to-transparent",
  },
  critical: {
    labelKey: "channels.health.status.critical",
    icon: XCircle,
    badge: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800",
    ring: "#f43f5e",
    score: "text-rose-600 dark:text-rose-400",
    glow: "from-rose-400/15 to-transparent",
  },
  inactive: {
    labelKey: "channels.health.status.inactive",
    icon: PauseCircle,
    badge: "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800/40 dark:text-zinc-400 dark:border-zinc-700",
    ring: "#a1a1aa",
    score: "text-zinc-500 dark:text-zinc-400",
    glow: "from-zinc-400/10 to-transparent",
  },
};

/** Circular SVG progress ring sized 84×84. */
function ScoreRing({ score, color }: { score: number; color: string }) {
  const size = 84;
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const offset = circumference - (clamped / 100) * circumference;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-muted/40"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums">{clamped}</span>
        <span className="text-[9px] uppercase tracking-wide text-muted-foreground">/100</span>
      </div>
    </div>
  );
}

function DeliveryLogDialog({
  channel,
  onClose,
}: {
  channel: ChannelHealth | null;
  onClose: () => void;
}) {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!channel) return;
    let active = true;
    const run = async () => {
      setLoading(true);
      const { data, error } = await apiFetch<LogRow[]>(
        `/api/logs?channelId=${channel.channelId}&limit=50`,
      );
      if (!active) return;
      if (error) {
        toast.error(error);
        setLogs([]);
      } else {
        setLogs(data || []);
      }
      setLoading(false);
    };
    run();
    return () => {
      active = false;
    };
  }, [channel]);

  const sent = logs.filter((l) => l.success).length;
  const failed = logs.length - sent;
  const meta = channel ? STATUS_META[channel.status] : null;

  return (
    <Dialog open={!!channel} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {meta && <meta.icon className="h-4 w-4" style={{ color: meta.ring }} />}
            {channel?.title ?? "Channel"}
            {channel?.username && (
              <span className="text-xs font-normal text-muted-foreground">
                @{channel.username}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            50 most recent delivery attempts to this channel
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-2 py-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="py-10 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No deliveries to this channel yet.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 rounded-lg border border-border p-3 bg-muted/30">
              <div className="text-center">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</p>
                <p className="text-lg font-bold tabular-nums">{logs.length}</p>
              </div>
              <div className="text-center border-x border-border/60">
                <p className="text-[10px] uppercase tracking-wide text-emerald-600">Sent</p>
                <p className="text-lg font-bold tabular-nums text-emerald-600">{sent}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] uppercase tracking-wide text-rose-600">Failed</p>
                <p className="text-lg font-bold tabular-nums text-rose-600">{failed}</p>
              </div>
            </div>
            <ScrollArea className="max-h-80">
              <ul className="space-y-1.5">
                <AnimatePresence initial={false}>
                  {logs.map((log) => (
                    <motion.li
                      key={log.id}
                      initial={{ opacity: 0, y: -2 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-start gap-2.5 rounded-md border border-border/60 p-2.5 text-sm"
                    >
                      {log.success ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">
                          {log.message?.title || "(deleted)"}
                        </p>
                        {!log.success && log.error && (
                          <p className="text-xs text-rose-500 truncate mt-0.5">{log.error}</p>
                        )}
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {formatDate(log.ranAt)}
                        </p>
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {timeAgo(log.ranAt)}
                      </span>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </ScrollArea>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function HealthCard({
  ch,
  index,
  onViewDeliveries,
}: {
  ch: ChannelHealth;
  index: number;
  onViewDeliveries: (ch: ChannelHealth) => void;
}) {
  const { t } = useI18n();
  const meta = STATUS_META[ch.status];
  const StatusIcon = meta.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.05, 0.5) }}
    >
      <Card className="card-hover-lift relative overflow-hidden h-full">
        {/* Top accent gradient by status — critical uses a taller + more saturated rose bar */}
        <div
          className={cn(
            "absolute inset-x-0 top-0 bg-gradient-to-r opacity-90",
            ch.status === "critical"
              ? "h-1.5 from-rose-500 to-rose-400 dark:from-rose-500 dark:to-rose-400"
              : "h-1 " + meta.glow,
          )}
        />
        <CardContent className="relative p-5 space-y-4">
          {/* Header: title + status badge + 24h error badge */}
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1 basis-full sm:basis-auto">
              <p className="font-semibold truncate-2 leading-tight break-words" title={ch.title}>{ch.title}</p>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5 min-w-0">
                {ch.username ? (
                  <span className="inline-flex items-center gap-1 min-w-0 truncate">
                    <Link2 className="h-3 w-3 shrink-0" />
                    <span className="truncate">@{ch.username}</span>
                  </span>
                ) : (
                  <span className="font-mono text-[11px]">id:{ch.channelId.slice(-6)}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
              {ch.recentErrors24h > 0 && (
                <Badge
                  variant="outline"
                  className="bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800 text-[10px] px-1.5 py-0 whitespace-nowrap"
                >
                  <AlertTriangle className="h-2.5 w-2.5" />
                  {ch.recentErrors24h} (24h)
                </Badge>
              )}
              <Badge
                variant="outline"
                className={cn(
                  "status-badge whitespace-nowrap",
                  meta.badge,
                  ch.status === "critical" && "animate-pulse ring-2 ring-rose-500/30 dark:ring-rose-500/40",
                )}
              >
                <StatusIcon className="h-3 w-3" />
                {t(meta.labelKey)}
              </Badge>
            </div>
          </div>

          {/* Score ring + 3-column mini stats */}
          <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
            <ScoreRing score={ch.healthScore} color={meta.ring} />
            <div className="flex-1 min-w-[180px] grid grid-cols-3 gap-2 text-center">
              <div className="min-w-0">
                <p className="text-[9px] sm:text-[10px] uppercase tracking-tight text-muted-foreground leading-tight">
                  <span className="sm:hidden">Total</span>
                  <span className="hidden sm:inline">{t("channels.health.total")}</span>
                </p>
                <p className="text-base sm:text-lg font-bold tabular-nums">{ch.totalDeliveries}</p>
              </div>
              <div className="border-x border-border/60 min-w-0">
                <p className="text-[9px] sm:text-[10px] uppercase tracking-tight text-muted-foreground leading-tight">
                  <span className="sm:hidden">Success</span>
                  <span className="hidden sm:inline">{t("channels.health.successRate")}</span>
                </p>
                <p
                  className={cn(
                    "text-base sm:text-lg font-bold tabular-nums inline-flex items-center justify-center gap-1",
                    ch.successRate === null
                      ? "text-muted-foreground"
                      : ch.successRate >= 80
                        ? "text-emerald-600 dark:text-emerald-400"
                        : ch.successRate >= 50
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-rose-600 dark:text-rose-400",
                  )}
                >
                  {ch.successRate === null ? "—" : `${ch.successRate}%`}
                  {ch.trend === "up" && <TrendingUp className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-emerald-500" />}
                  {ch.trend === "down" && <TrendingDown className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-rose-500" />}
                  {ch.trend === "flat" && ch.successRate !== null && <Minus className="h-3 w-3 text-muted-foreground/50" />}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-[9px] sm:text-[10px] uppercase tracking-tight text-muted-foreground leading-tight">
                  <span className="sm:hidden">Last</span>
                  <span className="hidden sm:inline">{t("channels.health.lastDelivery")}</span>
                </p>
                <p className="text-xs sm:text-sm font-semibold tabular-nums whitespace-nowrap">
                  {ch.lastDeliveryAt ? timeAgo(ch.lastDeliveryAt) : "never"}
                </p>
              </div>
            </div>
          </div>

          {/* Last error preview — wraps to 2 lines max with hover tooltip showing full text */}
          {ch.lastErrorMessage && (
            <div className="rounded-md border border-rose-200 bg-rose-50/70 dark:bg-rose-950/30 dark:border-rose-900 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-rose-700 dark:text-rose-300 font-medium flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {t("channels.health.lastError")}
              </p>
              <p
                className="text-xs text-rose-700 dark:text-rose-300 line-clamp-2 mt-0.5 break-words"
                title={ch.lastErrorMessage}
              >
                {ch.lastErrorMessage}
              </p>
            </div>
          )}

          {/* View deliveries button */}
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs sm:text-sm h-8 sm:h-9"
            onClick={() => onViewDeliveries(ch)}
          >
            <ListChecks className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{t("channels.health.viewDeliveries")}</span>
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function ChannelHealthMonitor() {
  const { t } = useI18n();
  const [data, setData] = useState<ChannelHealth[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [dialogChannel, setDialogChannel] = useState<ChannelHealth | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: d, error } = await apiFetch<ChannelHealth[]>("/api/channels/health");
    if (error) {
      toast.error(error);
      setData([]);
    } else {
      setData(d || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    const run = async () => {
      await load();
    };
    run();
  }, []);

  const summary = useMemo(() => {
    if (!data) return { healthy: 0, degraded: 0, critical: 0, inactive: 0 };
    return data.reduce(
      (acc, ch) => {
        acc[ch.status] += 1;
        return acc;
      },
      { healthy: 0, degraded: 0, critical: 0, inactive: 0 } as Record<HealthStatus, number>,
    );
  }, [data]);

  // Already sorted worst-first by the API; defensive re-sort in case.
  const sorted = useMemo(() => {
    if (!data) return [];
    return [...data].sort((a, b) => a.healthScore - b.healthScore);
  }, [data]);

  return (
    <div className="space-y-4">
      {/* Header — title + subtitle + summary + actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-emerald-600 shrink-0" />
            <h3 className="text-base font-semibold tracking-tight">
              {t("channels.health.title")}
            </h3>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("channels.health.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Summary bar */}
          <div className="hidden sm:flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
              <CheckCircle2 className="h-3 w-3" /> {summary.healthy}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
              <AlertTriangle className="h-3 w-3" /> {summary.degraded}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800">
              <XCircle className="h-3 w-3" /> {summary.critical}
            </span>
            {summary.inactive > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 font-medium text-zinc-600 dark:bg-zinc-800/40 dark:text-zinc-400 dark:border-zinc-700">
                <PauseCircle className="h-3 w-3" /> {summary.inactive}
              </span>
            )}
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={load} title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCollapsed((c) => !c)}
            className="h-8"
          >
            {collapsed ? (
              <>
                <ChevronDown className="h-3.5 w-3.5" /> {t("channels.health.show")}
              </>
            ) : (
              <>
                <ChevronUp className="h-3.5 w-3.5" /> {t("channels.health.hide")}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Mobile summary bar (always visible) */}
      <div className="flex sm:hidden items-center gap-2 text-xs flex-wrap">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
          <CheckCircle2 className="h-3 w-3" /> {summary.healthy} healthy
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
          <AlertTriangle className="h-3 w-3" /> {summary.degraded} degraded
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800">
          <XCircle className="h-3 w-3" /> {summary.critical} critical
        </span>
      </div>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            {loading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-56 rounded-xl" />
                ))}
              </div>
            ) : sorted.length === 0 ? (
              <Card>
                <CardContent className="p-0">
                  <div className="flex flex-col items-center justify-center text-center py-12 px-6">
                    <div className="h-12 w-12 rounded-2xl bg-accent flex items-center justify-center mb-3">
                      <Activity className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground max-w-sm">
                      {t("channels.health.empty")}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {sorted.map((ch, i) => (
                  <HealthCard
                    key={ch.channelId}
                    ch={ch}
                    index={i}
                    onViewDeliveries={setDialogChannel}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <DeliveryLogDialog
        channel={dialogChannel}
        onClose={() => setDialogChannel(null)}
      />
    </div>
  );
}
