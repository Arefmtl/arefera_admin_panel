"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { LucideIcon } from "lucide-react";

export type Admin = {
  id: string;
  telegramId: string;
  name: string | null;
  isOwner: boolean;
  createdAt: string;
};

export type Channel = {
  id: string;
  telegramId: string;
  title: string;
  username: string | null;
  type: string;
  active: boolean;
  createdAt: string;
};

export type ScheduledMessage = {
  id: string;
  title: string;
  text: string;
  format: "markdown" | "html";
  buttons: string | null;
  channelIds: string;
  scheduledAt: string;
  repeat: "none" | "daily" | "weekly" | "monthly";
  status: "pending" | "sent" | "failed" | "cancelled" | "paused";
  lastRunAt: string | null;
  nextRunAt: string | null;
  error: string | null;
  createdAt: string;
  _count?: { logs: number };
};

export type Post = {
  id: string;
  text: string;
  format: "markdown" | "html";
  buttons: string | null;
  createdAt: string;
};

export type Template = {
  id: string;
  name: string;
  text: string;
  format: "markdown" | "html";
  buttons: string | null;
  category: string;
  createdAt: string;
  updatedAt: string;
};

export type ButtonRow = { text: string; url: string }[];
export type ButtonConfig = ButtonRow[];

export type LogRow = {
  id: string;
  channelTitle: string;
  success: boolean;
  error: string | null;
  ranAt: string;
  message: { title: string } | null;
};

export type AuditLogRow = {
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

export type AnalyticsData = {
  range: { from: string; to: string };
  totals: {
    totalLogs: number;
    totalSent: number;
    totalFailed: number;
    overallRate: number | null;
    totalScheduled: number;
    pendingScheduled: number;
  };
  trend: { date: string; total: number; sent: number; failed: number; rate: number }[];
  hourly: { hour: number; sent: number; failed: number }[];
  channelMatrix: {
    id: string;
    title: string;
    active: boolean;
    sent: number;
    failed: number;
    total: number;
    rate: number | null;
    lastAt: string | null;
  }[];
  topMessages: {
    id: string;
    title: string;
    status: string;
    repeat: string;
    deliveries: number;
  }[];
  errorBreakdown: { error: string; count: number }[];
  repeatPerformance: {
    repeat: string;
    sent: number;
    failed: number;
    total: number;
    rate: number | null;
  }[];
};

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const abs = Math.abs(diff);
  const mins = Math.floor(abs / 60000);
  if (mins < 1) return diff >= 0 ? "just now" : "in a moment";
  if (mins < 60) return diff >= 0 ? `${mins}m ago` : `in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return diff >= 0 ? `${hrs}h ago` : `in ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return diff >= 0 ? `${days}d ago` : `in ${days}d`;
}

export function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function parseChannelIds(raw: string): string[] {
  try {
    const p = JSON.parse(raw);
    if (Array.isArray(p)) return p as string[];
  } catch {
    /* ignore */
  }
  return [];
}

export function parseButtons(raw: string | null): { text: string; url: string }[][] {
  if (!raw) return [];
  try {
    const p = JSON.parse(raw);
    if (Array.isArray(p)) return p;
  } catch {
    /* ignore */
  }
  return [];
}

export function StatusBadge({ status }: { status: ScheduledMessage["status"] }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: "Pending", cls: "bg-amber-100 text-amber-700 border-amber-200" },
    sent: { label: "Sent", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    failed: { label: "Failed", cls: "bg-rose-100 text-rose-700 border-rose-200" },
    cancelled: { label: "Cancelled", cls: "bg-zinc-100 text-zinc-500 border-zinc-200" },
    paused: { label: "Paused", cls: "bg-sky-100 text-sky-700 border-sky-200" },
  };
  const s = map[status] || map.pending;
  return (
    <Badge variant="outline" className={cn("font-medium", s.cls)}>
      {s.label}
    </Badge>
  );
}

