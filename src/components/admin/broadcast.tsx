"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Send, RefreshCw, History, Megaphone, CheckCircle2, XCircle, Radio, FileText, ChevronDown, Eye, EyeOff, Download, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { apiFetch, formatDate, EmptyState, parseButtons, type Channel, type Post, type Template, type ButtonConfig } from "./shared";
import { ButtonBuilder } from "./button-builder";
import { TelegramMessagePreview } from "./telegram-preview";
import { downloadFile, timestampedFilename } from "@/lib/export-utils";

export function Broadcast() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [format, setFormat] = useState<"markdown" | "html">("markdown");
  const [buttons, setButtons] = useState<ButtonConfig>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<{ title: string; ok: boolean; error?: string }[] | null>(null);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [exporting, setExporting] = useState(false);

  const load = async () => {
    setLoading(true);
    const [chRes, postRes, tplRes] = await Promise.all([
      apiFetch<Channel[]>("/api/channels"),
      apiFetch<Post[]>("/api/posts"),
      apiFetch<Template[]>("/api/templates"),
    ]);
    if (chRes.error) toast.error(chRes.error);
    else setChannels(chRes.data || []);
    if (postRes.error) toast.error(postRes.error);
    else setPosts(postRes.data || []);
    if (tplRes.error) toast.error(tplRes.error);
    else setTemplates(tplRes.data || []);
    setLoading(false);
  };

  const applyTemplate = (t: Template) => {
    setText(t.text);
    setFormat(t.format);
    setButtons(parseButtons(t.buttons));
    setTemplatePickerOpen(false);
    toast.success(`Loaded template: ${t.name}`);
  };

  useEffect(() => {
    const run = async () => {
      await load();
    };
    run();
  }, []);

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const send = async () => {
    if (!text.trim()) {
      toast.error("Message text is required");
      return;
    }
    if (selected.length === 0) {
      toast.error("Select at least one channel");
      return;
    }
    setSending(true);
    setResults(null);
    const cleanButtons = buttons
      .map((row) => row.filter((b) => b.text.trim() && b.url.trim()))
      .filter((row) => row.length > 0);
    const { data, error } = await apiFetch<{ results: { title: string; ok: boolean; error?: string }[] }>(
      "/api/posts/send",
      {
        method: "POST",
        body: JSON.stringify({ text, format, buttons: cleanButtons, channelIds: selected }),
      },
    );
    setSending(false);
    if (error) {
      toast.error(error);
      return;
    }
    setResults(data?.results || []);
    const okCount = data?.results.filter((r) => r.ok).length || 0;
    const total = data?.results.length || 0;
    if (okCount === total) toast.success(`Broadcast sent to ${okCount} channel${okCount > 1 ? "s" : ""}`);
    else if (okCount > 0) toast.warning(`Sent to ${okCount}/${total} channels`);
    else toast.error("Broadcast failed for all channels");
    load();
  };

  const activeChannels = channels;
  const previewChannelTitle = channels.find((c) => selected.includes(c.id))?.title;

  const exportHistory = async (format: "csv" | "json") => {
    setExporting(true);
    try {
      const res = await fetch(`/api/export?type=logs&format=${format}`);
      if (!res.ok) {
        toast.error("Export failed");
        return;
      }
      const text = await res.text();
      downloadFile(text, timestampedFilename("delivery-logs", format), format === "csv" ? "text/csv;charset=utf-8" : "application/json");
      toast.success(`Exported delivery logs as ${format.toUpperCase()}`);
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Broadcast</h2>
        <p className="text-sm text-muted-foreground">Compose a message and send it immediately to selected channels.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Megaphone className="h-4 w-4 text-emerald-600" /> Compose message
                  </CardTitle>
                  <CardDescription>Markdown or HTML. The message is sent via Telegram parse_mode.</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {templates.length > 0 && (
                    <Popover open={templatePickerOpen} onOpenChange={setTemplatePickerOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm">
                          <FileText className="h-4 w-4" /> Template
                          <ChevronDown className="h-3 w-3 ml-1" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-72 p-2" align="end">
                        <div className="space-y-1 max-h-64 overflow-y-auto scrollbar-thin">
                          {templates.map((t) => (
                            <button
                              key={t.id}
                              onClick={() => applyTemplate(t)}
                              className="w-full text-left rounded-md p-2 hover:bg-accent/60 transition-colors"
                            >
                              <p className="text-sm font-medium truncate">{t.name}</p>
                              <p className="text-xs text-muted-foreground line-clamp-1 font-mono">{t.text}</p>
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                  <button
                    onClick={() => setShowPreview((s) => !s)}
                    className="hidden lg:flex h-8 w-8 rounded-lg border border-border bg-card hover:bg-accent items-center justify-center transition-colors"
                    title={showPreview ? "Hide preview" : "Show preview"}
                  >
                    {showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4 text-emerald-600" />}
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="msg-text">Message</Label>
                  <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
                    <button
                      onClick={() => setFormat("markdown")}
                      className={cn("px-2.5 py-1 text-xs rounded-md transition-colors", format === "markdown" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                    >
                      Markdown
                    </button>
                    <button
                      onClick={() => setFormat("html")}
                      className={cn("px-2.5 py-1 text-xs rounded-md transition-colors", format === "html" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                    >
                      HTML
                    </button>
                  </div>
                </div>
                <Textarea
                  id="msg-text"
                  placeholder={format === "markdown" ? "**Hello** world!\n\nVisit [our channel](https://t.me/...)\n\nUse {{channel}} for per-channel personalization." : "<b>Hello</b> world!\n\nVisit <a href=\"https://t.me/...\">our channel</a>\n\nUse {{channel}} for per-channel personalization."}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={9}
                  className="resize-y font-mono text-sm"
                />
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-1">Variables:</span>
                  {[
                    "{{channel}}",
                    "{{date}}",
                    "{{time}}",
                    "{{weekday}}",
                    "{{count}}",
                  ].map((vr) => (
                    <button
                      key={vr}
                      type="button"
                      onClick={() => setText(text + vr)}
                      className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900 px-1.5 py-0.5 text-[10px] font-mono text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
                      title={`Insert ${vr}`}
                    >
                      <Plus className="h-2.5 w-2.5" />
                      {vr}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{text.length} characters</p>
              </div>

              <ButtonBuilder value={buttons} onChange={setButtons} />

              {results && (
                <div className="rounded-lg border border-border p-3 bg-muted/30">
                  <p className="text-xs font-medium mb-2 text-muted-foreground">Delivery results</p>
                  <ul className="space-y-1.5">
                    {results.map((r, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        {r.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-rose-500" />}
                        <span className="font-medium">{r.title}</span>
                        {!r.ok && r.error && <span className="text-xs text-rose-500 truncate">— {r.error}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <Button onClick={send} disabled={sending} className="w-full sm:w-auto">
                <Send className="h-4 w-4" />
                {sending ? "Sending…" : `Send to ${selected.length} channel${selected.length === 1 ? "" : "s"}`}
              </Button>
            </CardContent>
          </Card>

          {showPreview && (
            <div className="lg:hidden">
              <PreviewSection
                text={text}
                format={format}
                buttons={buttons}
                channelTitle={previewChannelTitle}
              />
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Radio className="h-4 w-4 text-emerald-600" /> Target channels
              </CardTitle>
              <CardDescription>{selected.length} of {activeChannels.length} selected</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 rounded-lg" />
                  ))}
                </div>
              ) : activeChannels.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No channels yet. Add some in the Channels tab.</p>
              ) : (
                <ScrollArea className="h-72 pr-2">
                  <ul className="space-y-1">
                    {activeChannels.map((ch) => (
                      <li key={ch.id}>
                        <label className="flex items-center gap-3 rounded-lg border border-border/60 p-2.5 hover:bg-accent/40 transition-colors cursor-pointer">
                          <Checkbox checked={selected.includes(ch.id)} onCheckedChange={() => toggle(ch.id)} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{ch.title}</p>
                            <p className="text-xs text-muted-foreground font-mono truncate">{ch.username ? `@${ch.username}` : ch.telegramId}</p>
                          </div>
                          {!ch.active && <Badge variant="outline" className="text-[10px]">paused</Badge>}
                        </label>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              )}
              {activeChannels.length > 0 && (
                <div className="flex gap-2 mt-3">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => setSelected(activeChannels.map((c) => c.id))}>
                    Select all
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => setSelected([])}>
                    Clear
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {showPreview && (
            <div className="hidden lg:block">
              <PreviewSection
                text={text}
                format={format}
                buttons={buttons}
                channelTitle={previewChannelTitle}
              />
            </div>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4 text-teal-600" /> Broadcast history
            </CardTitle>
            <CardDescription>Recently sent messages (saved automatically)</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" disabled={exporting || posts.length === 0}>
                  <Download className="h-4 w-4" /> {exporting ? "Exporting…" : "Export"}
                  <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-44 p-1" align="end">
                <button
                  onClick={() => exportHistory("csv")}
                  className="w-full text-left rounded-md px-2.5 py-1.5 text-sm hover:bg-accent transition-colors flex items-center gap-2"
                >
                  <Download className="h-3.5 w-3.5 text-emerald-600" /> CSV file
                </button>
                <button
                  onClick={() => exportHistory("json")}
                  className="w-full text-left rounded-md px-2.5 py-1.5 text-sm hover:bg-accent transition-colors flex items-center gap-2"
                >
                  <Download className="h-3.5 w-3.5 text-teal-600" /> JSON file
                </button>
              </PopoverContent>
            </Popover>
            <Button variant="ghost" size="sm" onClick={load}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : posts.length === 0 ? (
            <EmptyState icon={History} title="No broadcasts yet" description="Sent messages will appear here." />
          ) : (
            <ScrollArea className="max-h-96">
              <ul className="divide-y divide-border">
                {posts.map((p) => (
                  <li key={p.id} className="p-4 hover:bg-accent/30 transition-colors">
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <Badge variant="outline" className="text-[10px] uppercase">{p.format}</Badge>
                      <span className="text-xs text-muted-foreground">{formatDate(p.createdAt)}</span>
                    </div>
                    <p className="text-sm line-clamp-2 font-mono whitespace-pre-wrap break-words">{p.text}</p>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PreviewSection({
  text,
  format,
  buttons,
  channelTitle,
}: {
  text: string;
  format: "markdown" | "html";
  buttons: ButtonConfig;
  channelTitle?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <Eye className="h-3 w-3 text-emerald-600" />
          Live Telegram preview
        </p>
        <p className="text-[10px] text-muted-foreground">How recipients will see it</p>
      </div>
      <TelegramMessagePreview
        text={text}
        format={format}
        buttons={buttons}
        channelTitle={channelTitle}
        messageTitle="Broadcast"
      />
      <p className="text-[10px] text-muted-foreground leading-relaxed">
        Preview shows how the message will appear in Telegram. Variables like <code className="font-mono text-emerald-600">{`{{channel}}`}</code> are resolved per-target.
      </p>
    </div>
  );
}
