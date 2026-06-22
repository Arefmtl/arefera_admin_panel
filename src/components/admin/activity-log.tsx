"use client";

import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  Plus,
  Pencil,
  Trash2,
  Ban,
  Copy,
  Send,
  Play,
  Settings as SettingsIcon,
  ListChecks,
  Search,
  Filter,
  Radio,
  Users,
  FileText,
  Megaphone,
  CalendarClock,
  Activity as ActivityIcon,
  RefreshCw,
  X,
  Download,
  Trash,
  ChevronDown,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { apiFetch, formatDate, timeAgo, type AuditLogRow } from "./shared";
import { useI18n } from "@/lib/i18n";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { downloadFile, timestampedFilename } from "@/lib/export-utils";

type AuditResponse = {
  rows: AuditLogRow[];
  total: number;
  entities: { entity: string; count: number }[];
  actions: { action: string; count: number }[];
};

const ACTION_META: Record<string, { icon: typeof Plus; color: string; label: string }> = {
  create: { icon: Plus, color: "text-emerald-600 bg-emerald-100 dark:bg-emerald-900/40", label: "Created" },
  update: { icon: Pencil, color: "text-amber-600 bg-amber-100 dark:bg-amber-900/40", label: "Updated" },
  delete: { icon: Trash2, color: "text-rose-600 bg-rose-100 dark:bg-rose-900/40", label: "Deleted" },
  cancel: { icon: Ban, color: "text-orange-600 bg-orange-100 dark:bg-orange-900/40", label: "Cancelled" },
  clone: { icon: Copy, color: "text-cyan-600 bg-cyan-100 dark:bg-cyan-900/40", label: "Cloned" },
  send: { icon: Send, color: "text-teal-600 bg-teal-100 dark:bg-teal-900/40", label: "Broadcast" },
  run: { icon: Play, color: "text-emerald-600 bg-emerald-100 dark:bg-emerald-900/40", label: "Scheduler run" },
  login: { icon: Users, color: "text-violet-600 bg-violet-100 dark:bg-violet-900/40", label: "Login" },
  settings: { icon: SettingsIcon, color: "text-zinc-600 bg-zinc-100 dark:bg-zinc-800", label: "Settings" },
  bulk: { icon: ListChecks, color: "text-teal-600 bg-teal-100 dark:bg-teal-900/40", label: "Bulk" },
};

const ENTITY_META: Record<string, { icon: typeof Radio; label: string }> = {
  scheduled: { icon: CalendarClock, label: "Scheduled message" },
  channel: { icon: Radio, label: "Channel" },
  admin: { icon: Users, label: "Admin" },
  template: { icon: FileText, label: "Template" },
  post: { icon: Megaphone, label: "Post" },
  settings: { icon: SettingsIcon, label: "Settings" },
  broadcast: { icon: Megaphone, label: "Broadcast" },
};

