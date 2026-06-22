"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  FileText,
  Plus,
  Trash2,
  Pencil,
  RefreshCw,
  Search,
  Copy,
  Check,
  Eye,
  Download,
  Send,
  X,
  Filter,
  ArrowUpDown,
  Inbox,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  apiFetch,
  formatDate,
  timeAgo,
  EmptyState,
  parseButtons,
  type Template,
  type ButtonConfig,
} from "./shared";
import { ButtonBuilder } from "./button-builder";
import { TelegramMessagePreview } from "./telegram-preview";
import { downloadJSON, timestampedFilename } from "@/lib/export-utils";
import { useI18n } from "@/lib/i18n";

/** The localStorage key the Scheduled editor reads to restore a draft. */
const SCHEDULE_DRAFT_KEY = "tg-bot-admin:schedule-draft";

type EditorState = {
  name: string;
  text: string;
  format: "markdown" | "html";
  category: string;
  buttons: ButtonConfig;
};

type SortKey = "name" | "created" | "category" | "usageDesc" | "usageAsc";

/** Per-template usage stats returned by GET /api/templates/usage (Task 11-c). */
type TemplateUsage = {
  id: string;
  name: string;
  category: string;
  usageCount: number;
  lastUsedAt: string | null;
  successRate: number | null;
};
type UsageMap = Record<string, TemplateUsage>;

/** The standard category list — derives from existing templates + the curated defaults. */
const DEFAULT_CATEGORIES = ["general", "welcome", "maintenance", "marketing", "holiday"];

function emptyEditor(): EditorState {
  return { name: "", text: "", format: "markdown", category: "general", buttons: [] };
}

/**
 * Push a template's content into the schedule-draft localStorage slot.
 * The Scheduled editor auto-restores drafts on its next "new" open, so
 * the user gets the template fields pre-filled with a restore banner.
 */
