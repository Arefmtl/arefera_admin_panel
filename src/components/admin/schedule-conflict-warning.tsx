"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, Pencil } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch, formatDate } from "./shared";
import { RepeatBadge } from "./shared";
import { cn } from "@/lib/utils";

/**
 * ScheduleConflictWarning — debounced, read-only warning panel that calls
 * the /api/scheduled/conflicts endpoint whenever its props change and lists
 * any pending schedules that would fire within ±5 minutes of the requested
 * time AND share at least one target channel with the draft.
 *
 * Purely informational — admins can still save (the warning is not a
 * blocker). Renders nothing when there are no conflicts.
 */

export type ScheduleConflict = {
  id: string;
  title: string;
  scheduledAt: string;
  channelIds: string[];
  channelTitles: string[];
  repeat: string;
};

type Props = {
  /** Local-time datetime-local input value, e.g. "2026-06-22T17:32". */
  scheduledAt: string;
  channelIds: string[];
  repeat: "none" | "daily" | "weekly" | "monthly";
  /** Pass editingId when editing so the schedule doesn't conflict with itself. */
  excludeId?: string | null;
  /** Called when an admin clicks a conflict title — opens that schedule for edit. */
  onEditConflict?: (id: string) => void;
};

export function ScheduleConflictWarning({
  scheduledAt,
  channelIds,
  repeat,
  excludeId,
  onEditConflict,
}: Props) {
  const [conflicts, setConflicts] = useState<ScheduleConflict[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Token guards against out-of-order responses from rapid prop changes.
  const reqToken = useRef(0);

  useEffect(() => {
    // Skip when no channels or no scheduledAt — there can't be a conflict.
    // We still schedule the timer so any setState happens inside the
    // callback (avoiding the synchronous set-state-in-effect lint rule).
    const parsed = scheduledAt ? new Date(scheduledAt) : null;
    const validDate = parsed && !Number.isNaN(parsed.getTime());
    const hasChannels = channelIds.length > 0;

    if (!validDate || !hasChannels) {
      // Defer the clear via setTimeout(0) so we don't call setState
      // synchronously inside the effect body.
      const t = setTimeout(() => {
        setConflicts([]);
        setLoading(false);
        setError(null);
      }, 0);
      return () => clearTimeout(t);
    }

    const myToken = ++reqToken.current;

    // Debounce 300ms so we don't spam the API on every keystroke / click.
    const t = setTimeout(async () => {
      // Mark loading inside the callback (avoiding set-state-in-effect).
      setLoading(true);
      setError(null);
      const body = JSON.stringify({
        scheduledAt: parsed!.toISOString(),
        channelIds,
        repeat,
        excludeId: excludeId ?? undefined,
      });
      const { data, error } = await apiFetch<{ conflicts: ScheduleConflict[] }>(
        "/api/scheduled/conflicts",
        { method: "POST", body },
      );
      // Ignore the response if a newer request superseded us.
      if (reqToken.current !== myToken) return;
      setLoading(false);
      if (error) {
        setError(error);
        setConflicts([]);
      } else {
        setConflicts(data?.conflicts ?? []);
      }
    }, 300);

    return () => clearTimeout(t);
  }, [scheduledAt, channelIds, repeat, excludeId]);

  // Empty state: nothing rendered (no conflicts = no UI).
  if (!loading && !error && conflicts.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        className="rounded-lg border border-amber-300/70 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 p-3"
      >
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                Schedule conflict detected
              </p>
              <span className="text-[10px] uppercase tracking-wide font-medium text-amber-700/80 dark:text-amber-300/70">
                ±5 min · overlapping channels
              </span>
            </div>

            {loading ? (
              <p className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" /> Checking for conflicts…
              </p>
            ) : error ? (
              <p className="text-xs text-rose-600 dark:text-rose-400">
                Couldn’t check for conflicts: {error}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {conflicts.map((c) => (
                  <li
                    key={c.id}
                    className="rounded-md border border-amber-200/70 dark:border-amber-900/50 bg-white/70 dark:bg-background/40 p-2"
                  >
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      {onEditConflict ? (
                        <button
                          type="button"
                          onClick={() => onEditConflict(c.id)}
                          className="inline-flex items-center gap-1 text-sm font-medium text-amber-900 dark:text-amber-100 hover:underline"
                          title="Open this schedule for editing"
                        >
                          {c.title}
                          <Pencil className="h-3 w-3 opacity-70" />
                        </button>
                      ) : (
                        <span className="text-sm font-medium text-amber-900 dark:text-amber-100">
                          {c.title}
                        </span>
                      )}
                      <RepeatBadge
                        repeat={
                          ["none", "daily", "weekly", "monthly"].includes(c.repeat)
                            ? (c.repeat as "none" | "daily" | "weekly" | "monthly")
                            : "none"
                        }
                      />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-amber-700/90 dark:text-amber-300/80">
                      <span>Scheduled: {formatDate(c.scheduledAt)}</span>
                      <span className="text-amber-500/60">·</span>
                      <span className="truncate max-w-full">
                        {c.channelTitles.length > 0 ? c.channelTitles.join(", ") : "—"}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {!loading && !error && conflicts.length > 0 && (
              <p className={cn(
                "text-[11px] text-amber-700/90 dark:text-amber-300/80 italic",
              )}>
                You can still save — conflicts are informational, not blocking.
              </p>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