export function ActivityLog() {
  const { t: tt } = useI18n();
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [retentionOpen, setRetentionOpen] = useState(false);
  const [retentionDays, setRetentionDays] = useState("30");
  const [purging, setPurging] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Entity + Action chip options. Lowercase values are used internally when
  // building the API query string; labels are localized via i18n.
  const ENTITY_CHIPS: { value: string; label: string }[] = [
    { value: "all", label: tt("activity.entity.all") },
    { value: "scheduled", label: tt("activity.entity.scheduled") },
    { value: "channel", label: tt("activity.entity.channel") },
    { value: "template", label: tt("activity.entity.template") },
    { value: "admin", label: tt("activity.entity.admin") },
    { value: "settings", label: tt("activity.entity.settings") },
    { value: "broadcast", label: tt("activity.entity.broadcast") },
  ];
  const ACTION_CHIPS: { value: string; label: string }[] = [
    { value: "all", label: tt("activity.action.all") },
    { value: "create", label: tt("activity.action.create") },
    { value: "update", label: tt("activity.action.update") },
    { value: "delete", label: tt("activity.action.delete") },
    { value: "cancel", label: tt("activity.action.cancel") },
    { value: "run", label: tt("activity.action.run") },
    { value: "send", label: tt("activity.action.send") },
    { value: "login", label: tt("activity.action.login") },
    { value: "pause", label: tt("activity.action.pause") },
    { value: "resume", label: tt("activity.action.resume") },
  ];

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    const params = new URLSearchParams();
    if (actionFilter !== "all") params.set("action", actionFilter);
    if (entityFilter !== "all") params.set("entity", entityFilter);
    params.set("limit", "200");
    const { data, error } = await apiFetch<AuditResponse>(`/api/audit-logs?${params.toString()}`);
    if (error) toast.error(error);
    else setData(data);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    const run = async () => {
      await load();
    };
    run();
  }, [actionFilter, entityFilter]);

  const filtered = useMemo(() => {
    if (!data?.rows) return [];
    if (!search.trim()) return data.rows;
    const q = search.toLowerCase();
    return data.rows.filter(
      (r) =>
        (r.title ?? "").toLowerCase().includes(q) ||
        (r.detail ?? "").toLowerCase().includes(q) ||
        r.action.toLowerCase().includes(q) ||
        r.entity.toLowerCase().includes(q),
    );
  }, [data, search]);

  const hasFilters = actionFilter !== "all" || entityFilter !== "all" || search.trim() !== "";

  const clearFilters = () => {
    setActionFilter("all");
    setEntityFilter("all");
    setSearch("");
  };

  const purgeOldLogs = async () => {
    const days = parseInt(retentionDays, 10);
    if (!Number.isFinite(days) || days <= 0) {
      toast.error("Enter a valid number of days");
      return;
    }
    setPurging(true);
    const before = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await apiFetch<{ deleted: number }>(
      `/api/audit-logs?before=${encodeURIComponent(before)}`,
      { method: "DELETE" },
    );
    setPurging(false);
    setRetentionOpen(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(`Deleted ${data?.deleted ?? 0} log entries older than ${days} days`);
    load(true);
  };

  const purgeAllLogs = async () => {
    setPurging(true);
    const { data, error } = await apiFetch<{ deleted: number }>(`/api/audit-logs`, {
      method: "DELETE",
    });
    setPurging(false);
    setRetentionOpen(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(`Cleared all ${data?.deleted ?? 0} log entries`);
    load(true);
  };

  const exportLogs = async (format: "csv" | "json") => {
    setExporting(true);
    try {
      const res = await fetch(`/api/export?type=audit&format=${format}`);
      if (!res.ok) {
        toast.error("Export failed");
        return;
      }
      const text = await res.text();
      downloadFile(
        text,
        timestampedFilename("audit-logs", format),
        format === "csv" ? "text/csv;charset=utf-8" : "application/json",
      );
      toast.success(`Exported audit logs as ${format.toUpperCase()}`);
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Activity log</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Audit trail of every admin action across the panel. Last 200 entries shown.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" disabled={exporting || !data || data.total === 0}>
                <Download className="h-4 w-4" />
                {exporting ? "Exporting…" : "Export"}
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-44 p-1" align="end">
              <button
                onClick={() => exportLogs("csv")}
                className="w-full text-left rounded-md px-2.5 py-1.5 text-sm hover:bg-accent transition-colors flex items-center gap-2"
              >
                <Download className="h-3.5 w-3.5 text-emerald-600" /> CSV file
              </button>
              <button
                onClick={() => exportLogs("json")}
                className="w-full text-left rounded-md px-2.5 py-1.5 text-sm hover:bg-accent transition-colors flex items-center gap-2"
              >
                <Download className="h-3.5 w-3.5 text-teal-600" /> JSON file
              </button>
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="sm" onClick={() => setRetentionOpen(true)}>
            <Trash className="h-4 w-4 text-rose-500" /> Retention
          </Button>
          <Button variant="outline" size="sm" onClick={() => load(true)} disabled={refreshing}>
            <RefreshCw className={cn("h-4 w-4 mr-1.5", refreshing && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary tiles */}
      {data && (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          <Card className="overflow-hidden">
            <CardContent className="p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total events</p>
              <p className="text-2xl font-bold tabular-nums mt-1">{data.total}</p>
            </CardContent>
          </Card>
          {data.entities.slice(0, 5).map((e) => {
            const meta = ENTITY_META[e.entity];
            const Icon = meta?.icon ?? ActivityIcon;
            return (
              <Card key={e.entity} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-center gap-1.5">
                    <Icon className="h-3 w-3 text-muted-foreground" />
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">{meta?.label ?? e.entity}</p>
                  </div>
                  <p className="text-2xl font-bold tabular-nums mt-1">{e.count}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Filters bar — search + chip groups for entity & action */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2 text-base">
            <span className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-emerald-600" /> {tt("activity.filterTitle")}
            </span>
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="text-muted-foreground hover:text-foreground h-7"
              >
                <X className="h-3.5 w-3.5" /> {tt("activity.clearFilters")}
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search */}
          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title, detail, action, or entity…"
              className="pl-9"
            />
          </div>

          {/* Entity chip group */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {tt("activity.entityGroup")}
            </p>
            <div className="flex flex-wrap gap-2">
              {ENTITY_CHIPS.map((chip) => {
                const active = entityFilter === chip.value;
                return (
                  <Button
                    key={chip.value}
                    type="button"
                    variant={active ? "default" : "outline"}
                    size="sm"
                    aria-pressed={active}
                    onClick={() => setEntityFilter(chip.value)}
                    className={cn(
                      "h-7 rounded-full px-3 text-xs transition-all",
                      active
                        ? "bg-emerald-600 text-white hover:bg-emerald-700 border-emerald-600"
                        : "hover:border-emerald-300 hover:text-emerald-700 dark:hover:text-emerald-300",
                    )}
                  >
                    {chip.label}
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Action chip group */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {tt("activity.actionGroup")}
            </p>
            <div className="flex flex-wrap gap-2">
              {ACTION_CHIPS.map((chip) => {
                const active = actionFilter === chip.value;
                return (
                  <Button
                    key={chip.value}
                    type="button"
                    variant={active ? "default" : "outline"}
                    size="sm"
                    aria-pressed={active}
                    onClick={() => setActionFilter(chip.value)}
                    className={cn(
                      "h-7 rounded-full px-3 text-xs transition-all",
                      active
                        ? "bg-emerald-600 text-white hover:bg-emerald-700 border-emerald-600"
                        : "hover:border-emerald-300 hover:text-emerald-700 dark:hover:text-emerald-300",
                    )}
                  >
                    {chip.label}
                  </Button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <ActivityIcon className="h-4 w-4 text-emerald-600" /> Timeline
            </span>
            <span className="text-xs font-normal text-muted-foreground">
              {filtered.length} of {data?.total ?? 0} events
            </span>
          </CardTitle>
          <CardDescription>Newest first · grouped by day</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3">
                  <Skeleton className="h-9 w-9 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                  <Skeleton className="h-3 w-16" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <div className="h-14 w-14 rounded-2xl bg-accent mx-auto flex items-center justify-center mb-3">
                <ActivityIcon className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">No activity matches your filters</p>
              <p className="text-xs text-muted-foreground mt-1">Try adjusting or clearing the filters.</p>
              {hasFilters && (
                <Button variant="outline" size="sm" className="mt-4" onClick={clearFilters}>
                  {tt("activity.clearFilters")}
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-6 max-h-[700px] overflow-y-auto scrollbar-thin pr-2">
              {groupByDay(filtered).map(({ day, items }) => (
                <div key={day}>
                  <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm py-1.5 mb-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{day}</p>
                  </div>
                  <ol className="space-y-2 relative before:absolute before:left-[18px] before:top-2 before:bottom-2 before:w-px before:bg-border/60">
                    {items.map((log, i) => {
                      const meta = ACTION_META[log.action] ?? {
                        icon: ActivityIcon,
                        color: "text-muted-foreground bg-muted",
                        label: log.action,
                      };
                      const entityMeta = ENTITY_META[log.entity];
                      const Icon = meta.icon;
                      return (
                        <motion.li
                          key={log.id}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2, delay: Math.min(i * 0.015, 0.3) }}
                          className="flex items-start gap-3 relative"
                        >
                          <div className={cn(
                            "h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ring-4 ring-card relative z-10",
                            meta.color,
                          )}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0 rounded-lg border border-border/60 bg-card hover:bg-accent/30 transition-colors p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge variant="outline" className="text-[10px] capitalize bg-background">
                                    {meta.label}
                                  </Badge>
                                  {entityMeta && (
                                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                                      <entityMeta.icon className="h-3 w-3" /> {entityMeta.label}
                                    </span>
                                  )}
                                  {log.title && (
                                    <span className="text-sm font-medium truncate">
                                      {log.title}
                                    </span>
                                  )}
                                </div>
                                {log.detail && (
                                  <p className="text-xs text-muted-foreground mt-1.5 break-words">
                                    {log.detail}
                                  </p>
                                )}
                                {log.meta && (
                                  <MetaChips raw={log.meta} />
                                )}
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-xs font-medium text-muted-foreground">{timeAgo(log.createdAt)}</p>
                                <p className="text-[10px] text-muted-foreground/70 mt-0.5">{formatDate(log.createdAt)}</p>
                              </div>
                            </div>
                          </div>
                        </motion.li>
                      );
                    })}
                  </ol>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Retention / cleanup dialog */}
      <AlertDialog open={retentionOpen} onOpenChange={setRetentionOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash className="h-5 w-5 text-rose-500" />
              Audit log retention
            </AlertDialogTitle>
            <AlertDialogDescription>
              Free up storage by deleting old log entries. This cannot be undone — consider exporting first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Delete entries older than
              </p>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(e.target.value)}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">days</span>
                <Button
                  size="sm"
                  variant="destructive"
                  className="ml-auto"
                  onClick={purgeOldLogs}
                  disabled={purging}
                >
                  {purging ? "Deleting…" : "Delete old entries"}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Will delete entries created before{" "}
                <span className="font-medium text-foreground">
                  {formatDate(
                    new Date(Date.now() - (parseInt(retentionDays, 10) || 0) * 24 * 60 * 60 * 1000).toISOString(),
                  )}
                </span>
                .
              </p>
            </div>

            <div className="rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-900 p-3 space-y-2">
              <p className="text-xs font-medium text-rose-700 dark:text-rose-300 uppercase tracking-wide">
                Danger zone — clear everything
              </p>
              <p className="text-[11px] text-rose-700/80 dark:text-rose-300/80">
                Permanently delete <strong>all</strong> audit log entries. Export first if you need a backup.
              </p>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  if (confirm("Delete ALL audit log entries? This cannot be undone.")) {
                    purgeAllLogs();
                  }
                }}
                disabled={purging}
                className="w-full sm:w-auto"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {purging ? "Clearing…" : "Clear all entries"}
              </Button>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function groupByDay(rows: AuditLogRow[]): { day: string; items: AuditLogRow[] }[] {
  const groups = new Map<string, AuditLogRow[]>();
  for (const r of rows) {
    const d = new Date(r.createdAt);
    const day = d.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day)!.push(r);
  }
  return Array.from(groups.entries()).map(([day, items]) => ({ day, items }));
}

function MetaChips({ raw }: { raw: string }) {
  let parsed: Record<string, unknown> = {};
  try {
    const p = JSON.parse(raw);
    if (p && typeof p === "object") parsed = p as Record<string, unknown>;
  } catch {
    return null;
  }
  const entries = Object.entries(parsed).slice(0, 6);
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {entries.map(([k, v]) => (
        <span
          key={k}
          className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground"
        >
          <span className="text-emerald-700 dark:text-emerald-400">{k}</span>
          <span>=</span>
          <span className="max-w-[120px] truncate">{typeof v === "string" ? v : JSON.stringify(v)}</span>
        </span>
      ))}
    </div>
  );
}
