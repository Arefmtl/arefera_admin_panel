"use client";

import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  CalendarClock,
  Trash2,
  RefreshCw,
  Pencil,
  Ban,
  Clock,
  CheckCircle2,
  XCircle,
  Radio,
  Zap,
  Search,
  Copy,
  FileText,
  ChevronDown,
  ListChecks,
  X,
  Download,
  Eye,
  EyeOff,
  Repeat,
  LayoutList,
  CalendarRange,
  History,
  RotateCcw,
  Send,
  CalendarDays,
  Globe,
  Save,
  Lightbulb,
  Check,
  CalendarPlus,
  Loader2,
} from "lucide-react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  apiFetch,
  formatDate,
  timeAgo,
  parseChannelIds,
  parseButtons,
  RepeatBadge,
  EmptyState,
  type ScheduledMessage,
  type Channel,
  type LogRow,
  type Template,
  type ButtonConfig,
} from "./shared";
import { ButtonBuilder } from "./button-builder";
import { TelegramMessagePreview } from "./telegram-preview";
import { SavedViews, type ScheduledFilterState } from "./saved-views";
import { TimelineView } from "./timeline-view";
import { CalendarView } from "./calendar-view";
import { ScheduleConflictWarning } from "./schedule-conflict-warning";
import { useI18n } from "@/lib/i18n";
import { downloadFile, timestampedFilename } from "@/lib/export-utils";

const VIEW_TAB_KEY = "tg-bot-admin:scheduled-tab";
const DRAFT_KEY = "tg-bot-admin:schedule-draft";
const TZ_KEY = "tg-bot-admin:timezone";

type ViewTab = "list" | "timeline" | "calendar";

/** Common timezones shown in the Timezone picker (Feature 1). */
const COMMON_TIMEZONES: string[] = [
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "America/Chicago",
  "America/Denver",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Asia/Tehran",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
  "Pacific/Auckland",
];

/** Returns the browser's local timezone (used as default). */
function detectBrowserTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && COMMON_TIMEZONES.includes(tz) ? tz : "UTC";
  } catch {
    return "UTC";
  }
}

/** Read persisted timezone from localStorage (defensive against SSR). */
function loadPersistedTimezone(): string {
  try {
    const saved = localStorage.getItem(TZ_KEY);
    if (saved && COMMON_TIMEZONES.includes(saved)) return saved;
  } catch {
    /* ignore */
  }
  return detectBrowserTimezone();
}

/** Persist the timezone selection to localStorage. */
function persistTimezone(tz: string): void {
  try {
    localStorage.setItem(TZ_KEY, tz);
  } catch {
    /* ignore */
  }
}

/**
 * Returns the timezone offset in minutes for the given date in the given timezone.
 * Positive = ahead of UTC, negative = behind. Handles DST.
 */
function getTzOffsetMinutes(date: Date, timeZone: string): number {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts = dtf.formatToParts(date);
    const map: Record<string, string> = {};
    for (const p of parts) {
      if (p.type !== "literal") map[p.type] = p.value;
    }
    const hourRaw = map.hour === "24" ? "00" : map.hour;
    const asIfUtcMs = Date.UTC(
      parseInt(map.year, 10),
      parseInt(map.month, 10) - 1,
      parseInt(map.day, 10),
      parseInt(hourRaw, 10),
      parseInt(map.minute, 10),
      parseInt(map.second, 10),
    );
    return Math.round((asIfUtcMs - date.getTime()) / 60000);
  } catch {
    return 0;
  }
}

/** Formats the offset as a "UTC+3:30" / "UTC-5" / "UTC+0" string. */
function formatTzOffset(timeZone: string): string {
  const offsetMin = getTzOffsetMinutes(new Date(), timeZone);
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m > 0
    ? `UTC${sign}${h}:${String(m).padStart(2, "0")}`
    : `UTC${sign}${h}`;
}

/** Returns a short, human-friendly label for a timezone (e.g. "Tehran", "UTC"). */
function tzShortLabel(timeZone: string): string {
  if (timeZone === "UTC") return "UTC";
  const last = timeZone.split("/").pop() || timeZone;
  return last.replace(/_/g, " ");
}

/**
 * Convert a wall-time string ("2026-06-15T14:30") interpreted in the given
 * timezone to a UTC ISO string. Returns null if the input is invalid.
 */
function wallTimeToUtcIso(wallTime: string, timeZone: string): string | null {
  if (!wallTime) return null;
  // Treat the wall time as if it were UTC, then shift by the offset.
  const asIfUtc = new Date(`${wallTime}:00Z`);
  if (isNaN(asIfUtc.getTime())) return null;
  const offsetMin = getTzOffsetMinutes(asIfUtc, timeZone);
  // Wall "14:30 in Tehran UTC+3:30" → UTC = 14:30 - 3:30 = 11:00.
  return new Date(asIfUtc.getTime() - offsetMin * 60000).toISOString();
}

/**
 * Convert a UTC ISO string to a wall-time string ("2026-06-15T14:30") in the
 * given timezone. Suitable for setting the value of a datetime-local input.
 */
function utcIsoToWallTime(utcIso: string, timeZone: string): string {
  const date = new Date(utcIso);
  if (isNaN(date.getTime())) return "";
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = dtf.formatToParts(date);
    const map: Record<string, string> = {};
    for (const p of parts) {
      if (p.type !== "literal") map[p.type] = p.value;
    }
    const hour = map.hour === "24" ? "00" : map.hour;
    return `${map.year}-${map.month}-${map.day}T${hour}:${map.minute}`;
  } catch {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
}

/** Format an ISO date string as a localized timestamp in the given timezone. */
function formatDateInTz(iso: string | null, timeZone: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  try {
    return d.toLocaleString("en-GB", {
      timeZone,
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return formatDate(iso);
  }
}

type DraftPayload = FormState & { _savedAt: number };

function readDraft(): DraftPayload | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DraftPayload>;
    if (!parsed || typeof parsed !== "object" || typeof parsed._savedAt !== "number") {
      return null;
    }
    return {
      title: typeof parsed.title === "string" ? parsed.title : "",
      text: typeof parsed.text === "string" ? parsed.text : "",
      format: parsed.format === "html" ? "html" : "markdown",
      channelIds: Array.isArray(parsed.channelIds) ? parsed.channelIds.filter((x): x is string => typeof x === "string") : [],
      scheduledAt: typeof parsed.scheduledAt === "string" ? parsed.scheduledAt : "",
      repeat: ["none", "daily", "weekly", "monthly"].includes(parsed.repeat as string) ? (parsed.repeat as FormState["repeat"]) : "none",
      buttons: Array.isArray(parsed.buttons) ? (parsed.buttons as ButtonConfig) : [],
      _savedAt: parsed._savedAt,
    };
  } catch {
    return null;
  }
}