export function RepeatBadge({ repeat }: { repeat: ScheduledMessage["repeat"] }) {
  const map: Record<string, { label: string; cls: string }> = {
    none: { label: "Once", cls: "bg-zinc-100 text-zinc-600 border-zinc-200" },
    daily: { label: "Daily", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    weekly: { label: "Weekly", cls: "bg-teal-100 text-teal-700 border-teal-200" },
    monthly: { label: "Monthly", cls: "bg-cyan-100 text-cyan-700 border-cyan-200" },
  };
  const s = map[repeat] || map.none;
  return (
    <Badge variant="outline" className={cn("font-medium", s.cls)}>
      {s.label}
    </Badge>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="h-14 w-14 rounded-2xl bg-accent flex items-center justify-center mb-4">
        <Icon className="h-7 w-7 text-muted-foreground" />
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "emerald",
  sparkline,
  sparklineColor,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint?: string;
  tone?: "emerald" | "amber" | "rose" | "teal" | "violet" | "cyan";
  sparkline?: number[];
  sparklineColor?: string;
}) {
  const tones: Record<string, { iconWrap: string; bar: string; glow: string }> = {
    emerald: {
      iconWrap: "bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-900",
      bar: "from-emerald-400 to-teal-500",
      glow: "group-hover:shadow-emerald-200/50",
    },
    amber: {
      iconWrap: "bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-400 dark:ring-amber-900",
      bar: "from-amber-400 to-orange-500",
      glow: "group-hover:shadow-amber-200/50",
    },
    rose: {
      iconWrap: "bg-rose-50 text-rose-600 ring-rose-100 dark:bg-rose-950/40 dark:text-rose-400 dark:ring-rose-900",
      bar: "from-rose-400 to-pink-500",
      glow: "group-hover:shadow-rose-200/50",
    },
    teal: {
      iconWrap: "bg-teal-50 text-teal-600 ring-teal-100 dark:bg-teal-950/40 dark:text-teal-400 dark:ring-teal-900",
      bar: "from-teal-400 to-cyan-500",
      glow: "group-hover:shadow-teal-200/50",
    },
    violet: {
      iconWrap: "bg-violet-50 text-violet-600 ring-violet-100 dark:bg-violet-950/40 dark:text-violet-400 dark:ring-violet-900",
      bar: "from-violet-400 to-purple-500",
      glow: "group-hover:shadow-violet-200/50",
    },
    cyan: {
      iconWrap: "bg-cyan-50 text-cyan-600 ring-cyan-100 dark:bg-cyan-950/40 dark:text-cyan-400 dark:ring-cyan-900",
      bar: "from-cyan-400 to-sky-500",
      glow: "group-hover:shadow-cyan-200/50",
    },
  };
  const t = tones[tone];

  // Build sparkline SVG polyline points
  const sparklineSvg = useMemo(() => {
    if (!sparkline || sparkline.length < 2) return null;
    const w = 80;
    const h = 24;
    const max = Math.max(...sparkline, 1);
    const step = w / (sparkline.length - 1);
    // If all zeros, draw a flat line at 50% height
    const allZero = sparkline.every((v) => v === 0);
    const points = sparkline
      .map((v, i) => {
        const x = i * step;
        const y = allZero ? h / 2 : h - (v / max) * (h - 4) - 2;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    // Calculate total length for animation
    let totalLen = 0;
    for (let i = 1; i < sparkline.length; i++) {
      const x1 = (i - 1) * step;
      const y1 = allZero ? h / 2 : h - (sparkline[i - 1] / max) * (h - 4) - 2;
      const x2 = i * step;
      const y2 = allZero ? h / 2 : h - (sparkline[i] / max) * (h - 4) - 2;
      totalLen += Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    }
    return { points, totalLen: Math.ceil(totalLen), w, h };
  }, [sparkline]);

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-sm",
        "transition-all duration-300 hover:shadow-md hover:-translate-y-0.5",
        t.glow,
      )}
    >
      {/* Top accent bar */}
      <div className={cn("absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r opacity-70", t.bar)} />
      {/* Subtle radial glow in top-right (decorative) */}
      <div className={cn(
        "absolute -top-8 -right-8 h-24 w-24 rounded-full bg-gradient-to-br opacity-0 group-hover:opacity-10 transition-opacity duration-500 blur-2xl",
        t.bar,
      )} />
      <div className="relative flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold mt-2 text-foreground tabular-nums">{value}</p>
          {hint ? <p className="text-xs text-muted-foreground mt-1">{hint}</p> : null}
          {/* Sparkline */}
          {sparklineSvg && (
            <svg
              width={sparklineSvg.w}
              height={sparklineSvg.h}
              viewBox={`0 0 ${sparklineSvg.w} ${sparklineSvg.h}`}
              className="mt-2 overflow-visible"
              aria-hidden="true"
            >
              <polyline
                points={sparklineSvg.points}
                fill="none"
                stroke={sparklineColor || "currentColor"}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-muted-foreground/40"
                style={{
                  strokeDasharray: sparklineSvg.totalLen,
                  strokeDashoffset: sparklineSvg.totalLen,
                  animation: `sparkline-draw 1s ease-out forwards`,
                }}
              />
            </svg>
          )}
        </div>
        <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center ring-1 shrink-0", t.iconWrap)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

export async function apiFetch<T = unknown>(
  url: string,
  options?: RequestInit,
): Promise<{ data: T | null; error: string | null; status: number }> {
  try {
    const res = await fetch(url, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* ignore */
    }
    if (!res.ok) {
      const err = (json as { error?: string } | null)?.error || `Request failed (${res.status})`;
      return { data: null, error: err, status: res.status };
    }
    return { data: json as T, error: null, status: res.status };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : "Network error", status: 0 };
  }
}
