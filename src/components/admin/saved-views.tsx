"use client";

/**
 * Saved Views — quick-access saved filter presets for the Scheduled tab.
 *
 * Previously stored in localStorage; now persisted to the database via
 * /api/saved-views so they follow the admin across browsers/devices. On
 * first mount, any leftover localStorage entries are automatically migrated
 * to the server and the local key is cleared.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Bookmark, BookmarkPlus, Trash2, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useI18n } from "@/lib/i18n";

export type ScheduledFilterState = {
  status: "all" | "pending" | "sent" | "failed";
  search: string;
  repeat: "all" | "none" | "daily" | "weekly" | "monthly";
};

type SavedView = {
  id: string;
  name: string;
  filters: ScheduledFilterState;
  createdAt: string;
  updatedAt: string;
};

const LEGACY_STORAGE_KEY = "tg-bot-admin:saved-views";

type ApiView = {
  id: string;
  name: string;
  filters: unknown;
  createdAt: string;
  updatedAt: string;
};

/** Coerce an unknown `filters` payload from the API into a valid filter state. */
function coerceFilters(raw: unknown): ScheduledFilterState {
  const fallback: ScheduledFilterState = { status: "all", search: "", repeat: "all" };
  if (!raw || typeof raw !== "object") return fallback;
  const obj = raw as Record<string, unknown>;
  const status = obj.status;
  const repeat = obj.repeat;
  return {
    status:
      status === "pending" || status === "sent" || status === "failed" || status === "all"
        ? status
        : "all",
    search: typeof obj.search === "string" ? obj.search : "",
    repeat:
      repeat === "none" || repeat === "daily" || repeat === "weekly" || repeat === "monthly"
        ? repeat
        : "all",
  };
}

/** Read leftover localStorage entries (for one-time migration to the server). */
function readLegacyLocalViews(): { name: string; filter: ScheduledFilterState }[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const e = entry as Record<string, unknown>;
        const name = typeof e.name === "string" ? e.name : "";
        if (!name) return null;
        return { name, filter: coerceFilters(e.filter ?? e.filters) };
      })
      .filter((x): x is { name: string; filter: ScheduledFilterState } => x !== null);
  } catch {
    return [];
  }
}

