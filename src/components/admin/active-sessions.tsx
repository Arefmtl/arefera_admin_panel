"use client";

/**
 * Active Sessions card — shows every active admin-panel session and lets
 * the admin revoke individual sessions (or all others) from the Settings
 * page. Each session is rendered as its own subtle bordered card with a
 * device icon wrapped in a colored circle (emerald for current, zinc for
 * others). The current session has an emerald left-border highlight.
 * Revoking a session triggers a smooth framer-motion exit animation
 * (opacity + translateX). Lists refresh every 30s automatically + on
 * manual click.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Monitor,
  Smartphone,
  Tablet,
  Trash2,
  RefreshCw,
  Loader2,
  Globe,
  Clock,
  Hourglass,
  ShieldCheck,
  ShieldOff,
  LogOut,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { apiFetch } from "./shared";
import { useI18n } from "@/lib/i18n";

type SessionRow = {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  ip: string | null;
  userAgent: string | null;
  isCurrent: boolean;
  browser: string;
  os: string;
};

/**
 * Pick a device-class icon from the parsed OS. We infer "mobile" from iOS /
 * Android and "tablet" from iPad / explicit tablet UAs; everything else
 * falls back to a desktop monitor icon.
 */
function deviceIconFor(os: string, userAgent: string | null) {
  if (/iPad/i.test(userAgent ?? "")) return Tablet;
  if (os === "iOS" || os === "Android") return Smartphone;
  return Monitor;
}

/** Format "Last seen" relative time:
 *  "just now" for <1m, "2m ago" for <1h, "1h ago" for <1d, "2d ago" for ≥1d */
function formatLastSeen(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/** Format "Expires in" — rounds to the nearest day (or hour if <1 day). */
function formatExpiresIn(iso: string): string {
  const remaining = new Date(iso).getTime() - Date.now();
  if (remaining <= 0) return "expired";
  const hours = Math.floor(remaining / 3_600_000);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function ActiveSessions() {
  const { t } = useI18n();
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const { data, error } = await apiFetch<{ sessions: SessionRow[] }>("/api/auth/sessions");
    if (error) {
      if (!silent) toast.error(error);
      setSessions(null);
    } else {
      setSessions(data?.sessions ?? []);
    }
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const { data, error } = await apiFetch<{ sessions: SessionRow[] }>("/api/auth/sessions");
      if (cancelled) return;
      if (error) {
        toast.error(error);
        setSessions(null);
      } else {
        setSessions(data?.sessions ?? []);
      }
      setLoading(false);
    };
    run();
    refreshTimer.current = setInterval(() => load(true), 30_000);
    return () => {
      cancelled = true;
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    };
  }, []);

  const revoke = async (id: string) => {
    setRevokingId(id);
    const { error } = await apiFetch(`/api/auth/sessions/${id}`, { method: "DELETE" });
    setRevokingId(null);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(t("settings.sessions.revoked"));
    // Optimistic + server-reconciled refresh.
    setSessions((prev) => prev?.filter((s) => s.id !== id) ?? null);
    load(true);
  };

  const revokeAll = async () => {
    setRevokingAll(true);
    const { data, error } = await apiFetch<{ ok: boolean; revoked: number }>(
      "/api/auth/sessions",
      { method: "POST" },
    );
    setRevokingAll(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(t("settings.sessions.revokedAll"));
    load(true);
    return data?.revoked ?? 0;
  };

  const otherCount = sessions?.filter((s) => !s.isCurrent).length ?? 0;

  return (
    <Card className="card-hover-lift">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              {t("settings.sessions.title")}
            </CardTitle>
            <CardDescription>{t("settings.sessions.subtitle")}</CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => load()}
            disabled={loading}
            aria-label={t("action.refresh")}
            title={t("action.refresh")}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          // Skeleton — 3 placeholder rows so the card doesn't jump on load.
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg border border-border/60 p-3"
              >
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className="h-2.5 w-56" />
                </div>
                <Skeleton className="h-8 w-16" />
              </div>
            ))}
          </div>
        ) : !sessions || sessions.length === 0 ? (
          // Empty state — shield-off icon illustration for no sessions.
          <div className="flex flex-col items-center justify-center text-center py-10 px-6">
            <div className="h-14 w-14 rounded-2xl bg-accent flex items-center justify-center mb-3">
              <ShieldOff className="h-7 w-7 text-muted-foreground/60" />
            </div>
            <p className="text-sm text-muted-foreground">{t("settings.sessions.empty")}</p>
          </div>
        ) : (
          <>
            <AnimatePresence initial={false}>
              {sessions.map((s) => {
                const DeviceIcon = deviceIconFor(s.os, s.userAgent);
                const isRevoking = revokingId === s.id;
                return (
                  <motion.div
                    key={s.id}
                    layout
                    initial={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -24, height: 0, marginTop: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    className={
                      "rounded-lg border p-3.5 transition-colors " +
                      (s.isCurrent
                        ? "border-l-2 border-l-emerald-500 border-emerald-200 bg-emerald-50/40 dark:border-l-emerald-400 dark:border-emerald-900 dark:bg-emerald-950/20"
                        : "border-border/60 hover:bg-accent/40")
                    }
                  >
                    <div className="flex items-center gap-3">
                      {/* Device icon in colored circle — emerald for current, zinc for others */}
                      <div
                        className={
                          "h-10 w-10 shrink-0 rounded-full flex items-center justify-center " +
                          (s.isCurrent
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
                            : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400")
                        }
                      >
                        <DeviceIcon className="h-6 w-6" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-foreground truncate">
                            {s.browser} · {s.os}
                          </p>
                          {s.isCurrent && (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0 h-4.5 gap-0.5 bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-700"
                            >
                              <ShieldCheck className="h-2.5 w-2.5" />
                              {t("settings.sessions.current")}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground flex-wrap">
                          <span className="inline-flex items-center gap-1">
                            <Globe className="h-3 w-3" />
                            {s.ip ?? "—"}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {t("settings.sessions.lastSeen")} {formatLastSeen(s.lastSeenAt)}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Hourglass className="h-3 w-3" />
                            {t("settings.sessions.expires")} {formatExpiresIn(s.expiresAt)}
                          </span>
                        </div>
                      </div>

                      {/* Revoke button — hidden for the current session. */}
                      {!s.isCurrent && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
                          onClick={() => revoke(s.id)}
                          disabled={isRevoking}
                          aria-label={t("settings.sessions.revoke")}
                          title={t("settings.sessions.revoke")}
                        >
                          {isRevoking ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* Revoke-all-others — only shown when there ARE others. */}
            {otherCount > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-1 w-full sm:w-auto text-rose-600 hover:text-rose-700 hover:bg-rose-50 hover:border-rose-200 dark:text-rose-400 dark:hover:bg-rose-950/30 dark:hover:border-rose-900"
                    disabled={revokingAll}
                  >
                    {revokingAll ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <LogOut className="h-3.5 w-3.5" />
                    )}
                    {t("settings.sessions.revokeAll")} ({otherCount})
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("settings.sessions.revokeAll")}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("settings.sessions.revokeConfirm")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={revokingAll}>
                      {t("action.cancel")}
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={revokeAll}
                      disabled={revokingAll}
                      className="bg-rose-600 hover:bg-rose-700 text-white border-rose-600"
                    >
                      {revokingAll ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <LogOut className="h-3.5 w-3.5" />
                      )}
                      {t("settings.sessions.revokeAll")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
