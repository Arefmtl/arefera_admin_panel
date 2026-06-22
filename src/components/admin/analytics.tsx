"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp,
  CheckCircle2,
  XCircle,
  Activity,
  Radio,
  ListChecks,
  AlertTriangle,
  Repeat,
  Clock,
  Trophy,
  Award,
  Loader2,
  ChevronRight,
  X,
  Info,
  RefreshCw,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip as UITooltip,
  TooltipTrigger as UITooltipTrigger,
  TooltipContent as UITooltipContent,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { apiFetch, formatDate, timeAgo, type AnalyticsData, type LogRow } from "./shared";
import { ChartTooltip } from "./chart-tooltip";
import { useI18n } from "@/lib/i18n";

const REPEAT_LABEL: Record<string, string> = {
  none: "Once",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

const HOUR_LABEL = (h: number) =>
  `${String(h).padStart(2, "0")}:00`;

export function Analytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // ISO8601 timestamp returned by /api/analytics — used to render "Last updated
  // Xs ago" next to the Refresh button. `null` until the first successful load.
  const [computedAt, setComputedAt] = useState<string | null>(null);
  // Ticking state so the "Last updated Xs ago" indicator re-renders on its own
  // without the user needing to interact with the page.
  const [, setNowTick] = useState(0);
  const [drilldownChannel, setDrilldownChannel] = useState<{ id: string; title: string } | null>(null);
  const { t: tt } = useI18n();

  useEffect(() => {
    const run = async () => {
      const { data, error } = await apiFetch<AnalyticsData & { _cached?: boolean; computedAt?: string }>(
        "/api/analytics",
      );
      if (error) toast.error(error);
      else {
        setData(data);
        setComputedAt(data.computedAt ?? new Date().toISOString());
      }
      setLoading(false);
    };
    run();
  }, []);

  // Re-render every 20s so "Last updated Xs ago" stays fresh.
  useEffect(() => {
    const id = setInterval(() => setNowTick((n) => n + 1), 20_000);
    return () => clearInterval(id);
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    const { data, error } = await apiFetch<AnalyticsData & { computedAt?: string }>(
      "/api/analytics?fresh=1",
    );
    if (error) {
      toast.error(error);
    } else {
      setData(data);
      setComputedAt(data.computedAt ?? new Date().toISOString());
      toast.success(tt("analytics.refresh"));
    }
    setRefreshing(false);
  };

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    );
  }

  const t = data.totals;

  // Heatmap color for an absolute count value (0..∞).
  // 5-step emerald gradient — matches the legend ranges explicitly.
  // 10+ bucket uses the darkest emerald (best contrast against muted neighbors).
  const heatColor = (count: number) => {
    if (count === 0) return "bg-muted";
    if (count <= 2) return "bg-emerald-200/70 dark:bg-emerald-900/30";
    if (count <= 5) return "bg-emerald-300/80 dark:bg-emerald-800/40";
    if (count <= 10) return "bg-emerald-500 dark:bg-emerald-600/80";
    return "bg-emerald-600 dark:bg-emerald-500";
  };

  // Heatmap legend entries — explicit 5-step color scale with count ranges.
  const HEAT_LEGEND: { label: string; cls: string }[] = [
    { label: "0", cls: "bg-muted" },
    { label: "1–2", cls: "bg-emerald-200/70 dark:bg-emerald-900/30" },
    { label: "3–5", cls: "bg-emerald-300/80 dark:bg-emerald-800/40" },
    { label: "6–10", cls: "bg-emerald-500 dark:bg-emerald-600/80" },
    { label: "10+", cls: "bg-emerald-600 dark:bg-emerald-500" },
  ];

  return (
    <div className="space-y-6">
      {/* Header — title + Refresh button + "Last updated" indicator (Task 11-c).
          The rest of the analytics card grid / heatmap is owned by Task 11-a
          and is left untouched here. */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-semibold tracking-tight">Analytics</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={refresh}
              disabled={refreshing}
              className="h-7 gap-1.5 text-xs"
              aria-label={tt("analytics.refresh")}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
              {refreshing ? tt("analytics.refreshing") : tt("analytics.refresh")}
            </Button>
            {computedAt ? (
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {tt("analytics.lastUpdated").replace("{{when}}", timeAgo(computedAt))}
              </span>
            ) : (
              <span className="text-[11px] text-muted-foreground">
                {tt("analytics.neverRefreshed")}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Deep dive into delivery performance, channel health, and error patterns over the last 30 days.
          </p>
        </div>
        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 self-start">
          <Clock className="h-3 w-3 mr-1" /> {formatDate(data.range.from)} → {formatDate(data.range.to)}
        </Badge>
      </div>

      {/* Totals strip — labels truncate on mobile, so we show short mobile labels and full desktop labels */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            icon: Activity,
            label: "Total deliveries",
            shortLabel: "TOTAL",
            value: t.totalLogs,
            hint: "Delivery log entries (last 30 days)",
            tone: "from-emerald-500/15 to-emerald-500/5 text-emerald-700 dark:text-emerald-300",
            delay: 0,
            tooltip: tt("analytics.metric.totalDeliveries"),
          },
          {
            icon: CheckCircle2,
            label: "Successful",
            shortLabel: "SUCCESS",
            value: t.totalSent,
            hint: `${t.overallRate ?? 0}% overall success rate`,
            tone: "from-teal-500/15 to-teal-500/5 text-teal-700 dark:text-teal-300",
            delay: 0.05,
            tooltip: tt("analytics.metric.successful"),
          },
          {
            icon: XCircle,
            label: "Failed",
            shortLabel: "FAIL",
            value: t.totalFailed,
            hint: `${t.totalLogs === 0 ? 0 : Math.round((t.totalFailed / t.totalLogs) * 100)}% of all deliveries`,
            tone: "from-rose-500/15 to-rose-500/5 text-rose-700 dark:text-rose-300",
            delay: 0.1,
            tooltip: tt("analytics.metric.failed"),
          },
          {
            icon: ListChecks,
            label: "Scheduled messages",
            shortLabel: "SCHED.",
            value: t.totalScheduled,
            hint: `${t.pendingScheduled} pending`,
            tone: "from-amber-500/15 to-amber-500/5 text-amber-700 dark:text-amber-300",
            delay: 0.15,
            tooltip: tt("analytics.metric.scheduled"),
          },
        ].map((c) => (
          <motion.div
            key={c.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: c.delay }}
          >
            <Card className="overflow-hidden relative card-hover-lift">
              <div className={cn("absolute inset-0 bg-gradient-to-br opacity-60 pointer-events-none", c.tone)} />
              <CardContent className="relative p-5 sm:p-6">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {/* Mobile: shorter label; Desktop: full label — both uppercase */}
                      <p className="text-[10px] sm:text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                        <span className="sm:hidden">{c.shortLabel}</span>
                        <span className="hidden sm:inline">{c.label}</span>
                      </p>
                      <UITooltip>
                        <UITooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label={tt("analytics.metricInfo")}
                            className="text-muted-foreground/60 hover:text-foreground transition-colors rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 shrink-0"
                          >
                            <Info className="h-3.5 w-3.5" />
                          </button>
                        </UITooltipTrigger>
                        <UITooltipContent side="bottom" className="max-w-[220px] leading-relaxed font-normal">
                          {c.tooltip}
                        </UITooltipContent>
                      </UITooltip>
                    </div>
                    <p className="text-2xl sm:text-3xl font-bold mt-2 tabular-nums">{c.value}</p>
                    <p className="text-[11px] sm:text-xs text-muted-foreground mt-1 leading-snug">{c.hint}</p>
                  </div>
                  <div className={cn("h-9 w-9 sm:h-10 sm:w-10 rounded-lg flex items-center justify-center bg-background/70 backdrop-blur-sm shrink-0", c.tone.split(" ").slice(-2).join(" "))}>
                    <c.icon className="h-4 w-4 sm:h-5 sm:w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Success rate trend + Hourly heatmap */}
      <div className="grid gap-4 lg:grid-cols-2 mt-2">
        <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, delay: 0.2 }}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-600" /> Success rate trend
              </CardTitle>
              <CardDescription>Daily delivery success % over the last 14 days</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.trend} margin={{ top: 8, right: 12, left: 4, bottom: 24 }}>
                    <defs>
                      <linearGradient id="rateGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.005 160)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      stroke="oklch(0.6 0.01 160)"
                      tickLine={false}
                      axisLine={false}
                      label={{ value: "Date (last 14 days)", position: "insideBottom", offset: -10, fontSize: 10, fill: "oklch(0.55 0.01 160)" }}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fontSize: 11 }}
                      stroke="oklch(0.6 0.01 160)"
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `${v}%`}
                      label={{ value: "Success %", angle: -90, position: "insideLeft", offset: 16, fontSize: 10, fill: "oklch(0.55 0.01 160)" }}
                    />
                    <Tooltip
                      content={<ChartTooltip payloadLabels={[["rate", "Success rate"]]} formatter={(v) => `${v}%`} />}
                      cursor={{ stroke: "#10b981", strokeWidth: 1, strokeDasharray: "4 4" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="rate"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: "#10b981", strokeWidth: 0 }}
                      activeDot={{ r: 5 }}
                      fill="url(#rateGrad)"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-border/60">
                <Stat label="Best day" value={`${Math.max(...data.trend.map((d) => d.rate))}%`} tone="text-emerald-600" />
                <Stat label="Avg" value={`${Math.round(data.trend.reduce((s, d) => s + d.rate, 0) / Math.max(1, data.trend.length))}%`} />
                <Stat label="Worst day" value={`${Math.min(...data.trend.map((d) => d.rate))}%`} tone="text-rose-600" />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, delay: 0.25 }}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-teal-600" /> Hourly delivery heatmap
              </CardTitle>
              <CardDescription>When messages fire (by hour of day, last 30 days)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-12 gap-1 mb-3">
                {data.hourly.map((h) => {
                  const total = h.sent + h.failed;
                  return (
                    <div
                      key={h.hour}
                      className={cn(
                        "aspect-square rounded-sm transition-all hover:scale-110 hover:ring-2 hover:ring-emerald-400/60 cursor-default",
                        "ring-1 ring-inset ring-black/5 dark:ring-white/5",
                        heatColor(total),
                      )}
                      title={`${HOUR_LABEL(h.hour)} — ${total} deliveries (✓${h.sent} / ✗${h.failed})`}
                    />
                  );
                })}
              </div>
              {/* Legend — explicit 5-step color scale with count ranges */}
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>00:00</span>
                <div className="flex items-center gap-1.5">
                  {HEAT_LEGEND.map((step, i) => (
                    <span key={i} className="flex items-center gap-1">
                      <span className={cn("h-2.5 w-2.5 rounded-sm ring-1 ring-inset ring-black/5 dark:ring-white/5", step.cls)} />
                      <span className="tabular-nums">{step.label}</span>
                    </span>
                  ))}
                </div>
                <span>23:00</span>
              </div>
              <div className="mt-4 pt-4 border-t border-border/60 grid grid-cols-3 gap-2">
                <Stat label="Peak hour" value={HOUR_LABEL(data.hourly.reduce((best, h) => (h.sent + h.failed > best.sent + best.failed ? h : best), data.hourly[0]).hour)} />
                <Stat label="Quiet hours" value={`${data.hourly.filter((h) => h.sent + h.failed === 0).length}/24`} />
                <Stat label="Active hours" value={`${data.hourly.filter((h) => h.sent + h.failed > 0).length}/24`} />
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Channel matrix */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.3 }}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-emerald-600" /> Channel health matrix
            </CardTitle>
            <CardDescription>
              Per-channel delivery success rate (last 30 days). Click a channel to inspect recent deliveries.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.channelMatrix.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">No channels yet.</div>
            ) : (
              <div className="space-y-2">
                {data.channelMatrix.map((ch, i) => (
                  <motion.button
                    key={ch.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, delay: 0.3 + i * 0.04 }}
                    onClick={() => setDrilldownChannel({ id: ch.id, title: ch.title })}
                    className="group grid grid-cols-12 gap-3 items-center rounded-lg border border-border/60 p-3 hover:bg-emerald-500/5 hover:border-emerald-500/40 transition-colors cursor-pointer w-full text-left"
                  >
                    <div className="col-span-12 sm:col-span-4 flex items-center gap-2 min-w-0">
                      <div className={cn(
                        "h-2 w-2 rounded-full shrink-0",
                        ch.active ? "bg-emerald-500" : "bg-muted-foreground/40",
                      )} />
                      <span className="font-medium text-sm truncate group-hover:text-emerald-700 dark:group-hover:text-emerald-300 transition-colors">{ch.title}</span>
                      {!ch.active && <Badge variant="outline" className="text-[10px]">paused</Badge>}
                    </div>
                    <div className="col-span-7 sm:col-span-5">
                      <div className="flex items-center gap-2">
                        <Progress value={ch.rate ?? 0} className="h-2 flex-1" />
                        <span className={cn(
                          "text-xs font-medium tabular-nums w-10 text-right",
                          ch.rate === null ? "text-muted-foreground" : ch.rate >= 80 ? "text-emerald-600" : ch.rate >= 50 ? "text-amber-600" : "text-rose-600",
                        )}>
                          {ch.rate === null ? "—" : `${ch.rate}%`}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {ch.sent} sent · {ch.failed} failed {ch.lastAt && `· last ${timeAgo(ch.lastAt)}`}
                      </p>
                    </div>
                    <div className="col-span-5 sm:col-span-3 text-right flex items-center justify-end gap-1">
                      <span className="text-sm font-semibold tabular-nums">{ch.total}</span>
                      <span className="text-xs text-muted-foreground"> total</span>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </motion.button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Top performing channels leaderboard */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.32 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-4 w-4 text-amber-600" /> Top performing channels
            </CardTitle>
            <CardDescription>Channels with the highest success rates</CardDescription>
          </CardHeader>
          <CardContent>
            {(() => {
              const top = data.channelMatrix
                .filter((c) => c.active && c.rate !== null && c.total > 0)
                .sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0))
                .slice(0, 3);
              if (top.length === 0) {
                return (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    No channel data yet
                  </div>
                );
              }
              const medals = ["🥇", "🥈", "🥉"];
              const podiumTints = [
                "border-amber-300/60 bg-amber-50/50 dark:bg-amber-950/20",
                "border-zinc-300/60 bg-zinc-50/50 dark:bg-zinc-900/30",
                "border-orange-300/60 bg-orange-50/50 dark:bg-orange-950/20",
              ];
              return (
                <div className="grid gap-3 sm:grid-cols-3">
                  {top.map((ch, i) => (
                    <motion.div
                      key={ch.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.25, delay: 0.35 + i * 0.06 }}
                      className={cn(
                        "relative rounded-xl border p-4 hover:shadow-md transition-shadow",
                        podiumTints[i],
                      )}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-2xl">{medals[i]}</span>
                        <span
                          className={cn(
                            "text-xs font-bold tabular-nums px-2 py-0.5 rounded-full",
                            (ch.rate ?? 0) >= 80
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                              : (ch.rate ?? 0) >= 50
                                ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                                : "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
                          )}
                        >
                          {ch.rate}%
                        </span>
                      </div>
                      <p className="font-semibold text-sm truncate">{ch.title}</p>
                      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" /> {ch.sent}
                        </span>
                        <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400">
                          <XCircle className="h-3 w-3" /> {ch.failed}
                        </span>
                        <span className="tabular-nums">{ch.total} total</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      </motion.div>

      {/* Top messages + Error breakdown */}
      <div className="grid gap-4 lg:grid-cols-2">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.35 }}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-600" /> Top messages
              </CardTitle>
              <CardDescription>Most-delivered messages (last 30 days)</CardDescription>
            </CardHeader>
            <CardContent>
              {data.topMessages.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">No deliveries yet.</div>
              ) : (
                <ol className="space-y-2">
                  {data.topMessages.map((m, i) => (
                    <li
                      key={m.id}
                      className="flex items-center gap-3 rounded-lg border border-border/60 p-3 hover:bg-emerald-500/5 hover:border-emerald-500/40 transition-colors cursor-default"
                    >
                      <div className={cn(
                        "h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                        i === 0 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" :
                        i === 1 ? "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" :
                        i === 2 ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" :
                        "bg-muted text-muted-foreground",
                      )}>
                        {i + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{m.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {REPEAT_LABEL[m.repeat] ?? m.repeat} · status: {m.status}
                        </p>
                      </div>
                      <Badge variant="outline" className="tabular-nums">{m.deliveries}</Badge>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.4 }}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-600" /> Error breakdown
              </CardTitle>
              <CardDescription>Most common delivery errors (last 30 days)</CardDescription>
            </CardHeader>
            <CardContent>
              {data.errorBreakdown.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                  <p>No errors recorded. Everything looks healthy.</p>
                </div>
              ) : (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.errorBreakdown} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.005 160)" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} stroke="oklch(0.6 0.01 160)" tickLine={false} axisLine={false} allowDecimals={false} />
                      <YAxis
                        type="category"
                        dataKey="error"
                        tick={{ fontSize: 10 }}
                        stroke="oklch(0.6 0.01 160)"
                        tickLine={false}
                        axisLine={false}
                        width={140}
                        tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 22)}…` : v)}
                      />
                      <Tooltip
                        content={<ChartTooltip payloadLabels={[["count", "Occurrences"]]} />}
                        cursor={{ fill: "color-mix(in oklch, #fb7185 8%, transparent)" }}
                      />
                      <Bar dataKey="count" fill="#fb7185" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              {data.errorBreakdown.length > 0 && (
                <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border/60">
                  {data.errorBreakdown.reduce((s, e) => s + e.count, 0)} total error occurrences across {data.errorBreakdown.length} unique error types.
                </p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Repeat performance */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.45 }}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Repeat className="h-4 w-4 text-teal-600" /> Performance by repeat type
            </CardTitle>
            <CardDescription>How each schedule cadence is performing</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {data.repeatPerformance.map((r) => (
                <div key={r.repeat} className="rounded-lg border border-border/60 p-4 hover:bg-emerald-500/5 hover:border-emerald-500/40 transition-colors cursor-default">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{REPEAT_LABEL[r.repeat] ?? r.repeat}</span>
                    {r.rate === null ? (
                      <span className="text-xs text-muted-foreground">no data</span>
                    ) : (
                      <Badge
                        variant="outline"
                        className={cn(
                          "tabular-nums",
                          r.rate >= 80 ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                          r.rate >= 50 ? "bg-amber-50 text-amber-700 border-amber-200" :
                          "bg-rose-50 text-rose-700 border-rose-200",
                        )}
                      >
                        {r.rate}%
                      </Badge>
                    )}
                  </div>
                  <div className="mt-3 flex items-end gap-2">
                    <span className="text-2xl font-bold tabular-nums">{r.total}</span>
                    <span className="text-xs text-muted-foreground mb-1">deliveries</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <span className="flex items-center gap-1 text-emerald-600">
                      <CheckCircle2 className="h-3 w-3" /> {r.sent}
                    </span>
                    <span className="flex items-center gap-1 text-rose-600">
                      <XCircle className="h-3 w-3" /> {r.failed}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Volume area chart */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.5 }}>
        <Card>
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-emerald-600" /> Delivery volume
              </CardTitle>
              <CardDescription>Sent vs failed deliveries per day (last 14 days)</CardDescription>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Sent
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-400" /> Failed
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.trend} margin={{ top: 8, right: 12, left: 4, bottom: 24 }}>
                  <defs>
                    <linearGradient id="aSent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="aFail" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#fb7185" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#fb7185" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.005 160)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    stroke="oklch(0.6 0.01 160)"
                    tickLine={false}
                    axisLine={false}
                    label={{ value: "Date (last 14 days)", position: "insideBottom", offset: -10, fontSize: 10, fill: "oklch(0.55 0.01 160)" }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11 }}
                    stroke="oklch(0.6 0.01 160)"
                    tickLine={false}
                    axisLine={false}
                    label={{ value: "Deliveries", angle: -90, position: "insideLeft", offset: 16, fontSize: 10, fill: "oklch(0.55 0.01 160)" }}
                  />
                  <Tooltip
                    content={<ChartTooltip payloadLabels={[["sent", "Sent"], ["failed", "Failed"]]} />}
                    cursor={{ stroke: "#10b981", strokeWidth: 1, strokeDasharray: "4 4" }}
                  />
                  <Area type="monotone" dataKey="sent" stroke="#10b981" strokeWidth={2.5} fill="url(#aSent)" name="Sent" />
                  <Area type="monotone" dataKey="failed" stroke="#fb7185" strokeWidth={2.5} fill="url(#aFail)" name="Failed" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Channel drilldown dialog */}
      <ChannelDrilldownDialog
        channel={drilldownChannel}
        onClose={() => setDrilldownChannel(null)}
      />
    </div>
  );
}

function ChannelDrilldownDialog({
  channel,
  onClose,
}: {
  channel: { id: string; title: string } | null;
  onClose: () => void;
}) {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!channel) return;
    let active = true;
    const run = async () => {
      setLoading(true);
      const { data, error } = await apiFetch<LogRow[]>(`/api/logs?channelId=${channel.id}&limit=50`);
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

  return (
    <Dialog open={!!channel} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-emerald-600" />
            {channel?.title ?? "Channel"}
          </DialogTitle>
          <DialogDescription>Recent delivery history for this channel</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-2 py-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="py-10 text-center">
            <Radio className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No deliveries to this channel yet.</p>
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
                        <p className="font-medium truncate">{log.message?.title || "(deleted)"}</p>
                        {!log.success && log.error && (
                          <p className="text-xs text-rose-500 truncate mt-0.5">{log.error}</p>
                        )}
                        <p className="text-[10px] text-muted-foreground mt-0.5">{formatDate(log.ranAt)}</p>
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(log.ranAt)}</span>
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

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="text-center">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("text-sm font-semibold tabular-nums mt-0.5", tone)}>{value}</p>
    </div>
  );
}
