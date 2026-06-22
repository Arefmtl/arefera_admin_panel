"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Radio, Trash2, RefreshCw, Hash, Link2, CheckCircle2, Circle, Megaphone, ChevronDown, ChevronUp, Users, Send, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { apiFetch, formatDate, timeAgo, EmptyState, type Channel } from "./shared";
import { ChannelHealthMonitor } from "./channel-health";
import { useI18n } from "@/lib/i18n";

const SHOW_HEALTH_KEY = "tg-bot-admin:show-channel-health";

/** Subset of /api/channels/health response we need for "Last message" + subscribers hint. */
type ChannelHealthLite = {
  channelId: string;
  lastDeliveryAt: string | null;
  totalDeliveries: number;
};

export function Channels() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [tgId, setTgId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showHealth, setShowHealth] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SHOW_HEALTH_KEY) !== "false";
    } catch {
      return true;
    }
  });
  const { t } = useI18n();
  // Map of channelId → last delivery ISO timestamp (from /api/channels/health).
  const [healthMap, setHealthMap] = useState<Map<string, ChannelHealthLite>>(new Map());
  // Per-channel "Send test" loading state — keyed by channel id so multiple
  // cards can independently show a spinner without affecting each other.
  // (Task 11-b)
  const [testingChannelId, setTestingChannelId] = useState<string | null>(null);

  const toggleHealth = () => {
    const next = !showHealth;
    setShowHealth(next);
    try {
      localStorage.setItem(SHOW_HEALTH_KEY, String(next));
    } catch {
      /* ignore */
    }
  };

  const load = async () => {
    setLoading(true);
    const [chRes, healthRes] = await Promise.all([
      apiFetch<Channel[]>("/api/channels"),
      apiFetch<ChannelHealthLite[]>("/api/channels/health"),
    ]);
    if (chRes.error) toast.error(chRes.error);
    else setChannels(chRes.data || []);
    // Health endpoint may fail silently (e.g. no logs yet) — fall back to empty map.
    if (!healthRes.error && Array.isArray(healthRes.data)) {
      const map = new Map<string, ChannelHealthLite>();
      healthRes.data.forEach((h) => map.set(h.channelId, h));
      setHealthMap(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    const run = async () => {
      await load();
    };
    run();
  }, []);

  const add = async () => {
    if (!tgId.trim()) {
      toast.error("Channel ID or @username is required");
      return;
    }
    setSubmitting(true);
    const { error } = await apiFetch("/api/channels", {
      method: "POST",
      body: JSON.stringify({ telegramId: tgId.trim() }),
    });
    setSubmitting(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Channel added");
    setTgId("");
    setOpen(false);
    load();
  };

  const toggleActive = async (ch: Channel) => {
    // optimistic
    setChannels((prev) => prev.map((c) => (c.id === ch.id ? { ...c, active: !c.active } : c)));
    const { error } = await apiFetch(`/api/channels/${ch.id}`, {
      method: "PATCH",
      body: JSON.stringify({ active: !ch.active }),
    });
    if (error) {
      toast.error(error);
      load();
    }
  };

  const remove = async (ch: Channel) => {
    const { error } = await apiFetch(`/api/channels/${ch.id}`, { method: "DELETE" });
    if (error) toast.error(error);
    else {
      toast.success("Channel removed");
      load();
    }
  };

  // Send a test message to a specific channel (Task 11-b). Uses the channel's
  // own `telegramId` as the target — independent of the default `testChatId`
  // setting. Surfaces a red toast when the bot token is missing so the admin
  // knows to configure it before retrying.
  const sendTestToChannel = async (ch: Channel) => {
    setTestingChannelId(ch.id);
    const { data, error } = await apiFetch<{ ok: boolean; success?: boolean; messageId?: number | null; error?: string }>(
      `/api/channels/${ch.id}/test`,
      { method: "POST" },
    );
    setTestingChannelId(null);
    if (error) {
      // 400 + "Bot token not configured" → friendly localized toast.
      if (error === "Bot token not configured") {
        toast.error(t("channels.sendTest.tokenMissing"));
      } else {
        toast.error(error);
      }
      return;
    }
    if (!data?.ok || !data?.success) {
      toast.error(data?.error || t("channels.sendTest.failed"));
      return;
    }
    toast.success(t("channels.sendTest.success"));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Channels</h2>
          <p className="text-sm text-muted-foreground">Telegram chats the bot can broadcast to. The bot must be an admin of each.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={toggleHealth} className="focus-visible:ring-2 focus-visible:ring-ring">
            {showHealth ? (
              <>
                <ChevronUp className="h-4 w-4" /> {t("channels.health.hide")}
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4" /> {t("channels.health.show")}
              </>
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={load} className="focus-visible:ring-2 focus-visible:ring-ring">
            <RefreshCw className="h-4 w-4" /> <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="focus-visible:ring-2 focus-visible:ring-ring">
                <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Add channel</span><span className="sm:hidden">Add</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add a channel</DialogTitle>
                <DialogDescription>
                  Make sure the bot is a member and <strong>admin</strong> of the channel first. Then send the numeric ID
                  (e.g. <span className="font-mono">-1001234567890</span>) or the @username.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 py-2">
                <Label htmlFor="ch-id">Channel ID or @username</Label>
                <Input
                  id="ch-id"
                  placeholder="@mychannel or -1001234567890"
                  value={tgId}
                  onChange={(e) => setTgId(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && add()}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={add} disabled={submitting}>
                  {submitting ? "Resolving…" : "Add channel"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Channel Health Monitor — top section above the channels list */}
      {showHealth && (
        <Card className="overflow-hidden">
          <CardContent className="p-5 bg-mesh-emerald">
            <ChannelHealthMonitor />
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : channels.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <div className="empty-state-icon-emerald">
              <EmptyState
                icon={Radio}
                title="No channels registered"
                description="Add a Telegram channel so the bot can broadcast messages to it."
              />
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {channels.map((ch) => {
            const health = healthMap.get(ch.id);
            const lastDelivery = health?.lastDeliveryAt ?? null;
            return (
              <Card key={ch.id} className="overflow-hidden card-hover-lift">
                <CardContent className="p-5">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${ch.type === "channel" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400" : "bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-400"}`}>
                      {ch.type === "channel" ? <Megaphone className="h-5 w-5" /> : <Hash className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      {/* Channel name — line-clamp-2 with full text in title attribute */}
                      <p
                        className="font-semibold line-clamp-2 leading-tight break-words min-w-0"
                        title={ch.title}
                      >
                        {ch.title}
                      </p>
                      <div className="flex items-center gap-1.5 text-xs mt-1.5 flex-wrap">
                        {ch.username ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 gap-0.5 shrink-0"
                          >
                            <Link2 className="h-2.5 w-2.5" />@{ch.username}
                          </Badge>
                        ) : (
                          <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[140px] shrink-0">
                            {ch.telegramId}
                          </span>
                        )}
                        {/* Subscriber count placeholder — muted hint for future Telegram API enrichment */}
                        <span className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5 whitespace-nowrap shrink-0">
                          <Users className="h-2.5 w-2.5" />— {t("channels.subscribers")}
                        </span>
                      </div>
                      {/* Last message timestamp — whitespace-nowrap so "1d ago" never truncates to "1d ag" */}
                      <p className="text-[10px] text-muted-foreground mt-1.5 whitespace-nowrap shrink-0">
                        {lastDelivery
                          ? <>{t("channels.lastMessage")}: {timeAgo(lastDelivery)}</>
                          : <span className="italic opacity-70">{t("channels.noActivity")}</span>
                        }
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <Switch
                        checked={ch.active}
                        onCheckedChange={() => toggleActive(ch)}
                        id={`active-${ch.id}`}
                        className={ch.active ? "" : "data-[state=unchecked]:bg-zinc-300 dark:data-[state=unchecked]:bg-zinc-700"}
                      />
                      <Label
                        htmlFor={`active-${ch.id}`}
                        className={`text-xs cursor-pointer flex items-center gap-1 truncate ${ch.active ? "text-emerald-700 dark:text-emerald-300 font-medium" : "text-muted-foreground"}`}
                      >
                        {ch.active ? (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-400 shrink-0" />
                            {t("channels.active")}
                          </>
                        ) : (
                          <>
                            <Circle className="h-3.5 w-3.5 shrink-0" />
                            {t("channels.paused")}
                          </>
                        )}
                      </Label>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Send test action (Task 11-b) — emerald outline icon button.
                          Sits next to the existing delete button so the
                          card's action area isn't restructured. */}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-900 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
                        onClick={() => sendTestToChannel(ch)}
                        disabled={testingChannelId === ch.id}
                        title={t("channels.sendTest.tooltip")}
                        aria-label={t("channels.sendTest.tooltip")}
                      >
                        {testingChannelId === ch.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="h-3.5 w-3.5" />
                        )}
                        <span className="hidden sm:inline">
                          {testingChannelId === ch.id
                            ? t("channels.sendTest.sending")
                            : t("channels.sendTest.title")}
                        </span>
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 focus-visible:ring-2 focus-visible:ring-ring shrink-0" onClick={() => remove(ch)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-3 whitespace-nowrap">Added {formatDate(ch.createdAt)}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
