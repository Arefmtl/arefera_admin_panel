"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  Users,
  Radio,
  Clock,
  Send,
  CheckCircle2,
  XCircle,
  CalendarClock,
  Activity,
  ArrowUpRight,
  Inbox,
  Server,
  Repeat,
  AlertTriangle,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiFetch, formatDate, StatCard, timeAgo, type LogRow, type ScheduledMessage } from "./shared";
import { ChartTooltip } from "./chart-tooltip";
import { useI18n } from "@/lib/i18n";

type DashboardData = {
  counts: {
    admins: number;
    channels: number;
    activeChannels: number;
    pendingScheduled: number;
    sentScheduled: number;
    failedScheduled: number;
    cancelledScheduled?: number;
    totalScheduled: number;
    postsToday: number;
    logsToday: number;
  };
  trend: { date: string; sent: number; failed: number }[];
  sparklines: {
    pending: number[];
    sent: number[];
    failed: number[];
    channels: number[];
  };
  repeatDistribution: { name: string; value: number; color: string }[];
  channelPerformance: { title: string; sent: number; failed: number }[];
  recentLogs: (LogRow & { message: { title: string } | null })[];
  upcoming: ScheduledMessage[];
};

export function Dashboard({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [schedulerOnline, setSchedulerOnline] = useState<boolean | null>(null);
  const { t } = useI18n();

  const load = async () => {
    const [dashRes, schedRes] = await Promise.all([
      apiFetch<DashboardData>("/api/dashboard"),
      apiFetch<{ status: string }>("/api/scheduler/status"),
    ]);
    if (dashRes.error) {
      toast.error(dashRes.error);
    } else {
      setData(dashRes.data);
    }
    setSchedulerOnline(schedRes.data?.status === "online");
    setLoading(false);
  };

  useEffect(() => {
    const run = async () => {
      await load();
    };
    run();
    const i = setInterval(run, 20000);
    return () => clearInterval(i);
  }, []);

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div className="h-14 rounded-xl bg-muted/40 animate-pulse" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-5 space-y-3">
              <div className="h-3 w-24 rounded bg-muted animate-pulse" />
              <div className="h-7 w-16 rounded bg-muted animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
              <div className="h-3 w-32 rounded bg-muted/70 animate-pulse" />
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <div className="h-4 w-32 rounded bg-muted animate-pulse" />
          <div className="h-3 w-48 rounded bg-muted/70 animate-pulse" />
          <div className="h-56 w-full rounded bg-muted/30 animate-pulse" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-6 space-y-4">
              <div className="h-4 w-32 rounded bg-muted animate-pulse" />
              <div className="h-48 w-full rounded bg-muted/30 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const c = data.counts;
  const successRate =
    c.sentScheduled + c.failedScheduled > 0
      ? Math.round((c.sentScheduled / (c.sentScheduled + c.failedScheduled)) * 100)
      : 100;

  return (
    <div className="space-y-6">
      {/* Page header — title + subtitle with generous top spacing */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mt-2"
      >
        <h2 className="text-2xl font-bold tracking-tight">{t("dashboard.heading")}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t("dashboard.subtitle")}</p>
      </motion.div>

      {/* Scheduler status banner — emerald radial bloom + inline-flex badge */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
      >
        <div
          className={`bg-mesh-emerald flex items-center gap-3 rounded-xl border p-3.5 ${schedulerOnline ? "border-emerald-200/70" : "border-amber-200 bg-amber-50/60"}`}
        >
          <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${schedulerOnline ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300"}`}>
            <Server className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            {/* Title + status badge inline — keeps the "running" indicator tightly bound to the title */}
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium">
                {schedulerOnline ? t("dashboard.schedulerOnline") : t("dashboard.schedulerOffline")}
              </p>
              <Badge
                variant="outline"
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-semibold ${schedulerOnline ? "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800" : "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800"}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full animate-pulse ${schedulerOnline ? "bg-emerald-500" : "bg-amber-500"}`} />
                {schedulerOnline ? t("dashboard.running") : t("dashboard.standby")}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {schedulerOnline ? t("dashboard.schedulerOnlineDesc") : t("dashboard.schedulerOfflineDesc")}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Stat cards — all icons consistent at h-5 w-5 via StatCard.
          Mobile: 1 col stack; sm: 2 col; lg: 4 col. */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: CalendarClock, label: t("dashboard.pendingScheduled"), value: c.pendingScheduled, hint: t("dashboard.waitingToFire"), tone: "amber" as const, delay: 0, sparkline: data.sparklines?.pending, sparklineColor: "#f59e0b" },
          { icon: Send, label: t("dashboard.sent"), value: c.sentScheduled, hint: `${successRate}% ${t("dashboard.successRate")}`, tone: "emerald" as const, delay: 0.05, sparkline: data.sparklines?.sent, sparklineColor: "#10b981" },
          { icon: Radio, label: t("dashboard.channels"), value: c.channels, hint: `${c.activeChannels} ${t("dashboard.active")}`, tone: "teal" as const, delay: 0.1, sparkline: data.sparklines?.channels, sparklineColor: "#14b8a6" },
          { icon: Users, label: t("dashboard.admins"), value: c.admins, hint: t("dashboard.botOperators"), tone: "violet" as const, delay: 0.15, sparkline: undefined, sparklineColor: undefined },
        ].map((card) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: card.delay }}
            className="card-hover-lift"
          >
            <StatCard icon={card.icon} label={card.label} value={card.value} hint={card.hint} tone={card.tone} sparkline={card.sparkline} sparklineColor={card.sparklineColor} />
          </motion.div>
        ))}
      </div>

      {/* Delivery trend */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }}>
        <Card>
          <CardHeader className="flex flex-row items-start justify-between space-y-0 gap-2">
            <div className="min-w-0">
              <CardTitle className="break-words">{t("dashboard.deliveryTrend")}</CardTitle>
              <CardDescription>{t("dashboard.deliveryTrendDesc")}</CardDescription>
            </div>
            {/* Custom legend — prominent colored dots at top-right */}
            <div className="flex items-center gap-3 rounded-full border border-border/70 bg-muted/40 px-3 py-1.5 text-xs font-medium shrink-0">
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
                {t("status.sent")}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full bg-rose-400 shadow-sm shadow-rose-400/50" />
                {t("status.failed")}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {/* mobile-scroll: chart stays full-width inside, scrollable on narrow viewports.
                min-w ensures axis labels never truncate even on 320px. */}
            <div className="h-64 mobile-scroll">
              <div className="h-full min-w-[480px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.trend} margin={{ top: 8, right: 12, left: 4, bottom: 40 }}>
                    <defs>
                      <linearGradient id="gSent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gFail" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#fb7185" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#fb7185" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.005 160)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10 }}
                      stroke="oklch(0.6 0.01 160)"
                      tickLine={false}
                      axisLine={false}
                      label={{ value: "Date (last 14 days)", position: "insideBottom", offset: -2, fontSize: 10, fill: "oklch(0.55 0.01 160)" }}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 10 }}
                      stroke="oklch(0.6 0.01 160)"
                      tickLine={false}
                      axisLine={false}
                      label={{ value: "Deliveries", angle: -90, position: "insideLeft", offset: 16, fontSize: 10, fill: "oklch(0.55 0.01 160)" }}
                    />
                    <Tooltip
                      content={<ChartTooltip payloadLabels={[["sent", "Sent"], ["failed", "Failed"]]} />}
                      cursor={{ stroke: "#10b981", strokeWidth: 1, strokeDasharray: "4 4" }}
                    />
                    <Area type="monotone" dataKey="sent" stroke="#10b981" strokeWidth={2.5} fill="url(#gSent)" name="Sent" />
                    <Area type="monotone" dataKey="failed" stroke="#fb7185" strokeWidth={2.5} fill="url(#gFail)" name="Failed" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
              Total over 14 days: <span className="font-semibold text-foreground tabular-nums">{data.trend.reduce((s, d) => s + d.sent + d.failed, 0)}</span> deliveries ·
              {" "}<span className="text-emerald-600 font-medium">{data.trend.reduce((s, d) => s + d.sent, 0)} sent</span> ·
              {" "}<span className="text-rose-600 font-medium">{data.trend.reduce((s, d) => s + d.failed, 0)} failed</span>
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Repeat distribution + Channel performance */}
      <div className="grid gap-4 lg:grid-cols-2">
        <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, delay: 0.25 }}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Repeat className="h-4 w-4 text-teal-600" /> {t("dashboard.repeatDistribution")}
              </CardTitle>
              <CardDescription>{t("dashboard.repeatDistributionDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="h-48 w-48 shrink-0 relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.repeatDistribution}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={75}
                        paddingAngle={2}
                      >
                        {data.repeatDistribution.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip payloadLabels={[["value", "Count"]]} />} />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Donut center label */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <p className="text-2xl font-bold tabular-nums text-foreground">{data.repeatDistribution.reduce((s, d) => s + d.value, 0)}</p>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">total</p>
                  </div>
                </div>
                <ul className="flex-1 space-y-2">
                  {data.repeatDistribution.map((d) => {
                    const total = data.repeatDistribution.reduce((s, x) => s + x.value, 0);
                    const pct = total === 0 ? 0 : Math.round((d.value / total) * 100);
                    return (
                      <li key={d.name} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                          {d.name}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="font-medium tabular-nums">{d.value}</span>
                          <span className="text-[10px] text-muted-foreground tabular-nums">{pct}%</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, delay: 0.3 }}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Radio className="h-4 w-4 text-emerald-600" /> {t("dashboard.channelPerformance")}
              </CardTitle>
              <CardDescription>{t("dashboard.channelPerformanceDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              {data.channelPerformance.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Radio className="h-8 w-8 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground mt-2">No delivery data yet.</p>
                </div>
              ) : (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.channelPerformance} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.005 160)" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} stroke="oklch(0.6 0.01 160)" tickLine={false} axisLine={false} allowDecimals={false} />
                      <YAxis type="category" dataKey="title" tick={{ fontSize: 11 }} stroke="oklch(0.6 0.01 160)" tickLine={false} axisLine={false} width={90} />
                      <Tooltip
                        content={<ChartTooltip payloadLabels={[["sent", "Sent"], ["failed", "Failed"]]} />}
                        cursor={{ fill: "color-mix(in oklch, var(--emerald-500, #10b981) 8%, transparent)" }}
                      />
                      <Bar dataKey="sent" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="failed" stackId="a" fill="#fb7185" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="flex items-center gap-3 text-xs mt-2">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Sent</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rose-400" /> Failed</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Upcoming + Recent activity */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-emerald-600" /> {t("dashboard.upcoming")}
              </CardTitle>
              <CardDescription>{t("dashboard.upcomingDesc")}</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onNavigate("scheduled")}>
              {t("dashboard.viewAll")} <ArrowUpRight className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            {data.upcoming.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Inbox className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground mt-2">{t("dashboard.noUpcoming")}</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => onNavigate("scheduled")}>
                  {t("dashboard.scheduleOne")}
                </Button>
              </div>
            ) : (
              <ul className="space-y-3">
                {data.upcoming.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 p-3 hover:bg-accent/40 transition-colors">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{m.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{formatDate(m.scheduledAt)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="text-xs">{timeAgo(m.scheduledAt).replace("in ", "")}</Badge>
                      {m.repeat !== "none" && <Badge variant="outline" className="text-xs capitalize bg-emerald-50 text-emerald-700 border-emerald-200">{m.repeat}</Badge>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-teal-600" /> {t("dashboard.recentActivity")}
              </CardTitle>
              <CardDescription>{t("dashboard.recentActivityDesc")}</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onNavigate("scheduled")}>
              {t("dashboard.details")} <ArrowUpRight className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            {data.recentLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Activity className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground mt-2">{t("dashboard.noDeliveries")}</p>
              </div>
            ) : (
              <ul className="space-y-2.5 max-h-72 overflow-y-auto scrollbar-thin pr-1">
                {data.recentLogs.map((log) => (
                  <li key={log.id} className="flex items-center gap-3 text-sm">
                    {log.success ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-rose-500 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate">
                        <span className="font-medium">{log.message?.title || "Message"}</span>
                        <span className="text-muted-foreground"> → {log.channelTitle}</span>
                      </p>
                      {!log.success && log.error ? (
                        <p className="text-xs text-rose-500 truncate">{log.error}</p>
                      ) : null}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{timeAgo(log.ranAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