function writeDraft(form: FormState): void {
  try {
    const payload: DraftPayload = { ...form, _savedAt: Date.now() };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota errors */
  }
}

function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

/** Local enhanced status badge with icon + brighter colors. */
function StatusBadgeIcon({ status }: { status: ScheduledMessage["status"] }) {
  const map: Record<string, { label: string; Icon: typeof Clock; cls: string }> = {
    pending: {
      label: "Pending",
      Icon: Clock,
      cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
    },
    sent: {
      label: "Sent",
      Icon: CheckCircle2,
      cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    },
    failed: {
      label: "Failed",
      Icon: XCircle,
      cls: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
    },
    cancelled: {
      label: "Cancelled",
      Icon: Ban,
      cls: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300 border-zinc-500/30",
    },
    repeating: {
      label: "Repeating",
      Icon: Repeat,
      cls: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30",
    },
    paused: {
      label: "Paused",
      Icon: Ban,
      cls: "bg-zinc-500/15 text-zinc-500 dark:text-zinc-300 border-zinc-500/30",
    },
  };
  const s = map[status] || map.pending;
  return (
    <Badge variant="outline" className={cn("font-medium gap-1", s.cls)}>
      <s.Icon className="h-3 w-3" />
      {s.label}
    </Badge>
  );
}

type FormState = {
  title: string;
  text: string;
  format: "markdown" | "html";
  channelIds: string[];
  scheduledAt: string;
  repeat: "none" | "daily" | "weekly" | "monthly";
  buttons: ButtonConfig;
};

function emptyForm(timezone?: string): FormState {
  const future = new Date(Date.now() + 60 * 60 * 1000);
  // Default to the browser's local timezone if none provided — keeps the
  // initial useState initializer SSR-safe.
  const tz = timezone || detectBrowserTimezone();
  return {
    title: "",
    text: "",
    format: "markdown",
    channelIds: [],
    scheduledAt: utcIsoToWallTime(future.toISOString(), tz),
    repeat: "none",
    buttons: [],
  };
}

function useCountdown(target: string | null): string {
  const [, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(i);
  }, []);
  if (!target) return "—";
  const diff = new Date(target).getTime() - Date.now();
  if (diff <= 0) return "due now";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (h > 0) return `in ${h}h ${m}m`;
  if (m > 0) return `in ${m}m ${s}s`;
  return `in ${s}s`;
}