function pushTemplateToScheduleDraft(t: Template) {
  try {
    const payload = {
      title: t.name,
      text: t.text,
      format: t.format,
      channelIds: [] as string[],
      scheduledAt: "",
      repeat: "none" as const,
      buttons: parseButtons(t.buttons),
      _savedAt: Date.now(),
    };
    localStorage.setItem(SCHEDULE_DRAFT_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota errors */
  }
}

export function Templates() {
  const { t } = useI18n();
  const [templates, setTemplates] = useState<Template[]>([]);
  // Per-template usage stats (Task 11-c). Empty map until /api/templates/usage
  // resolves — the UI renders "Never used" for templates missing from the map.
  const [usageMap, setUsageMap] = useState<UsageMap>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EditorState>(emptyEditor());
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // Preview dialog
  const [previewTpl, setPreviewTpl] = useState<Template | null>(null);
  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  // Filters
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortKey>("created");

  const load = async () => {
    setLoading(true);
    // Fetch templates + their usage stats in parallel (Task 11-c).
    const [tplRes, usageRes] = await Promise.all([
      apiFetch<Template[]>("/api/templates"),
      apiFetch<{ templates: TemplateUsage[] }>("/api/templates/usage"),
    ]);
    if (tplRes.error) toast.error(tplRes.error);
    else setTemplates(tplRes.data || []);
    if (usageRes.error) {
      // Usage stats are best-effort — don't surface an error toast, just leave
      // the map empty so the UI shows "Never used" for everything.
      setUsageMap({});
    } else if (usageRes.data?.templates) {
      const map: UsageMap = {};
      for (const u of usageRes.data.templates) map[u.id] = u;
      setUsageMap(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    const run = async () => {
      await load();
    };
    run();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyEditor());
    setEditorOpen(true);
  };

  const openEdit = (tpl: Template) => {
    setEditingId(tpl.id);
    setForm({
      name: tpl.name,
      text: tpl.text,
      format: tpl.format,
      category: tpl.category,
      buttons: parseButtons(tpl.buttons),
    });
    setEditorOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Template name is required");
      return;
    }
    if (!form.text.trim()) {
      toast.error("Template text is required");
      return;
    }
    setSaving(true);
    const body = JSON.stringify(form);
    if (editingId) {
      const { error } = await apiFetch(`/api/templates/${editingId}`, { method: "PATCH", body });
      setSaving(false);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success("Template updated");
    } else {
      const { error } = await apiFetch("/api/templates", { method: "POST", body });
      setSaving(false);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success("Template created");
    }
    setEditorOpen(false);
    load();
  };

  const remove = async (tpl: Template) => {
    const { error } = await apiFetch(`/api/templates/${tpl.id}`, { method: "DELETE" });
    if (error) toast.error(error);
    else {
      toast.success("Template deleted");
      load();
    }
  };

  const copyText = async (tpl: Template) => {
    try {
      await navigator.clipboard.writeText(tpl.text);
      setCopiedId(tpl.id);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  /**
   * "Use this template" — saves template fields to the schedule-draft
   * localStorage slot and dispatches a window event. The Scheduled editor
   * restores drafts on its next "new" open, pre-filling the form.
   */
  const applyTemplateToSchedule = (tpl: Template) => {
    pushTemplateToScheduleDraft(tpl);
    // Dispatch a custom event for any listener (parent navigators etc.).
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("templates:use", { detail: { id: tpl.id, name: tpl.name } }),
      );
    }
    setPreviewTpl(null);
    toast.success(t("templates.useSuccess"));
  };

  // Selection helpers
  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedIds(new Set(filtered.map((tpl) => tpl.id)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const bulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const confirmed = window.confirm(
      t("templates.deleteConfirm").replace("{{count}}", String(selectedIds.size)),
    );
    if (!confirmed) return;
    setBulkDeleting(true);
    let ok = 0;
    let fail = 0;
    await Promise.all(
      Array.from(selectedIds).map(async (id) => {
        const { error } = await apiFetch(`/api/templates/${id}`, { method: "DELETE" });
        if (error) fail++;
        else ok++;
      }),
    );
    setBulkDeleting(false);
    if (ok > 0) {
      toast.success(t("templates.deleted").replace("{{count}}", String(ok)));
    }
    if (fail > 0) {
      toast.error(`Failed to delete ${fail} template(s)`);
    }
    clearSelection();
    load();
  };

  const bulkExport = () => {
    if (selectedIds.size === 0) return;
    const selected = templates.filter((tpl) => selectedIds.has(tpl.id));
    const exportable = selected.map((tpl) => ({
      name: tpl.name,
      text: tpl.text,
      format: tpl.format,
      category: tpl.category,
      buttons: parseButtons(tpl.buttons),
    }));
    downloadJSON(exportable, timestampedFilename("templates", "json"));
    toast.success(t("templates.exported").replace("{{count}}", String(selected.length)));
  };

  // Categories — union of defaults and any custom categories found in templates.
  const categories = useMemo(() => {
    const found = new Set<string>(DEFAULT_CATEGORIES);
    templates.forEach((tpl) => found.add(tpl.category));
    return Array.from(found);
  }, [templates]);

  // Apply search + category filter + sort
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const filteredList = templates.filter((tpl) => {
      const matchesSearch =
        !q ||
        tpl.name.toLowerCase().includes(q) ||
        tpl.text.toLowerCase().includes(q) ||
        tpl.category.toLowerCase().includes(q);
      const matchesCategory = categoryFilter === "all" || tpl.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
    const sorted = [...filteredList].sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "category") return a.category.localeCompare(b.category);
      if (sortBy === "usageDesc") {
        const ua = usageMap[a.id]?.usageCount ?? 0;
        const ub = usageMap[b.id]?.usageCount ?? 0;
        if (ub !== ua) return ub - ua;
        // Tiebreak: name A-Z so the order is stable.
        return a.name.localeCompare(b.name);
      }
      if (sortBy === "usageAsc") {
        const ua = usageMap[a.id]?.usageCount ?? 0;
        const ub = usageMap[b.id]?.usageCount ?? 0;
        if (ua !== ub) return ua - ub;
        return a.name.localeCompare(b.name);
      }
      // created (newest first)
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return sorted;
  }, [templates, search, categoryFilter, sortBy, usageMap]);

  const hasActiveFilters = search.trim() !== "" || categoryFilter !== "all";

  const clearFilters = () => {
    setSearch("");
    setCategoryFilter("all");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FileText className="h-5 w-5 text-emerald-600 dark:text-emerald-400" /> Message templates
          </h2>
          <p className="text-sm text-muted-foreground">Reusable message presets for broadcasts and scheduled messages.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" /> New template
          </Button>
        </div>
      </div>

      {/* Search + filters */}
      {templates.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search templates…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Filter className="h-4 w-4 text-muted-foreground hidden sm:block" />
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger size="sm" className="w-[160px]" aria-label={t("templates.filterCategory")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("templates.categoryAll")}</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat} className="capitalize">
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1.5">
              <ArrowUpDown className="h-4 w-4 text-muted-foreground hidden sm:block" />
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
                <SelectTrigger size="sm" className="w-[170px]" aria-label={t("templates.sortBy")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created">{t("templates.sortCreated")}</SelectItem>
                  <SelectItem value="name">{t("templates.sortName")}</SelectItem>
                  <SelectItem value="category">{t("templates.sortCategory")}</SelectItem>
                  <SelectItem value="usageDesc">{t("templates.sortUsageDesc")}</SelectItem>
                  <SelectItem value="usageAsc">{t("templates.sortUsageAsc")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="sticky top-16 z-20 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-300/60 dark:border-emerald-700/50 bg-emerald-50/95 dark:bg-emerald-950/50 backdrop-blur px-4 py-2.5 shadow-sm">
          <div className="flex items-center gap-3 text-sm">
            <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-700">
              {t("templates.bulkSelected").replace("{{count}}", String(selectedIds.size))}
            </Badge>
            <button
              onClick={selectAllVisible}
              className="text-xs text-emerald-700 dark:text-emerald-300 hover:underline"
            >
              {t("templates.selectAll")}
            </button>
            <button
              onClick={clearSelection}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <X className="h-3 w-3" /> {t("templates.clearSelection")}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={bulkExport}
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
            >
              <Download className="h-3.5 w-3.5" /> {t("templates.exportSelected")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={bulkDelete}
              disabled={bulkDeleting}
              className="border-rose-300 text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-900/40"
            >
              <Trash2 className="h-3.5 w-3.5" /> {t("templates.deleteSelected")}
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={FileText}
              title="No templates yet"
              description="Create reusable message templates to speed up your broadcasts and scheduled messages."
              action={
                <Button size="sm" onClick={openCreate}>
                  <Plus className="h-4 w-4" /> New template
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        // Empty state for filtered results
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={Inbox}
              title={t("templates.noMatch")}
              description={t("templates.noMatchDesc")}
              action={
                <Button size="sm" variant="outline" onClick={clearFilters}>
                  <X className="h-4 w-4" /> {t("templates.clearFilters")}
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Category summary chips (only when no filter active) */}
          {categoryFilter === "all" && categories.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => {
                const count = templates.filter((tpl) => tpl.category === cat).length;
                return (
                  <Badge
                    key={cat}
                    variant="outline"
                    className="text-xs capitalize bg-accent/50 cursor-pointer hover:bg-emerald-100/60 dark:hover:bg-emerald-900/30 transition-colors"
                    onClick={() => setCategoryFilter(cat)}
                  >
                    {cat} ({count})
                  </Badge>
                );
              })}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((tpl) => {
              const isSelected = selectedIds.has(tpl.id);
              const buttonsParsed = parseButtons(tpl.buttons);
              const buttonCount = buttonsParsed.reduce((s, r) => s + r.length, 0);
              // Per-template usage stats (Task 11-c).
              const usage = usageMap[tpl.id];
              const usageCount = usage?.usageCount ?? 0;
              const lastUsedAt = usage?.lastUsedAt ?? null;
              const usedLabel =
                usageCount === 1
                  ? t("templates.usedOnce")
                  : t("templates.usedTimes").replace("{{count}}", String(usageCount));
              return (
                <Card
                  key={tpl.id}
                  className={cn(
                    "overflow-hidden flex flex-col transition-all card-hover-lift relative",
                    isSelected && "ring-2 ring-emerald-400 dark:ring-emerald-500",
                  )}
                >
                  {/* Selection checkbox — top-left corner */}
                  <div className="absolute top-3 left-3 z-10">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSelected(tpl.id)}
                      aria-label={`Select ${tpl.name}`}
                      className="bg-background/80 backdrop-blur"
                    />
                  </div>
                  {/* Usage badge — top-right corner (Task 11-c).
                      Emerald when the template has been used at least once,
                      muted when it has never been used. */}
                  <div className="absolute top-3 right-3 z-10 flex flex-col items-end gap-0.5">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] font-medium",
                        usageCount > 0
                          ? "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800"
                          : "bg-muted/60 text-muted-foreground border-border",
                      )}
                      title={usageCount > 0 ? usedLabel : t("templates.neverUsed")}
                    >
                      {usedLabel}
                    </Badge>
                    {lastUsedAt && (
                      <span className="text-[9px] text-muted-foreground tabular-nums">
                        {t("templates.lastUsed").replace("{{when}}", timeAgo(lastUsedAt))}
                      </span>
                    )}
                  </div>
                  <CardContent className="p-5 flex-1 flex flex-col pt-9">
                    <button
                      className="text-left flex-1 flex flex-col"
                      onClick={() => setPreviewTpl(tpl)}
                      title="Click to preview"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0 pr-20">
                          <h3 className="font-semibold truncate">{tpl.name}</h3>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <Badge variant="outline" className="text-[10px] capitalize bg-accent/50">{tpl.category}</Badge>
                            <Badge variant="outline" className="text-[10px] uppercase">{tpl.format}</Badge>
                            {buttonCount > 0 && (
                              <Badge variant="outline" className="text-[10px] bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800">
                                {t("templates.buttons.count").replace("{{count}}", String(buttonCount))}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-4 font-mono whitespace-pre-wrap break-words flex-1 mt-1">
                        {tpl.text}
                      </p>
                    </button>
                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/60">
                      <span className="text-[11px] text-muted-foreground">{formatDate(tpl.createdAt)}</span>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setPreviewTpl(tpl)}
                          title="Preview"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyText(tpl)} title="Copy text">
                          {copiedId === tpl.id ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(tpl)} title="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                          onClick={() => remove(tpl)}
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* Preview dialog — reuses TelegramMessagePreview */}
      <Dialog open={!!previewTpl} onOpenChange={(o) => !o && setPreviewTpl(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto scrollbar-thin">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              {t("templates.preview")}
            </DialogTitle>
            <DialogDescription>{t("templates.previewDesc")}</DialogDescription>
          </DialogHeader>
          {previewTpl && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-base">{previewTpl.name}</h3>
                <Badge variant="outline" className="text-[10px] capitalize bg-accent/50">{previewTpl.category}</Badge>
                <Badge variant="outline" className="text-[10px] uppercase">{previewTpl.format}</Badge>
              </div>
              <TelegramMessagePreview
                text={previewTpl.text}
                format={previewTpl.format}
                buttons={parseButtons(previewTpl.buttons)}
                channelTitle={previewTpl.name}
                messageTitle={previewTpl.name}
              />
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Raw content</p>
                <pre className="text-xs font-mono whitespace-pre-wrap break-words max-h-40 overflow-y-auto scrollbar-thin">
                  {previewTpl.text}
                </pre>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPreviewTpl(null)}>
              {t("action.close")}
            </Button>
            {previewTpl && (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (previewTpl) openEdit(previewTpl);
                    setPreviewTpl(null);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" /> {t("action.edit")}
                </Button>
                <Button onClick={() => previewTpl && applyTemplateToSchedule(previewTpl)}>
                  <Send className="h-3.5 w-3.5" /> {t("templates.useThis")}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editor dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto scrollbar-thin">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit template" : "New template"}</DialogTitle>
            <DialogDescription>Templates can be loaded when composing broadcasts or scheduled messages.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="tpl-name">Name</Label>
                <Input id="tpl-name" placeholder="e.g. Welcome message" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tpl-cat">Category</Label>
                <Input id="tpl-cat" placeholder="e.g. announcements" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="tpl-text">Message</Label>
                <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
                  <button onClick={() => setForm({ ...form, format: "markdown" })} className={cn("px-2.5 py-1 text-xs rounded-md transition-colors", form.format === "markdown" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>Markdown</button>
                  <button onClick={() => setForm({ ...form, format: "html" })} className={cn("px-2.5 py-1 text-xs rounded-md transition-colors", form.format === "html" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>HTML</button>
                </div>
              </div>
              <Textarea id="tpl-text" rows={6} className="resize-y font-mono text-sm" placeholder="Write your template here…" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} />
            </div>
            <ButtonBuilder value={form.buttons} onChange={(buttons) => setForm({ ...form, buttons })} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : editingId ? "Save changes" : "Create template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