function clearLegacyLocalViews() {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function SavedViews({
  currentFilter,
  onApply,
}: {
  currentFilter: ScheduledFilterState;
  onApply: (filter: ScheduledFilterState) => void;
}) {
  const { t } = useI18n();
  const [views, setViews] = useState<SavedView[]>([]);
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [migrating, setMigrating] = useState(false);
  const [saving, setSaving] = useState(false);
  const migratedRef = useRef(false);

  const loadViews = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/saved-views", { cache: "no-store" });
      const json = (await res.json()) as { views?: ApiView[] };
      const list = Array.isArray(json.views) ? json.views : [];
      setViews(
        list.map((v) => ({
          id: v.id,
          name: v.name,
          filters: coerceFilters(v.filters),
          createdAt: v.createdAt,
          updatedAt: v.updatedAt,
        })),
      );
      return list;
    } catch {
      toast.error(t("savedViews.loadError"));
      return [];
    } finally {
      setLoading(false);
    }
  }, [t]);

  // Initial load + one-time migration of legacy localStorage views.
  useEffect(() => {
    if (migratedRef.current) return;
    migratedRef.current = true;
    (async () => {
      const serverViews = await loadViews();
      // Only attempt migration when the server has no views AND the browser
      // has legacy entries — otherwise there's nothing to move.
      if (serverViews.length > 0) {
        clearLegacyLocalViews();
        return;
      }
      const legacy = readLegacyLocalViews();
      if (legacy.length === 0) return;
      setMigrating(true);
      try {
        await Promise.all(
          legacy.map((entry) =>
            fetch("/api/saved-views", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: entry.name, filters: entry.filter }),
            }),
          ),
        );
        clearLegacyLocalViews();
        await loadViews();
        toast.success(
          legacy.length === 1
            ? "Migrated 1 saved view from this browser"
            : `Migrated ${legacy.length} saved views from this browser`,
        );
      } catch {
        toast.error(t("savedViews.loadError"));
      } finally {
        setMigrating(false);
      }
    })();
  }, [loadViews]);

  const handleSave = async () => {
    const name = newName.trim();
    if (!name || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/saved-views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, filters: currentFilter }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(err?.error || t("savedViews.saveError"));
        return;
      }
      const json = (await res.json()) as { view: ApiView };
      const created: SavedView = {
        id: json.view.id,
        name: json.view.name,
        filters: coerceFilters(json.view.filters),
        createdAt: json.view.createdAt,
        updatedAt: json.view.updatedAt,
      };
      setViews((prev) => [created, ...prev]);
      setNewName("");
      setActiveId(created.id);
    } catch {
      toast.error(t("savedViews.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    // Optimistically remove from the UI for snappy feedback.
    const previous = views;
    setViews((prev) => prev.filter((v) => v.id !== id));
    if (activeId === id) setActiveId(null);
    try {
      const res = await fetch(`/api/saved-views/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        // Roll back on failure.
        setViews(previous);
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(err?.error || t("savedViews.deleteError"));
      }
    } catch {
      setViews(previous);
      toast.error(t("savedViews.deleteError"));
    }
  };

  const handleApply = (view: SavedView) => {
    onApply(view.filters);
    setActiveId(view.id);
    setOpen(false);
  };

  // Determine if the current filter matches an existing saved view
  const matchesActive = (view: SavedView) =>
    view.filters.status === currentFilter.status &&
    view.filters.search === currentFilter.search &&
    view.filters.repeat === currentFilter.repeat;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={loading || migrating}
          className={cn(
            "h-8 gap-1.5",
            activeId && views.some(matchesActive) && "bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300",
          )}
        >
          {loading || migrating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Bookmark className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">Saved</span>
          {!loading && !migrating && views.length > 0 && (
            <span className="ml-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 px-1.5 text-[10px] font-semibold tabular-nums">
              {views.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="p-3 border-b border-border">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            {migrating ? t("savedViews.migrating") : "Save current view"}
          </p>
          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Failed weekly"
              className="h-8 text-sm"
              disabled={saving}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
            />
            <Button
              size="sm"
              className="h-8 px-2.5 gap-1"
              onClick={handleSave}
              disabled={!newName.trim() || saving}
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <BookmarkPlus className="h-3.5 w-3.5" />
              )}
              Save
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">
            Saves: status=&ldquo;{currentFilter.status}&rdquo;{currentFilter.search ? `, search=&ldquo;${currentFilter.search}&rdquo;` : ""}{currentFilter.repeat !== "all" ? `, repeat=&ldquo;${currentFilter.repeat}&rdquo;` : ""}
          </p>
        </div>

        <div className="max-h-64 overflow-y-auto scrollbar-thin">
          {loading || migrating ? (
            <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
              <Loader2 className="h-6 w-6 text-muted-foreground/60 animate-spin mb-2" />
              <p className="text-xs text-muted-foreground">
                {migrating ? t("savedViews.migrating") : t("savedViews.loading")}
              </p>
            </div>
          ) : views.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
              <Bookmark className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-xs text-muted-foreground">
                No saved views yet. Save a filter combo for quick access.
              </p>
            </div>
          ) : (
            <ul className="py-1">
              <AnimatePresence initial={false}>
                {views.map((view) => {
                  const isActive = matchesActive(view);
                  return (
                    <motion.li
                      key={view.id}
                      layout
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="group flex items-center gap-1.5 px-2 hover:bg-accent/60"
                    >
                      <button
                        onClick={() => handleApply(view)}
                        className={cn(
                          "flex-1 flex items-center gap-2 py-2 px-1.5 text-left text-sm rounded",
                          isActive && "text-emerald-700 dark:text-emerald-300",
                        )}
                      >
                        <Bookmark
                          className={cn(
                            "h-3.5 w-3.5 shrink-0",
                            isActive ? "fill-emerald-500 text-emerald-500" : "text-muted-foreground",
                          )}
                        />
                        <span className="flex-1 min-w-0">
                          <span className="block truncate font-medium">{view.name}</span>
                          <span className="block text-[10px] text-muted-foreground truncate">
                            {view.filters.status !== "all" && `${view.filters.status} · `}
                            {view.filters.search && `“${view.filters.search}” · `}
                            {view.filters.repeat !== "all" && `${view.filters.repeat} repeat`}
                            {view.filters.status === "all" && !view.filters.search && view.filters.repeat === "all" && "all messages"}
                          </span>
                        </span>
                        {isActive && <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
                      </button>
                      <button
                        onClick={() => handleDelete(view.id)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-rose-100 dark:hover:bg-rose-950/50 text-muted-foreground hover:text-rose-600 transition-opacity"
                        title="Delete saved view"
                        aria-label={`Delete saved view ${view.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