export function Scheduled() {
  const [messages, setMessages] = useState<ScheduledMessage[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending" | "sent" | "failed">("all");
  const [search, setSearch] = useState("");
  const [repeatFilter, setRepeatFilter] = useState<"all" | "none" | "daily" | "weekly" | "monthly">("all");
  const { t } = useI18n();
  const [logsTarget, setLogsTarget] = useState<ScheduledMessage | null>(null);
  const [logs, setLogs] = useState<LogRow[] | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [exporting, setExporting] = useState(false);
  // View tab (List vs Timeline) — persisted to localStorage.
  const [viewTab, setViewTab] = useState<ViewTab>("list");
  // Draft restore banner state — non-null only while the banner is showing.
  const [draftRestore, setDraftRestore] = useState<{ time: number; data: FormState } | null>(null);
  // Send-test message — loading state for the dialog footer button.
  const [testing, setTesting] = useState(false);
  // Timezone selection (Feature 1) — defaults to browser TZ, persisted to localStorage.
  const [timezone, setTimezone] = useState<string>("UTC");
  // Scheduling tips collapsible open state (Feature 3).
  const [tipsOpen, setTipsOpen] = useState(false);
  // Timezone popover open state for the section-header indicator.
  const [tzPopoverOpen, setTzPopoverOpen] = useState(false);
  // Tracks whether the user explicitly clicked "Save draft" in the current
  // editor session. When true, closeEditor() preserves the draft so the user
  // can restore it on the next open (Feature 2).
  const [manualDraftSaved, setManualDraftSaved] = useState(false);

  const load = async () => {
    setLoading(true);
    const [mRes, cRes, tRes] = await Promise.all([
      apiFetch<ScheduledMessage[]>("/api/scheduled"),
      apiFetch<Channel[]>("/api/channels"),
      apiFetch<Template[]>("/api/templates"),
    ]);
    if (mRes.error) toast.error(mRes.error);
    else setMessages(mRes.data || []);
    if (cRes.error) toast.error(cRes.error);
    else setChannels(cRes.data || []);
    if (tRes.error) toast.error(tRes.error);
    else setTemplates(tRes.data || []);
    setLoading(false);
  };

  useEffect(() => {
    const run = async () => {
      await load();
    };
    run();
  }, []);

  // Restore view tab preference from localStorage (defensive against SSR / first paint).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_TAB_KEY);
      if (saved === "timeline" || saved === "list" || saved === "calendar") {
        setViewTab(saved);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Restore persisted timezone preference (Feature 1).
  useEffect(() => {
    setTimezone(loadPersistedTimezone());
  }, []);

  const persistViewTab = (v: ViewTab) => {
    setViewTab(v);
    try {
      localStorage.setItem(VIEW_TAB_KEY, v);
    } catch {
      /* ignore */
    }
  };

  /**
   * Change the active timezone (Feature 1). Re-interprets the currently displayed
   * datetime input value so that the same UTC moment is preserved across the
   * switch — the wall-clock text the admin sees simply updates to the new TZ.
   */
  const changeTimezone = (newTz: string) => {
    setTimezone(newTz);
    persistTimezone(newTz);
    // Re-interpret the current scheduledAt from the OLD timezone to the NEW one.
    setForm((f) => {
      if (!f.scheduledAt) return f;
      const utcIso = wallTimeToUtcIso(f.scheduledAt, timezone);
      if (!utcIso) return f;
      const newWall = utcIsoToWallTime(utcIso, newTz);
      return newWall ? { ...f, scheduledAt: newWall } : f;
    });
  };

  // Draft autosave — debounce 2s. Only runs when:
  //  - the editor is open
  //  - we're creating a NEW schedule (editingId is null)
  //  - the restore banner isn't showing (draftRestore is null)
  // The very first autosave after opening writes the (possibly empty) form;
  // that's harmless because closeEditor() clears it on cancel.
  useEffect(() => {
    if (!editorOpen || editingId || draftRestore !== null) return;
    const id = setTimeout(() => {
      writeDraft(form);
    }, 2000);
    return () => clearTimeout(id);
  }, [form, editorOpen, editingId, draftRestore]);

  // When the editor opens in "new" mode, check for an existing draft.
  useEffect(() => {
    if (editorOpen && !editingId) {
      const draft = readDraft();
      if (draft) {
        const { _savedAt, ...data } = draft;
        setDraftRestore({ time: _savedAt, data });
      }
    }
  }, [editorOpen, editingId]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm(timezone));
    setDraftRestore(null);
    setManualDraftSaved(false);
    setEditorOpen(true);
  };

  const openEdit = (m: ScheduledMessage) => {
    setEditingId(m.id);
    setForm({
      title: m.title,
      text: m.text,
      format: m.format,
      channelIds: parseChannelIds(m.channelIds),
      scheduledAt: utcIsoToWallTime(m.scheduledAt, timezone),
      repeat: m.repeat,
      buttons: parseButtons(m.buttons),
    });
    setDraftRestore(null);
    setManualDraftSaved(false);
    setEditorOpen(true);
  };

  const openEditById = (id: string) => {
    const m = messages.find((x) => x.id === id);
    if (m) openEdit(m);
  };

  // Centralized close — clears the autosaved draft UNLESS the user explicitly
  // clicked "Save draft" in this session. The manual flag resets on close so
  // the next session starts fresh.
  const closeEditor = () => {
    setEditorOpen(false);
    setDraftRestore(null);
    if (!manualDraftSaved) {
      clearDraft();
    }
    setManualDraftSaved(false);
  };

  const restoreDraft = () => {
    if (draftRestore) {
      setForm(draftRestore.data);
    }
    setDraftRestore(null);
  };

  const discardDraft = () => {
    clearDraft();
    setDraftRestore(null);
    setManualDraftSaved(false);
  };

  /**
   * Explicit "Save draft" handler (Feature 2). Writes the current form state
   * to localStorage immediately — complements the 2s debounced autosave by
   * giving the user a clear, on-demand action with toast feedback. The
   * manualDraftSaved flag preserves the draft through closeEditor().
   */
  const saveDraftManual = () => {
    writeDraft(form);
    setManualDraftSaved(true);
    toast.success(t("scheduled.draft.saved"));
  };

  const cloneMsg = async (m: ScheduledMessage) => {
    const { error } = await apiFetch(`/api/scheduled/${m.id}/clone`, { method: "POST" });
    if (error) toast.error(error);
    else {
      toast.success("Message cloned — scheduled for 1 hour from now");
      load();
    }
  };

  // Duplicate a schedule with an optional offset (Task 11-b). Unlike clone
  // (which always shifts +1h and uses "(copy)" suffix), duplicate preserves
  // the original scheduledAt by default and lets the admin offset by +1d or
  // +1w for quick recurring-message creation.
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const duplicateMsg = async (m: ScheduledMessage, offset: "none" | "1d" | "1w") => {
    setDuplicatingId(m.id);
    const { data, error } = await apiFetch<{ ok: boolean; duplicate?: { id: string; title: string; scheduledAt: string } }>(
      `/api/scheduled/${m.id}/duplicate`,
      {
        method: "POST",
        body: JSON.stringify({ offset }),
      },
    );
    setDuplicatingId(null);
    if (error) {
      toast.error(error);
      return;
    }
    if (!data?.ok || !data.duplicate) {
      toast.error(t("scheduled.duplicate.failed"));
      return;
    }
    toast.success(t("scheduled.duplicate.success"));
    load();
  };

  const applyTemplate = (t: Template) => {
    setForm((f) => ({
      ...f,
      title: f.title || t.name,
      text: t.text,
      format: t.format,
      buttons: parseButtons(t.buttons),
    }));
    setTemplatePickerOpen(false);
    toast.success(`Loaded template: ${t.name}`);
  };

  const toggleChannel = (id: string) => {
    setForm((f) => ({
      ...f,
      channelIds: f.channelIds.includes(id) ? f.channelIds.filter((x) => x !== id) : [...f.channelIds, id],
    }));
  };

  const save = async () => {
    if (!form.title.trim()) {
      toast.error("A title is required");
      return;
    }
    if (!form.text.trim()) {
      toast.error("Message text is required");
      return;
    }
    if (form.channelIds.length === 0) {
      toast.error("Select at least one target channel");
      return;
    }
    if (!form.scheduledAt) {
      toast.error("Pick a scheduled date & time");
      return;
    }
    setSaving(true);
    // Filter out empty buttons before saving
    const cleanButtons = form.buttons
      .map((row) => row.filter((b) => b.text.trim() && b.url.trim()))
      .filter((row) => row.length > 0);
    // Convert the wall-time string (interpreted in the selected timezone) to a
    // UTC ISO string for the API (Feature 1).
    const utcIso = wallTimeToUtcIso(form.scheduledAt, timezone);
    if (!utcIso) {
      setSaving(false);
      toast.error("Invalid scheduled date & time");
      return;
    }
    const body = JSON.stringify({
      ...form,
      scheduledAt: utcIso,
      buttons: cleanButtons,
    });
    if (editingId) {
      const { error } = await apiFetch(`/api/scheduled/${editingId}`, { method: "PATCH", body });
      setSaving(false);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success("Scheduled message updated");
    } else {
      const { error } = await apiFetch("/api/scheduled", { method: "POST", body });
      setSaving(false);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success("Message scheduled");
    }
    // Successful save — clear any autosaved draft and close.
    clearDraft();
    setDraftRestore(null);
    setManualDraftSaved(false);
    setEditorOpen(false);
    load();
  };

  const cancelMsg = async (m: ScheduledMessage) => {
    const { error } = await apiFetch(`/api/scheduled/${m.id}/cancel`, { method: "POST" });
    if (error) toast.error(error);
    else {
      toast.success("Message cancelled");
      load();
    }
  };

  const deleteMsg = async (m: ScheduledMessage) => {
    const { error } = await apiFetch(`/api/scheduled/${m.id}`, { method: "DELETE" });
    if (error) toast.error(error);
    else {
      toast.success("Message deleted");
      load();
    }
  };

  const runNow = async () => {
    setRunning(true);
    const { data, error } = await apiFetch<{ processed: number; sent: number; failed: number }>(
      "/api/scheduled/run",
      { method: "POST" },
    );
    setRunning(false);
    if (error) {
      toast.error(error);
      return;
    }
    if (data && data.processed > 0) {
      toast.success(`Processed ${data.processed} message(s) — ${data.sent} sent, ${data.failed} failed`);
    } else {
      toast.info("No due messages to process right now");
    }
    load();
  };

  const openLogs = async (m: ScheduledMessage) => {
    setLogsTarget(m);
    setLogs(null);
    setLogsLoading(true);
    const { data, error } = await apiFetch<LogRow[]>(`/api/logs?messageId=${m.id}`);
    setLogsLoading(false);
    if (error) toast.error(error);
    else setLogs(data || []);
  };

  const filtered = useMemo(() => {
    return messages.filter((m) => {
      const matchesFilter = filter === "all" || m.status === filter;
      const matchesRepeat = repeatFilter === "all" || m.repeat === repeatFilter;
      const matchesSearch =
        !search ||
        m.title.toLowerCase().includes(search.toLowerCase()) ||
        m.text.toLowerCase().includes(search.toLowerCase());
      return matchesFilter && matchesRepeat && matchesSearch;
    });
  }, [messages, filter, search, repeatFilter]);

  const applySavedView = (sf: ScheduledFilterState) => {
    setFilter(sf.status);
    setSearch(sf.search);
    setRepeatFilter(sf.repeat);
  };

  const counts = {
    all: messages.length,
    pending: messages.filter((m) => m.status === "pending").length,
    sent: messages.filter((m) => m.status === "sent").length,
    failed: messages.filter((m) => m.status === "failed").length,
  };

  // Bulk selection helpers
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedIds(new Set(filtered.map((m) => m.id)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const runBulk = async (action: "delete" | "cancel" | "clone") => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const verb = action === "delete" ? "delete" : action === "cancel" ? "cancel" : "clone";
    if (action === "delete" && !confirm(`Delete ${ids.length} selected message(s)? This cannot be undone.`)) {
      return;
    }
    setBulkRunning(true);
    const { data, error } = await apiFetch<{ ok: number; failed: number; results: { id: string; ok: boolean; error?: string }[] }>(
      "/api/scheduled/bulk",
      { method: "POST", body: JSON.stringify({ ids, action }) },
    );
    setBulkRunning(false);
    if (error) {
      toast.error(error);
      return;
    }
    if (data) {
      const failedMsgs = data.results.filter((r) => !r.ok);
      if (data.ok > 0) {
        toast.success(`Bulk ${verb}: ${data.ok} succeeded`);
      }
      if (data.failed > 0) {
        toast.error(`Bulk ${verb}: ${data.failed} failed (${failedMsgs[0]?.error ?? "see log"})`);
      }
    }
    clearSelection();
    load();
  };

  const exportData = async (format: "csv" | "json") => {
    setExporting(true);
    try {
      const res = await fetch(`/api/export?type=scheduled&format=${format}`);
      if (!res.ok) {
        toast.error("Export failed");
        return;
      }
      const text = await res.text();
      downloadFile(text, timestampedFilename("scheduled-messages", format), format === "csv" ? "text/csv;charset=utf-8" : "application/json");
      toast.success(`Exported ${messages.length} messages as ${format.toUpperCase()}`);
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  };

  const sendTest = async () => {
    if (!form.text.trim()) {
      toast.error("Message text is empty");
      return;
    }
    setTesting(true);
    // Clean empty buttons before sending.
    const cleanButtons = form.buttons
      .map((row) => row.filter((b) => b.text.trim() && b.url.trim()))
      .filter((row) => row.length > 0);
    const body = JSON.stringify({
      text: form.text,
      format: form.format,
      buttons: cleanButtons,
    });
    const { data, error } = await apiFetch<{ ok: boolean; messageId?: number; chatId?: string; error?: string }>(
      "/api/scheduled/test",
      { method: "POST", body },
    );
    setTesting(false);
    if (error) {
      toast.error(error);
      return;
    }
    if (data && data.ok) {
      toast.success("Test message sent — check your Telegram");
    } else if (data && !data.ok) {
      toast.error(data.error || "Failed to send test message");
    }
  };

  const previewChannelTitle = channels.find((c) => form.channelIds.includes(c.id))?.title;

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-emerald-600" /> {t("scheduled.heading")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("scheduled.subtitle")}</p>
      </div>

      {/* Action bar — top row: Run now + Export + Refresh + Timezone on left, New on right.
          Visible in both List and Timeline tabs. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={runNow} disabled={running}>
            <Zap className="h-4 w-4 text-amber-500" /> {running ? "…" : t("action.runNow")}
          </Button>
          {/* Timezone indicator (Feature 1) — click to open a popover with the
              full timezone selector. Shows the active TZ and its UTC offset. */}
          <Popover open={tzPopoverOpen} onOpenChange={setTzPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                title={t("scheduled.timezoneHint")}
                className="gap-1.5"
              >
                <Globe className="h-4 w-4 text-emerald-600" />
                <span className="hidden sm:inline">{tzShortLabel(timezone)}</span>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {formatTzOffset(timezone)}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-2" align="start">
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground px-1.5">
                  {t("scheduled.timezoneHint")}
                </p>
                <div className="max-h-64 overflow-y-auto scrollbar-thin space-y-0.5">
                  {COMMON_TIMEZONES.map((tz) => (
                    <button
                      key={tz}
                      type="button"
                      onClick={() => {
                        changeTimezone(tz);
                        setTzPopoverOpen(false);
                      }}
                      className={cn(
                        "w-full text-left rounded-md px-2.5 py-1.5 text-sm transition-colors flex items-center justify-between gap-2",
                        tz === timezone
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                          : "hover:bg-accent",
                      )}
                    >
                      <span className="font-medium truncate">{tzShortLabel(tz)}</span>
                      <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                        {formatTzOffset(tz)}
                      </span>
                      {tz === timezone && (
                        <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground px-1.5 pt-1 leading-relaxed">
                  {t("scheduled.timezoneNote")}
                </p>
              </div>
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" disabled={exporting || messages.length === 0}>
                <Download className="h-4 w-4" /> {exporting ? "…" : t("action.export")}
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-44 p-1" align="start">
              <button
                onClick={() => exportData("csv")}
                className="w-full text-left rounded-md px-2.5 py-1.5 text-sm hover:bg-accent transition-colors flex items-center gap-2"
              >
                <Download className="h-3.5 w-3.5 text-emerald-600" /> CSV file
              </button>
              <button
                onClick={() => exportData("json")}
                className="w-full text-left rounded-md px-2.5 py-1.5 text-sm hover:bg-accent transition-colors flex items-center gap-2"
              >
                <Download className="h-3.5 w-3.5 text-teal-600" /> JSON file
              </button>
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="sm" onClick={load} title={t("action.refresh")}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" /> {t("action.new")}
        </Button>
      </div>

      {/* View tabs — List / Timeline / Calendar. Persisted to localStorage. */}
      <Tabs value={viewTab} onValueChange={(v) => persistViewTab(v as ViewTab)}>
        <TabsList>
          <TabsTrigger value="list">
            <LayoutList className="h-3.5 w-3.5" /> {t("scheduled.tabs.list")}
          </TabsTrigger>
          <TabsTrigger value="timeline">
            <CalendarRange className="h-3.5 w-3.5" /> {t("scheduled.tabs.timeline")}
          </TabsTrigger>
          <TabsTrigger value="calendar">
            <CalendarDays className="h-3.5 w-3.5" /> {t("scheduled.tabs.calendar")}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {viewTab === "timeline" ? (
        <TimelineView onEdit={openEditById} onCreate={openCreate} />
      ) : viewTab === "calendar" ? (
        <CalendarView onEdit={openEditById} onCreate={(date) => {
          setEditingId(null);
          setForm({ ...emptyForm(timezone), scheduledAt: utcIsoToWallTime(date.toISOString(), timezone) });
          setDraftRestore(null);
          setManualDraftSaved(false);
          setEditorOpen(true);
        }} />
      ) : (
        <>
          {/* Filter bar — second row: search + status pills + repeat filter + saved views.
              Only shown once we have at least one message. */}
          {messages.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="flex items-center gap-2 flex-1 max-w-2xl">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder={t("scheduled.searchPlaceholder")}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={repeatFilter} onValueChange={(v) => setRepeatFilter(v as typeof repeatFilter)}>
                    <SelectTrigger className="w-32 sm:w-36 h-9 shrink-0">
                      <SelectValue placeholder={t("form.repeat")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("scheduled.allRepeats")}</SelectItem>
                      <SelectItem value="none">{t("repeat.once")}</SelectItem>
                      <SelectItem value="daily">{t("repeat.daily")}</SelectItem>
                      <SelectItem value="weekly">{t("repeat.weekly")}</SelectItem>
                      <SelectItem value="monthly">{t("repeat.monthly")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <SavedViews
                    currentFilter={{ status: filter, search, repeat: repeatFilter }}
                    onApply={applySavedView}
                  />
                  {filtered.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (selectedIds.size === filtered.length) clearSelection();
                        else selectAllVisible();
                      }}
                      className="shrink-0 h-9"
                    >
                      <ListChecks className="h-4 w-4" />
                      <span className="hidden md:inline">{selectedIds.size === filtered.length && filtered.length > 0 ? t("action.clear") : t("action.selectAll")}</span>
                    </Button>
                  )}
                </div>
                {(search || filter !== "all" || repeatFilter !== "all") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSearch("");
                      setFilter("all");
                      setRepeatFilter("all");
                    }}
                    className="text-xs shrink-0"
                  >
                    <X className="h-3 w-3" /> {t("action.clearFilters")}
                  </Button>
                )}
              </div>

              {/* Status pills — All / Pending / Sent / Failed with count badges + emerald active underline */}
              <div className="flex items-center gap-2 flex-wrap">
                {(["all", "pending", "sent", "failed"] as const).map((f) => {
                  const isActive = filter === f;
                  const label = t(`scheduled.tabs.${f}`);
                  const count = counts[f];
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFilter(f)}
                      className={cn(
                        "relative inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium border-2 transition-all",
                        isActive
                          ? "border-emerald-500 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30"
                          : "border-border text-muted-foreground hover:text-foreground hover:border-emerald-300 dark:hover:border-emerald-800",
                      )}
                    >
                      {label}
                      <span
                        className={cn(
                          "inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 text-[10px] font-semibold rounded-full tabular-nums",
                          isActive ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground",
                        )}
                      >
                        {count}
                      </span>
                      {isActive && (
                        <motion.div
                          layoutId="scheduled-status-underline"
                          className="absolute -bottom-1 left-2 right-2 h-0.5 bg-emerald-500 rounded-full"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Bulk action toolbar */}
          {selectedIds.size > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="sticky top-14 z-20 sm:top-16"
            >
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/95 dark:bg-emerald-950/40 backdrop-blur-md shadow-lg p-3 flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 mr-2">
                  <div className="h-8 w-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center text-sm font-bold tabular-nums">
                    {selectedIds.size}
                  </div>
                  <span className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
                    {selectedIds.size === 1 ? "message selected" : "messages selected"}
                  </span>
                </div>
                <div className="flex items-center gap-1 ml-auto flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => runBulk("clone")}
                    disabled={bulkRunning}
                    className="bg-white dark:bg-background h-8"
                  >
                    <Copy className="h-3.5 w-3.5" /> Clone
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => runBulk("cancel")}
                    disabled={bulkRunning}
                    className="bg-white dark:bg-background text-amber-700 hover:bg-amber-50 h-8"
                  >
                    <Ban className="h-3.5 w-3.5" /> Cancel
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => runBulk("delete")}
                    disabled={bulkRunning}
                    className="bg-white dark:bg-background text-rose-700 hover:bg-rose-50 h-8"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearSelection}
                    disabled={bulkRunning}
                    className="text-emerald-800 dark:text-emerald-200 h-8"
                  >
                    <X className="h-3.5 w-3.5" /> Clear
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Message list — increased spacing (mt-8) per VLM feedback */}
          <div className="mt-8">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-28 rounded-xl" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <Card>
                <CardContent className="p-0">
                  <EmptyState
                    icon={CalendarClock}
                    title={search ? "No matches" : filter === "all" ? "No scheduled messages" : `No ${filter} messages`}
                    description={search ? "Try a different search term." : filter === "all" ? "Create your first scheduled or recurring broadcast to automate delivery." : "Nothing here under this filter."}
                    action={
                      filter === "all" && !search ? (
                        <Button size="sm" onClick={openCreate}>
                          <Plus className="h-4 w-4" /> New schedule
                        </Button>
                      ) : undefined
                    }
                  />
                </CardContent>
              </Card>
            ) : (
              <AnimatePresence mode="popLayout">
                <div className="space-y-3">
                  {filtered.map((m, idx) => (
                    <ScheduledCard
                      key={m.id}
                      m={m}
                      channels={channels}
                      index={idx}
                      selected={selectedIds.has(m.id)}
                      timezone={timezone}
                      onToggleSelect={() => toggleSelect(m.id)}
                      onEdit={() => openEdit(m)}
                      onCancel={() => cancelMsg(m)}
                      onDelete={() => deleteMsg(m)}
                      onClone={() => cloneMsg(m)}
                      onDuplicate={(offset) => duplicateMsg(m, offset)}
                      duplicating={duplicatingId === m.id}
                      onLogs={() => openLogs(m)}
                    />
                  ))}
                </div>
              </AnimatePresence>
            )}
          </div>
        </>
      )}

      {/* Editor dialog */}
      <Dialog open={editorOpen} onOpenChange={(open) => { if (!open) closeEditor(); }}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto scrollbar-thin">
          <DialogHeader className="bg-gradient-to-r from-emerald-50/80 via-transparent to-transparent dark:from-emerald-950/40 -mx-6 -mt-6 px-6 pt-6 pb-3 rounded-t-lg border-b border-border/60">
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              {editingId ? "Edit scheduled message" : "New scheduled message"}
            </DialogTitle>
            <DialogDescription>
              {editingId ? "Update the content, targets or timing." : "Compose a message and pick when it should fire."}
            </DialogDescription>
            {/* Step indicator (Feature 3) — visual hint of progress through the form.
                Each step is marked complete (check) when its fields are filled. */}
            <div className="flex items-center gap-1.5 mt-3 text-[11px]">
              {(() => {
                const composeDone = !!form.title.trim() && !!form.text.trim();
                const scheduleDone = !!form.scheduledAt;
                const targetDone = form.channelIds.length > 0;
                const steps = [
                  { num: 1, label: t("scheduled.steps.compose"), done: composeDone },
                  { num: 2, label: t("scheduled.steps.schedule"), done: scheduleDone },
                  { num: 3, label: t("scheduled.steps.target"), done: targetDone },
                ];
                const firstIncomplete = steps.find((s) => !s.done)?.num ?? 3;
                return steps.map((s, i) => (
                  <div key={s.num} className="flex items-center gap-1.5">
                    <div
                      className={cn(
                        "flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium border transition-all",
                        s.num === firstIncomplete
                          ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-700"
                          : s.done
                            ? "border-emerald-200 bg-emerald-50/50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900"
                            : "border-border text-muted-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "inline-flex items-center justify-center h-4 w-4 rounded-full text-[9px] font-bold tabular-nums",
                          s.num === firstIncomplete
                            ? "bg-emerald-500 text-white"
                            : s.done
                              ? "bg-emerald-500/80 text-white"
                              : "bg-muted text-muted-foreground",
                        )}
                      >
                        {s.done && s.num !== firstIncomplete ? <Check className="h-2.5 w-2.5" /> : s.num}
                      </span>
                      <span>{s.label}</span>
                    </div>
                    {i < steps.length - 1 && (
                      <div className={cn("h-px w-4", s.done ? "bg-emerald-300 dark:bg-emerald-700" : "bg-border")} />
                    )}
                  </div>
                ));
              })()}
            </div>
          </DialogHeader>

          {/* Draft restore banner — only when creating a new schedule and a draft exists */}
          <AnimatePresence>
            {draftRestore && !editingId && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 p-3 flex items-start gap-3"
              >
                <History className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    {t("scheduled.draft.restoreTitle")}
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                    {t("scheduled.draft.restoreDesc").replace("{{time}}", timeAgo(new Date(draftRestore.time).toISOString()))}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button size="sm" className="h-7" onClick={restoreDraft}>
                    <RotateCcw className="h-3 w-3" />
                    {t("scheduled.draft.restore")}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40" onClick={discardDraft}>
                    {t("scheduled.draft.discard")}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            {/* Left column — form */}
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-2">
                <div className="space-y-2 flex-1">
                  <Label htmlFor="sch-title">Title</Label>
                  <Input id="sch-title" placeholder="e.g. Morning announcement" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                </div>
                {templates.length > 0 && (
                  <Popover open={templatePickerOpen} onOpenChange={setTemplatePickerOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="mt-7 shrink-0">
                        <FileText className="h-4 w-4" /> Template
                        <ChevronDown className="h-3 w-3 ml-1" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-2" align="end">
                      <div className="space-y-1 max-h-64 overflow-y-auto scrollbar-thin">
                        {templates.map((tpl) => (
                          <button
                            key={tpl.id}
                            onClick={() => applyTemplate(tpl)}
                            className="w-full text-left rounded-md p-2 hover:bg-accent/60 transition-colors"
                          >
                            <p className="text-sm font-medium truncate">{tpl.name}</p>
                            <p className="text-xs text-muted-foreground line-clamp-1 font-mono">{tpl.text}</p>
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="sch-time">{t("form.scheduledAt")}</Label>
                  <Input id="sch-time" type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>{t("form.repeat")}</Label>
                  <Select value={form.repeat} onValueChange={(v) => setForm({ ...form, repeat: v as FormState["repeat"] })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Once (no repeat)</SelectItem>
                      <SelectItem value="daily">Every day</SelectItem>
                      <SelectItem value="weekly">Every week</SelectItem>
                      <SelectItem value="monthly">Every month</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {/* Timezone picker (Feature 1) — sits below the date/time input.
                  The wall time the admin enters is interpreted in this timezone;
                  on save we convert to UTC ISO for the API. */}
              <div className="space-y-2">
                <Label htmlFor="sch-timezone" className="flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-emerald-600" />
                  {t("scheduled.timezone")}
                </Label>
                <Select value={timezone} onValueChange={changeTimezone}>
                  <SelectTrigger id="sch-timezone" className="gap-1.5">
                    <Globe className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {COMMON_TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz} className="py-1.5">
                        <span className="flex items-center justify-between gap-2 w-full">
                          <span className="font-medium truncate">{tzShortLabel(tz)}</span>
                          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                            {formatTzOffset(tz)}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {t("scheduled.timezoneHint")} <span className="font-medium text-foreground">{tzShortLabel(timezone)}</span> ({formatTzOffset(timezone)}).
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="sch-text">Message</Label>
                  <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
                    <button onClick={() => setForm({ ...form, format: "markdown" })} className={cn("px-2.5 py-1 text-xs rounded-md transition-colors", form.format === "markdown" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>Markdown</button>
                    <button onClick={() => setForm({ ...form, format: "html" })} className={cn("px-2.5 py-1 text-xs rounded-md transition-colors", form.format === "html" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>HTML</button>
                  </div>
                </div>
                <Textarea id="sch-text" rows={6} className="resize-y font-mono text-sm" placeholder="Write your broadcast here… Use {{channel}}, {{date}}, {{time}} for dynamic values." value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} />
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-1">Variables:</span>
                  {[
                    { v: "{{channel}}", label: "channel name" },
                    { v: "{{date}}", label: "today's date" },
                    { v: "{{time}}", label: "current time" },
                    { v: "{{weekday}}", label: "weekday" },
                    { v: "{{count}}", label: "channel count" },
                    { v: "{{message_title}}", label: "title" },
                  ].map((vr) => (
                    <button
                      key={vr.v}
                      type="button"
                      onClick={() => setForm({ ...form, text: form.text + vr.v })}
                      className="group inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900 px-1.5 py-0.5 text-[10px] font-mono text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
                      title={`Insert ${vr.v} — ${vr.label}`}
                    >
                      <Plus className="h-2.5 w-2.5" />
                      {vr.v}
                    </button>
                  ))}
                </div>
                {/* Character count (Feature 3) — amber >500, rose >1000,
                    Telegram hard limit is 4096 (warn early). */}
                <div className="flex items-center justify-between gap-2">
                  <p
                    className={cn(
                      "text-xs tabular-nums transition-colors",
                      form.text.length > 1000
                        ? "text-rose-600 dark:text-rose-400 font-medium"
                        : form.text.length > 500
                          ? "text-amber-600 dark:text-amber-400 font-medium"
                          : "text-muted-foreground",
                    )}
                    title={form.text.length > 1000 ? "Long message — Telegram limit is 4096" : form.text.length > 500 ? "Approaching lengthy message territory" : undefined}
                  >
                    {form.text.length.toLocaleString()} / 4,096 {t("form.chars")}
                    {form.text.length > 1000 && <span className="ml-1.5">· long message</span>}
                    {form.text.length > 500 && form.text.length <= 1000 && <span className="ml-1.5">· getting long</span>}
                  </p>
                  {form.text.length > 0 && (
                    <div className="h-1 flex-1 max-w-[120px] rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          form.text.length > 1000 ? "bg-rose-500" : form.text.length > 500 ? "bg-amber-500" : "bg-emerald-500",
                        )}
                        style={{ width: `${Math.min((form.text.length / 4096) * 100, 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
              {/* Helper text above the inline button builder (Feature 3). */}
              <p className="text-xs text-muted-foreground -mb-1 flex items-start gap-1.5">
                <Lightbulb className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                <span>{t("scheduled.buttonsHelperText")}</span>
              </p>
              <ButtonBuilder value={form.buttons} onChange={(buttons) => setForm({ ...form, buttons })} />
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Target channels</Label>
                  <span className="text-xs text-muted-foreground">{form.channelIds.length} selected</span>
                </div>
                {channels.length === 0 ? (
                  <p className="text-sm text-muted-foreground rounded-lg border border-dashed p-4 text-center">
                    No channels available. Add channels in the Channels tab first.
                  </p>
                ) : (
                  <ScrollArea className="h-40 rounded-lg border border-border p-2">
                    <ul className="space-y-1">
                      {channels.map((ch) => (
                        <li key={ch.id}>
                          <label className="flex items-center gap-3 rounded-md p-2 hover:bg-accent/40 cursor-pointer">
                            <Checkbox checked={form.channelIds.includes(ch.id)} onCheckedChange={() => toggleChannel(ch.id)} />
                            <span className="text-sm font-medium">{ch.title}</span>
                            {ch.username && <span className="text-xs text-muted-foreground">@{ch.username}</span>}
                          </label>
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                )}
              </div>
              {/* Schedule conflict warning — debounced, informational.
                  Rendered below the channel selector and above the dialog footer. */}
              <ScheduleConflictWarning
                scheduledAt={form.scheduledAt}
                channelIds={form.channelIds}
                repeat={form.repeat}
                excludeId={editingId}
                onEditConflict={(id) => {
                  // Close the current editor and open the conflicting schedule
                  // for editing instead. Same flow as clicking Edit on a card.
                  closeEditor();
                  // Defer to next tick so the current dialog closes first.
                  setTimeout(() => openEditById(id), 0);
                }}
              />
              {/* Scheduling tips collapsible (Feature 3) — three short tips
                  that help admins make the most of the scheduler. */}
              <Collapsible
                open={tipsOpen}
                onOpenChange={setTipsOpen}
                className="rounded-lg border border-border/70 bg-muted/30 px-3"
              >
                <CollapsibleTrigger className="flex w-full items-center justify-between py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                  <span className="flex items-center gap-1.5">
                    <Lightbulb className="h-3.5 w-3.5 text-emerald-600" />
                    {t("scheduled.tips.title")}
                  </span>
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", tipsOpen && "rotate-180")} />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="pb-3 pt-0.5 space-y-1.5">
                    {[
                      t("scheduled.tip.personalize"),
                      t("scheduled.tip.test"),
                      t("scheduled.tip.conflicts"),
                    ].map((tip, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 text-[9px] font-bold shrink-0 mt-0.5 tabular-nums">
                          {i + 1}
                        </span>
                        <span className="leading-relaxed">{tip}</span>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>

            {/* Right column — live Telegram preview */}
            <div className="space-y-2 py-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <Eye className="h-3 w-3 text-emerald-600" />
                  Live Telegram preview
                </p>
                <button
                  onClick={() => setShowPreview((s) => !s)}
                  className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  {showPreview ? <><EyeOff className="h-3 w-3" /> Hide</> : <><Eye className="h-3 w-3" /> Show</>}
                </button>
              </div>
              {showPreview && (
                <div className="lg:sticky lg:top-0">
                  <TelegramMessagePreview
                    text={form.text}
                    format={form.format}
                    buttons={form.buttons}
                    channelTitle={previewChannelTitle}
                    messageTitle={form.title}
                  />
                  <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
                    Preview shows how the message will appear in Telegram. Variables like <code className="font-mono text-emerald-600">{`{{channel}}`}</code> are resolved per-target.
                  </p>
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                onClick={sendTest}
                disabled={testing || !form.text.trim()}
                title={!form.text.trim() ? "Type a message first" : "Send a test message to your Telegram test chat"}
              >
                <Send className="h-4 w-4 text-emerald-600" /> {testing ? "Sending…" : "Send test"}
              </Button>
              {/* Save draft button (Feature 2) — explicit, on-demand autosave
                  with toast feedback. Complements the 2s debounced autosave. */}
              <Button
                variant="outline"
                onClick={saveDraftManual}
                disabled={!form.title.trim() && !form.text.trim()}
                title={t("scheduled.draft.saveTooltip")}
                className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
              >
                <Save className="h-4 w-4" /> {t("scheduled.draft.save")}
              </Button>
            </div>
            <div className="flex-1" />
            <Button variant="outline" onClick={closeEditor}>{t("action.cancel")}</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : editingId ? "Save changes" : "Schedule message"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Logs dialog */}
      <Dialog open={!!logsTarget} onOpenChange={(o) => !o && setLogsTarget(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Delivery logs</DialogTitle>
            <DialogDescription className="truncate">{logsTarget?.title}</DialogDescription>
          </DialogHeader>
          {logsLoading ? (
            <div className="space-y-2 py-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : !logs || logs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No delivery logs yet.</p>
          ) : (
            <ScrollArea className="max-h-80">
              <ul className="space-y-2">
                {logs.map((log) => (
                  <li key={log.id} className="flex items-center gap-3 rounded-lg border border-border/70 p-2.5">
                    {log.success ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" /> : <XCircle className="h-4 w-4 text-rose-500 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{log.channelTitle}</p>
                      {!log.success && log.error && <p className="text-xs text-rose-500 truncate">{log.error}</p>}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{formatDate(log.ranAt)}</span>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ScheduledCard({
  m,
  channels,
  index,
  selected,
  timezone,
  onToggleSelect,
  onEdit,
  onCancel,
  onDelete,
  onClone,
  onDuplicate,
  duplicating,
  onLogs,
}: {
  m: ScheduledMessage;
  channels: Channel[];
  index: number;
  selected: boolean;
  timezone: string;
  onToggleSelect: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onClone: () => void;
  onDuplicate: (offset: "none" | "1d" | "1w") => void;
  duplicating: boolean;
  onLogs: () => void;
}) {
  const { t } = useI18n();
  const targets = parseChannelIds(m.channelIds);
  const targetChannels = channels.filter((c) => targets.includes(c.id));
  const buttonCount = parseButtons(m.buttons).reduce((s, r) => s + r.length, 0);
  const overdue = m.status === "pending" && new Date(m.nextRunAt || m.scheduledAt).getTime() <= Date.now();
  const nextFire = m.status === "pending" ? (m.nextRunAt || m.scheduledAt) : null;
  const countdown = useCountdown(nextFire);
  // Timezone-aware timestamp formatting (Feature 1) — shows the time in the
  // admin's selected TZ with a small "in {zone}" suffix.
  const tzLabel = tzShortLabel(timezone);
  const nextDisplay = formatDateInTz(m.nextRunAt || m.scheduledAt, timezone);
  const scheduledDisplay = formatDateInTz(m.scheduledAt, timezone);
  const scheduledText = m.status === "pending" ? `Next: ${nextDisplay}` : `Scheduled: ${scheduledDisplay}`;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.03, 0.3) }}
    >
      <Card className={cn(
        "group overflow-hidden transition-all duration-200 hover:shadow-md hover:border-emerald-500/40 focus-within:ring-2 focus-within:ring-ring/40",
        overdue && "ring-1 ring-amber-300",
        selected && "ring-2 ring-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/20",
      )}>
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1 flex gap-3">
              <button
                onClick={onToggleSelect}
                className="mt-0.5 shrink-0"
                aria-label={selected ? "Deselect" : "Select"}
              >
                <div className={cn(
                  "h-5 w-5 rounded-md border-2 flex items-center justify-center transition-all",
                  selected
                    ? "bg-emerald-600 border-emerald-600 text-white"
                    : "border-input group-hover:border-emerald-400 bg-background",
                )}>
                  {selected && <CheckCircle2 className="h-3.5 w-3.5" />}
                </div>
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <h3
                    className="font-semibold text-base sm:text-[15px] leading-tight break-words truncate-2 min-w-0 flex-1 sm:flex-initial sm:max-w-[420px] group-hover:text-emerald-700 dark:group-hover:text-emerald-300 transition-colors"
                    title={m.title}
                  >
                    {m.title}
                  </h3>
                  <StatusBadgeIcon status={m.status} />
                  <RepeatBadge repeat={m.repeat} />
                  {buttonCount > 0 && (
                    <Badge variant="outline" className="text-[10px] bg-teal-50 text-teal-700 border-teal-200">
                      {buttonCount} button{buttonCount > 1 ? "s" : ""}
                    </Badge>
                  )}
                  {overdue && (
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs animate-pulse">
                      <Clock className="h-3 w-3 mr-1" /> due now
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2 font-mono whitespace-pre-wrap break-words mb-3">
                  {m.text}
                </p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5" title={timezone}>
                    <CalendarClock className="h-3.5 w-3.5" />
                    {scheduledText}
                    <span className="text-[10px] text-muted-foreground/80">
                      ({t("scheduled.inZone").replace("{{zone}}", tzLabel)})
                    </span>
                  </span>
                  {m.status === "pending" && nextFire && (
                    <span className={cn("flex items-center gap-1.5 font-medium", overdue ? "text-amber-600" : "text-emerald-600")}>
                      <Zap className="h-3 w-3" /> {countdown}
                    </span>
                  )}
                  {m.lastRunAt && (
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Last run {timeAgo(m.lastRunAt)}
                    </span>
                  )}
                  <span className="flex items-center gap-1.5">
                    <Radio className="h-3.5 w-3.5" />
                    {targetChannels.length > 0
                      ? targetChannels.map((c) => c.title).join(", ")
                      : `${targets.length} channel(s)`}
                  </span>
                </div>
                {m.error && (
                  <p className="text-xs text-rose-500 mt-2 flex items-center gap-1.5">
                    <XCircle className="h-3.5 w-3.5" /> {m.error}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0 flex-wrap justify-start lg:justify-end">
              {m._count && m._count.logs > 0 && (
                <Button variant="ghost" size="sm" onClick={onLogs} className="focus-visible:ring-2 focus-visible:ring-ring">
                  Logs <span className="ml-1 text-xs text-muted-foreground">({m._count.logs})</span>
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8 focus-visible:ring-2 focus-visible:ring-ring" onClick={onClone} title="Clone">
                <Copy className="h-4 w-4" />
              </Button>
              {/* Duplicate dropdown (Task 11-b) — three offset options. Lives
                  next to the existing clone button so 11-a's restyle of the
                  card body is unaffected. */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30 focus-visible:ring-2 focus-visible:ring-ring"
                    disabled={duplicating}
                    title={t("scheduled.duplicate.label")}
                    aria-label={t("scheduled.duplicate.label")}
                  >
                    {duplicating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CalendarPlus className="h-4 w-4" />
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                    <CalendarPlus className="h-3.5 w-3.5" />
                    {t("scheduled.duplicate.label")}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => onDuplicate("none")}
                    className="gap-2 cursor-pointer focus:bg-emerald-50 dark:focus:bg-emerald-950/30"
                  >
                    <Copy className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>{t("scheduled.duplicate.asIs")}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => onDuplicate("1d")}
                    className="gap-2 cursor-pointer focus:bg-emerald-50 dark:focus:bg-emerald-950/30"
                  >
                    <Plus className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>{t("scheduled.duplicate.plus1d")}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => onDuplicate("1w")}
                    className="gap-2 cursor-pointer focus:bg-emerald-50 dark:focus:bg-emerald-950/30"
                  >
                    <Plus className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>{t("scheduled.duplicate.plus1w")}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {m.status === "pending" && (
                <>
                  <Button variant="ghost" size="icon" className="h-8 w-8 focus-visible:ring-2 focus-visible:ring-ring" onClick={onEdit} title="Edit">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-amber-600 hover:bg-amber-50 focus-visible:ring-2 focus-visible:ring-ring" onClick={onCancel} title="Cancel schedule">
                    <Ban className="h-4 w-4" />
                  </Button>
                </>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-rose-600 hover:bg-rose-50 focus-visible:ring-2 focus-visible:ring-ring" onClick={onDelete} title="Delete">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
