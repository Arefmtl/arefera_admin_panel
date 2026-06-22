"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Bot,
  Save,
  Plug,
  CheckCircle2,
  XCircle,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Eye,
  EyeOff,
  ArrowDown,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Smartphone,
  Key,
  Send,
  MessageSquare,
  Eraser,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch } from "./shared";
import { useI18n } from "@/lib/i18n";
import { ActiveSessions } from "./active-sessions";
import { TwoFactorSetup } from "./two-factor-setup";

type SettingsData = {
  hasToken: boolean;
  tokenPreview: string | null;
  hasPanelPassword?: boolean;
  isDefaultPassword?: boolean;
  settings: Record<string, string>;
};

type BotInfo = { id: number; username: string; first_name: string };

export function Settings() {
  const { t } = useI18n();
  const [data, setData] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [botInfo, setBotInfo] = useState<BotInfo | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  // Panel password state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [showSecurityTips, setShowSecurityTips] = useState(false);

  // 2FA state
  type TwoFactorStatus = { enabled: boolean; hasSecret: boolean; backupCodesRemaining: number };
  const [twoFactor, setTwoFactor] = useState<TwoFactorStatus | null>(null);
  const [twoFactorLoading, setTwoFactorLoading] = useState(true);
  const [setupOpen, setSetupOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [disabling, setDisabling] = useState(false);

  // Test chat state (Task 11-b)
  const [testChatId, setTestChatId] = useState<string | null>(null);
  const [testChatInput, setTestChatInput] = useState("");
  const [testChatLoading, setTestChatLoading] = useState(true);
  const [testChatSaving, setTestChatSaving] = useState(false);
  const [testChatSending, setTestChatSending] = useState(false);

  // Ref to the password-change card so the "Change password now" CTA can
  // scroll-into-view when the default-password warning is shown.
  const passwordCardRef = useRef<HTMLDivElement | null>(null);

  const loadTwoFactor = async () => {
    setTwoFactorLoading(true);
    const { data, error } = await apiFetch<TwoFactorStatus>("/api/auth/2fa/status");
    if (error) {
      // Most likely the user just logged out (cookie cleared). Silently
      // ignore — the parent will redirect to the login screen.
      console.warn("[2fa] failed to load status:", error);
    } else if (data) {
      setTwoFactor(data);
    }
    setTwoFactorLoading(false);
  };

  const disable2FA = async () => {
    if (!disablePassword) {
      toast.error("Enter your panel password to disable 2FA");
      return;
    }
    setDisabling(true);
    const { error } = await apiFetch("/api/auth/2fa/disable", {
      method: "POST",
      body: JSON.stringify({ password: disablePassword }),
    });
    setDisabling(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(t("settings.2fa.disabled"));
    setDisableOpen(false);
    setDisablePassword("");
    loadTwoFactor();
  };

  const load = async () => {
    setLoading(true);
    const { data, error } = await apiFetch<SettingsData>("/api/settings");
    if (error) toast.error(error);
    else setData(data);
    setLoading(false);
  };

  // Test chat config loader/handlers (Task 11-b). The chat ID lives in the
  // Setting table under key "testChatId" — fetched/written via the
  // /api/settings/test-chat endpoint so we don't have to expose the full
  // settings map.
  const loadTestChat = async () => {
    setTestChatLoading(true);
    const { data, error } = await apiFetch<{ testChatId: string | null }>("/api/settings/test-chat");
    if (error) {
      // Don't toast on every page load — just log; the empty card is fine.
      console.warn("[test-chat] failed to load:", error);
    } else if (data) {
      setTestChatId(data.testChatId);
      setTestChatInput(data.testChatId ?? "");
    }
    setTestChatLoading(false);
  };

  const saveTestChat = async () => {
    const trimmed = testChatInput.trim();
    if (!trimmed) {
      toast.error(t("settings.testChat.noChatId"));
      return;
    }
    setTestChatSaving(true);
    const { error } = await apiFetch("/api/settings/test-chat", {
      method: "POST",
      body: JSON.stringify({ chatId: trimmed }),
    });
    setTestChatSaving(false);
    if (error) {
      toast.error(error);
      return;
    }
    setTestChatId(trimmed);
    toast.success(t("settings.testChat.saved"));
  };

  const clearTestChat = async () => {
    setTestChatSaving(true);
    const { error } = await apiFetch("/api/settings/test-chat", { method: "DELETE" });
    setTestChatSaving(false);
    if (error) {
      toast.error(error);
      return;
    }
    setTestChatId(null);
    setTestChatInput("");
    toast.success(t("settings.testChat.cleared"));
  };

  // Sends a tiny test message to the configured test chat ID via the
  // existing /api/scheduled/test endpoint (Task 8-b) — the chat ID is read
  // server-side from the Setting so we don't have to send it explicitly.
  const sendTestMessageToChat = async () => {
    const chatId = (testChatInput.trim() || testChatId || "").trim();
    if (!chatId) {
      toast.error(t("settings.testChat.noChatId"));
      return;
    }
    setTestChatSending(true);
    const { data, error } = await apiFetch<{ ok: boolean; error?: string; messageId?: number | null }>(
      "/api/scheduled/test",
      {
        method: "POST",
        body: JSON.stringify({
          text: "🧪 Test message from the Telegram Bot Admin Panel — your test chat is configured correctly.",
          format: "markdown",
          chatId,
        }),
      },
    );
    setTestChatSending(false);
    if (error) {
      // 400 with "Bot token not configured" → friendly red toast.
      toast.error(error === "Bot token not configured. Set it in Settings first." ? t("settings.testChat.tokenMissing") : error);
      return;
    }
    if (!data?.ok) {
      toast.error(data?.error || t("settings.testChat.sendFailed"));
      return;
    }
    toast.success(t("settings.testChat.sendSuccess"));
  };

  useEffect(() => {
    const run = async () => {
      await load();
      await loadTwoFactor();
      await loadTestChat();
    };
    run();
  }, []);

  const save = async () => {
    if (!token.trim()) {
      toast.error("Enter a bot token first");
      return;
    }
    setSaving(true);
    const { error } = await apiFetch("/api/settings", {
      method: "PUT",
      body: JSON.stringify({ botToken: token.trim() }),
    });
    setSaving(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Bot token saved");
    setToken("");
    setBotInfo(null);
    load();
  };

  const test = async () => {
    setTesting(true);
    setBotInfo(null);
    setTestError(null);
    const body = token.trim() ? { token: token.trim() } : {};
    const { data, error } = await apiFetch<{ ok: boolean; me?: BotInfo; error?: string }>(
      "/api/settings/test",
      { method: "POST", body: JSON.stringify(body) },
    );
    setTesting(false);
    if (error || !data?.ok) {
      setTestError(error || data?.error || "Invalid token");
      toast.error(error || data?.error || "Invalid token");
      return;
    }
    setBotInfo(data.me || null);
    toast.success(`Connected as @${data.me?.username}`);
  };

  const savePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error(t("settings.passwordMismatch"));
      return;
    }
    if (newPassword.length < 4) {
      toast.error(t("settings.passwordTooShort"));
      return;
    }
    setSavingPassword(true);
    const { error } = await apiFetch("/api/auth/password", {
      method: "POST",
      body: JSON.stringify({ next: newPassword }),
    });
    setSavingPassword(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(t("settings.passwordChanged"));
    setNewPassword("");
    setConfirmPassword("");
    // Force re-login by reloading — the cookie was invalidated by the password change.
    setTimeout(() => window.location.reload(), 1200);
  };

  const focusPasswordForm = () => {
    passwordCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    // Briefly focus the new-password input for keyboard users.
    const input = passwordCardRef.current?.querySelector<HTMLInputElement>("#new-password");
    input?.focus({ preventScroll: true });
  };

  // The tooltip shows the full token value: whatever the admin is currently
  // typing, falling back to the stored preview. This makes truncation in the
  // input non-destructive — you can always hover to verify the full value.
  const tokenTooltipText = token.trim() || data?.tokenPreview || "";

  const sectionMotion = (delay: number) => ({
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { delay, duration: 0.3, ease: "easeOut" as const },
  });

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight text-balance">Settings</h2>
        <p className="text-[15px] text-muted-foreground/90">
          Configure the Telegram bot token and panel security.
        </p>
      </div>

      {/* Bot token card */}
      <motion.div {...sectionMotion(0)}>
        <Card className={
          "card-hover-lift overflow-hidden " +
          (data?.hasToken
            ? "bg-gradient-to-br from-emerald-50/60 via-card to-card dark:from-emerald-950/20 dark:via-card dark:to-card"
            : "")
        }>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
              <KeyRound className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="break-words">Bot token</span>
              {data?.hasToken && (
                <Badge
                  variant="outline"
                  className="ml-auto gap-1.5 bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-700 shrink-0"
                >
                  <span className="status-dot mr-0.5" />
                  Connected
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Get it from <span className="font-mono">@BotFather</span>. Stored locally in the database.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <Skeleton className="h-10 rounded-lg" />
            ) : (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  {data?.hasToken ? (
                    <Badge variant="outline" className="badge-soft-emerald shrink-0">
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Token set
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="badge-soft-amber shrink-0">
                      <XCircle className="h-3 w-3 mr-1" /> No token
                    </Badge>
                  )}
                  {data?.tokenPreview && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="text-xs text-muted-foreground font-mono min-w-0 truncate hover:text-foreground transition-colors cursor-help flex-1"
                          title=""
                        >
                          {data.tokenPreview}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-sm break-all font-mono text-[11px]">
                        {data.tokenPreview}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="token" className="block">{data?.hasToken ? "Replace token" : "Enter bot token"}</Label>
                  <div className="flex gap-2 max-w-lg">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex-1 min-w-0">
                          <Input
                            id="token"
                            type={showToken ? "text" : "password"}
                            placeholder="123456789:ABCdef…"
                            value={token}
                            onChange={(e) => setToken(e.target.value)}
                            className="font-mono truncate focus-visible:ring-2 focus-visible:ring-ring"
                          />
                        </div>
                      </TooltipTrigger>
                      {tokenTooltipText ? (
                        <TooltipContent side="bottom" className="max-w-sm break-all font-mono text-[11px]">
                          {tokenTooltipText}
                        </TooltipContent>
                      ) : null}
                    </Tooltip>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setShowToken((s) => !s)}
                      className="shrink-0 focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={showToken ? t("settings.tokenHideFull") : t("settings.tokenShowFull")}
                      title={showToken ? t("settings.tokenHideFull") : t("settings.tokenShowFull")}
                    >
                      {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={save} disabled={saving} className="focus-visible:ring-2 focus-visible:ring-ring">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save token
                  </Button>
                  <Button variant="outline" onClick={test} disabled={testing} className="focus-visible:ring-2 focus-visible:ring-ring">
                    {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
                    Test connection
                  </Button>
                  <Button variant="ghost" onClick={load} className="focus-visible:ring-2 focus-visible:ring-ring">
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {(botInfo || testError) && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="card-hover-lift">
            <CardContent className="p-5">
              {botInfo ? (
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 flex items-center justify-center">
                    <Bot className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{botInfo.first_name}</p>
                      <Badge variant="outline" className="text-xs">@{botInfo.username}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Bot ID: {botInfo.id}</p>
                  </div>
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 dark:text-emerald-400 ml-auto" />
                </div>
              ) : (
                <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
                  <XCircle className="h-5 w-5" />
                  <p className="text-sm">{testError}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Test chat card (Task 11-b) — default chat ID for "Send test" actions.
          Wrapped in data-11b-test-chat so 11-a's restyle pass can locate this
          insertion point without touching the rest of the file. */}
      <div data-11b-test-chat>
        <motion.div {...sectionMotion(0.08)}>
          <Card className="card-hover-lift">
            <CardHeader>
              <CardTitle className="text-base flex flex-wrap items-center gap-2">
                <MessageSquare className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />{" "}
                <span className="break-words min-w-0">{t("settings.testChat.title")}</span>
                {testChatId && !testChatLoading ? (
                  <Badge
                    variant="outline"
                    className="ml-auto shrink-0 gap-1.5 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    {t("settings.testChat.configured")}
                  </Badge>
                ) : !testChatLoading ? (
                  <Badge
                    variant="outline"
                    className="ml-auto shrink-0 gap-1.5 bg-zinc-50 text-zinc-600 border-zinc-200 dark:bg-zinc-900/40 dark:text-zinc-400 dark:border-zinc-800"
                  >
                    <XCircle className="h-3 w-3" />
                    {t("settings.testChat.notConfigured")}
                  </Badge>
                ) : null}
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">{t("settings.testChat.description")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {testChatLoading ? (
                <Skeleton className="h-10 rounded-lg" />
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="test-chat-id" className="text-xs sm:text-sm">{t("settings.testChat.label")}</Label>
                    <Input
                      id="test-chat-id"
                      placeholder={t("settings.testChat.placeholder")}
                      value={testChatInput}
                      onChange={(e) => setTestChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveTestChat();
                      }}
                      className="font-mono w-full sm:max-w-md text-xs sm:text-sm"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={saveTestChat}
                      disabled={testChatSaving || !testChatInput.trim()}
                      className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white border-emerald-500"
                    >
                      {testChatSaving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      {testChatSaving ? t("settings.testChat.saving") : t("settings.testChat.save")}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={sendTestMessageToChat}
                      disabled={testChatSending || !testChatInput.trim()}
                      className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
                    >
                      {testChatSending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      {testChatSending
                        ? t("settings.testChat.sending")
                        : t("settings.testChat.sendTest")}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={clearTestChat}
                      disabled={testChatSaving || !testChatId}
                      className="text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                    >
                      {testChatSaving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Eraser className="h-4 w-4" />
                      )}
                      {t("settings.testChat.clear")}
                    </Button>
                  </div>
                  <p className="text-[11px] sm:text-xs leading-relaxed text-muted-foreground">
                    Tip: use a private chat with the bot (your own user ID) or a small test channel.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Panel security card */}
      <motion.div ref={passwordCardRef} {...sectionMotion(0.1)}>
        <Card className="card-hover-lift">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
              <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="break-words">{t("settings.panelSecurity")}</span>
              {/* Password strength indicator — higher-contrast rose/emerald palette */}
              {data && !loading && (
                data.isDefaultPassword ? (
                  <Badge
                    variant="outline"
                    className="ml-auto gap-1 badge-soft-rose shrink-0"
                  >
                    <ShieldAlert className="h-3 w-3" /> Weak
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="ml-auto gap-1 badge-soft-emerald shrink-0"
                  >
                    <ShieldCheck className="h-3 w-3" /> Strong
                  </Badge>
                )
              )}
            </CardTitle>
            <CardDescription>{t("settings.panelSecurityDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {loading ? (
              <Skeleton className="h-10 rounded-lg" />
            ) : (
              <>
                {/* Status badge — larger pill with icon, wrap-friendly on mobile */}
                <div className="flex items-center gap-3 flex-wrap">
                  {data?.isDefaultPassword ? (
                    <Badge
                      variant="outline"
                      className="px-3 py-1 text-xs font-semibold gap-1.5 badge-soft-amber shrink-0"
                    >
                      <ShieldAlert className="h-3.5 w-3.5" /> Default password in use
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="px-3 py-1 text-xs font-semibold gap-1.5 badge-soft-emerald shrink-0"
                    >
                      <Lock className="h-3.5 w-3.5" /> {t("settings.sessionActive")}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground min-w-0">{t("settings.securityNote")}</span>
                </div>

                {/* Stronger default-password warning with left accent border + CTA.
                    Shows whenever the panel is still using the default password,
                    not just when no password is configured. */}
                {data?.isDefaultPassword && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-lg border border-amber-200 border-l-4 border-l-amber-400 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 dark:border-l-amber-500 p-4 text-sm text-amber-900 dark:text-amber-100 space-y-2.5"
                  >
                    <div className="flex items-start gap-2">
                      <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0 text-amber-700 dark:text-amber-300" />
                      <p className="leading-relaxed text-xs sm:text-sm">{t("settings.security.isDefaultWarning")}</p>
                    </div>
                    <Button
                      size="sm"
                      onClick={focusPasswordForm}
                      className="h-8 gap-1.5 bg-amber-600 hover:bg-amber-700 text-white border-amber-600 focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                      {t("settings.security.changeNow")}
                    </Button>
                  </motion.div>
                )}

                {/* Password-change form with better field spacing — stacks on mobile */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-password">{t("settings.newPassword")}</Label>
                    <div className="relative">
                      <Input
                        id="new-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="pr-10 focus-visible:ring-2 focus-visible:ring-ring"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent flex items-center justify-center transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                        tabIndex={-1}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">{t("settings.confirmPassword")}</Label>
                    <Input
                      id="confirm-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <Button onClick={savePassword} disabled={savingPassword || !newPassword} className="focus-visible:ring-2 focus-visible:ring-ring">
                    {savingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                    {t("settings.changePassword")}
                  </Button>
                  {newPassword && newPassword !== confirmPassword && (
                    <span className="text-xs text-rose-600 dark:text-rose-400">{t("settings.passwordMismatch")}</span>
                  )}
                </div>
                <p className="text-[11px] sm:text-xs text-muted-foreground leading-relaxed">
                  Changing the password immediately signs out all other devices and ends this session.
                </p>

                {/* Security tips collapsible section */}
                <div className="border-t border-border/60 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowSecurityTips((v) => !v)}
                    className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full text-start"
                    aria-expanded={showSecurityTips}
                  >
                    <Lightbulb className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    Security tips
                    {showSecurityTips ? (
                      <ChevronUp className="h-3.5 w-3.5 ml-auto" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 ml-auto" />
                    )}
                  </button>
                  <AnimatePresence initial={false}>
                    {showSecurityTips && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="overflow-hidden"
                      >
                        <ul className="mt-3 space-y-2 text-sm text-muted-foreground pl-6 list-disc marker:text-emerald-500 dark:marker:text-emerald-400">
                          <li>Change the default password immediately after first login.</li>
                          <li>Use a strong, unique password that you don&apos;t use elsewhere.</li>
                          <li>Revoke unused sessions regularly to prevent unauthorized access.</li>
                        </ul>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Two-factor authentication card */}
      <motion.div {...sectionMotion(0.11)}>
        <Card className="card-hover-lift">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
              <Smartphone className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="break-words">{t("settings.2fa.title")}</span>
              {twoFactor && !twoFactorLoading && (
                twoFactor.enabled ? (
                  <Badge variant="outline" className="ml-auto gap-1 badge-soft-emerald shrink-0">
                    <ShieldCheck className="h-3 w-3" /> {t("settings.2fa.enabled")}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="ml-auto gap-1 badge-soft-amber shrink-0">
                    <ShieldAlert className="h-3 w-3" /> {t("settings.2fa.notEnabled")}
                  </Badge>
                )
              )}
            </CardTitle>
            <CardDescription>{t("settings.2fa.subtitle")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {twoFactorLoading ? (
              <Skeleton className="h-10 rounded-lg" />
            ) : twoFactor?.enabled ? (
              <>
                <div className="flex items-center gap-3 flex-wrap">
                  <Badge
                    variant="outline"
                    className="px-3 py-1 text-xs font-semibold gap-1.5 badge-soft-emerald shrink-0"
                  >
                    <Key className="h-3.5 w-3.5" /> {t("settings.2fa.backupRemaining")}: {twoFactor.backupCodesRemaining}/8
                  </Badge>
                  <span className="text-xs text-muted-foreground min-w-0">
                    Future sign-ins require a TOTP code or backup code.
                  </span>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setDisableOpen(true)}
                  className="text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-900 hover:bg-rose-50 dark:hover:bg-rose-950/30 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ShieldAlert className="h-4 w-4" />
                  {t("settings.2fa.disable")}
                </Button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-muted-foreground min-w-0">
                    Add a second factor (Google Authenticator, Authy, 1Password) so a stolen password alone can&apos;t access the panel.
                  </span>
                </div>
                <Button
                  onClick={() => setSetupOpen(true)}
                  className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ShieldCheck className="h-4 w-4" />
                  {t("settings.2fa.enable")}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Active sessions card — shows every signed-in device and lets the
          admin revoke individual sessions or all others. Lives just below
          the panel-security card so the auth-related controls are grouped. */}
      <motion.div {...sectionMotion(0.12)}>
        <ActiveSessions />
      </motion.div>

      {/* How scheduling works card */}
      <motion.div {...sectionMotion(0.15)}>
        <Card className="card-hover-lift">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Bot className="h-4 w-4 text-teal-600 dark:text-teal-400" /> How scheduling works
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>• Scheduled messages are stored in the database with a fire time and optional repeat.</p>
            <p>• A background poller (running while this panel is open) calls the runner every 30 seconds.</p>
            <p>• You can also press <strong>Run now</strong> on the Scheduled tab to process due messages immediately.</p>
            <p>• Each delivery is logged per channel — successful or failed — and shown in the activity feed.</p>
            <p>• Use <code className="font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-1 rounded">{`{{channel}}`}</code>, <code className="font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-1 rounded">{`{{date}}`}</code>, <code className="font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-1 rounded">{`{{time}}`}</code> in your message for per-channel personalization.</p>
          </CardContent>
        </Card>
      </motion.div>

      {/* 2FA setup dialog — 3-step wizard (QR → verify → backup codes) */}
      <TwoFactorSetup
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        onEnabled={() => {
          setSetupOpen(false);
          loadTwoFactor();
        }}
      />

      {/* 2FA disable dialog — requires re-entering the panel password */}
      <Dialog open={disableOpen} onOpenChange={(o) => {
        setDisableOpen(o);
        if (!o) setDisablePassword("");
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="h-4 w-4 text-rose-600 dark:text-rose-400" />
              {t("settings.2fa.disable")}
            </DialogTitle>
            <DialogDescription>{t("settings.2fa.disableConfirm")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="disable-2fa-password" className="flex items-center gap-1.5 text-sm font-medium">
                <Lock className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                {t("settings.2fa.password")}
              </Label>
              <Input
                id="disable-2fa-password"
                type="password"
                placeholder="••••••••"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") disable2FA();
                }}
                className="font-mono"
                autoComplete="current-password"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDisableOpen(false)}>
                {t("action.cancel")}
              </Button>
              <Button
                onClick={disable2FA}
                disabled={disabling || !disablePassword}
                className="bg-rose-600 hover:bg-rose-700 text-white border-rose-600"
              >
                {disabling ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldAlert className="h-4 w-4" />
                )}
                {t("settings.2fa.disable")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
