"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  LayoutDashboard,
  CalendarClock,
  Megaphone,
  Radio,
  Users,
  Settings as SettingsIcon,
  Send,
  Menu,
  X,
  Bot,
  Github,
  FileText,
  Search,
  Command,
  BarChart3,
  History,
  Sun,
  Moon,
  Keyboard,
  LogOut,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dashboard } from "@/components/admin/dashboard";
import { Scheduled } from "@/components/admin/scheduled";
import { Broadcast } from "@/components/admin/broadcast";
import { Channels } from "@/components/admin/channels";
import { Admins } from "@/components/admin/admins";
import { Settings } from "@/components/admin/settings";
import { Templates } from "@/components/admin/templates";
import { Analytics } from "@/components/admin/analytics";
import { ActivityLog } from "@/components/admin/activity-log";
import { CommandPalette } from "@/components/admin/command-palette";
import { ShortcutsHelp } from "@/components/admin/shortcuts-help";
import { NotificationCenter } from "@/components/admin/notification-center";
import { LanguageToggle } from "@/components/admin/language-toggle";
import { LoginScreen } from "@/components/admin/login-screen";
import { TelegramWebAppBadge } from "@/components/telegram-webapp";
import { useI18n } from "@/lib/i18n";
import { apiFetch } from "@/components/admin/shared";

type Tab = "dashboard" | "scheduled" | "broadcast" | "templates" | "channels" | "admins" | "analytics" | "activity" | "settings";

const NAV: { id: Tab; labelKey: string; icon: typeof LayoutDashboard; desc: string; group: string }[] = [
  { id: "dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard, desc: "Overview & analytics", group: "Overview" },
  { id: "analytics", labelKey: "nav.analytics", icon: BarChart3, desc: "Deep dive metrics", group: "Overview" },
  { id: "activity", labelKey: "nav.activity", icon: History, desc: "Audit trail", group: "Overview" },
  { id: "scheduled", labelKey: "nav.scheduled", icon: CalendarClock, desc: "Plan & automate broadcasts", group: "Messaging" },
  { id: "broadcast", labelKey: "nav.broadcast", icon: Megaphone, desc: "Send a message now", group: "Messaging" },
  { id: "templates", labelKey: "nav.templates", icon: FileText, desc: "Reusable message presets", group: "Messaging" },
  { id: "channels", labelKey: "nav.channels", icon: Radio, desc: "Manage target chats", group: "Config" },
  { id: "admins", labelKey: "nav.admins", icon: Users, desc: "Bot operators", group: "Config" },
  { id: "settings", labelKey: "nav.settings", icon: SettingsIcon, desc: "Bot token & config", group: "Config" },
];

export default function Home() {
  // Authentication state: "loading" | "authed" | "unauthed"
  const [authState, setAuthState] = useState<"loading" | "authed" | "unauthed">("loading");
  const [sessionExpiresAt, setSessionExpiresAt] = useState<number | null>(null);

  // Check session on mount and periodically.
  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated) {
          setAuthState("authed");
          setSessionExpiresAt(data.expiresAt ?? null);
          return;
        }
      }
      setAuthState("unauthed");
    } catch {
      setAuthState("unauthed");
    }
  }, []);

  useEffect(() => {
    let active = true;
    const run = async () => {
      await checkAuth();
      if (!active) return;
    };
    run();
    const id = setInterval(run, 60000); // refresh session status every minute
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [checkAuth]);

  // Show login screen if not authenticated.
  if (authState === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-md">
            <Loader2 className="h-6 w-6 text-white animate-spin" />
          </div>
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      </div>
    );
  }

  if (authState === "unauthed") {
    return <LoginScreen onSuccess={() => setAuthState("authed")} />;
  }

  return (
    <Panel
      sessionExpiresAt={sessionExpiresAt}
      onLogout={async () => {
        try {
          await fetch("/api/auth/logout", { method: "POST" });
        } catch {
          /* ignore */
        }
        setAuthState("unauthed");
        setSessionExpiresAt(null);
      }}
    />
  );
}

function Panel({
  sessionExpiresAt,
  onLogout,
}: {
  sessionExpiresAt: number | null;
  onLogout: () => void | Promise<void>;
}) {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [tokenStatus, setTokenStatus] = useState<"loading" | "ok" | "none">("loading");
  const [lastRun, setLastRun] = useState<string | null>(null);
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  // Track the first key of a 2-key sequence (e.g. "g" waiting for "d").
  const sequenceKey = useRef<string | null>(null);
  const sequenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    const set = () => {
      if (active) setMounted(true);
    };
    // Defer to next tick to avoid synchronous setState in effect body.
    const id = setTimeout(set, 0);
    return () => {
      active = false;
      clearTimeout(id);
    };
  }, []);

  // Cmd+K / Ctrl+K to open command palette, "?" for shortcuts, plus "g + x" navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip if user is typing in an input/textarea/select/contentEditable
      const target = e.target as HTMLElement;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;

      // Cmd/Ctrl+K — always works
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }

      // Shift+D — toggle theme (always works)
      if (e.shiftKey && (e.key === "D" || e.key === "d")) {
        e.preventDefault();
        setTheme(theme === "dark" ? "light" : "dark");
        return;
      }

      if (isTyping) return;

      // "?" — open shortcuts help
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }

      // Two-key sequences: g + <letter>
      if (e.key === "g" && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        sequenceKey.current = "g";
        if (sequenceTimer.current) clearTimeout(sequenceTimer.current);
        sequenceTimer.current = setTimeout(() => {
          sequenceKey.current = null;
        }, 800);
        return;
      }

      if (sequenceKey.current === "g") {
        sequenceKey.current = null;
        if (sequenceTimer.current) clearTimeout(sequenceTimer.current);
        const map: Record<string, Tab> = {
          d: "dashboard",
          s: "scheduled",
          b: "broadcast",
          t: "templates",
          c: "channels",
          a: "analytics",
          l: "activity",
          o: "settings",
        };
        const target = map[e.key.toLowerCase()];
        if (target) {
          e.preventDefault();
          setTab(target);
          setMobileNavOpen(false);
        }
        return;
      }

      // Single-key shortcuts (only when not typing)
      if (e.key === "n" && !e.shiftKey) {
        e.preventDefault();
        setTab("scheduled");
        setMobileNavOpen(false);
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [theme, setTheme]);

  // Check whether a bot token is configured (for the status pill in the topbar).
  useEffect(() => {
    let alive = true;
    const check = async () => {
      const { data } = await apiFetch<{ hasToken: boolean }>("/api/settings");
      if (alive) setTokenStatus(data?.hasToken ? "ok" : "none");
    };
    check();
    const i = setInterval(check, 30000);
    return () => {
      alive = false;
      clearInterval(i);
    };
  }, []);

  // Background scheduler poller — fires the runner every 30s while the panel is open.
  const tick = useCallback(async () => {
    const { data, error } = await apiFetch<{ processed: number }>(`/api/scheduled/run?t=${Date.now()}`, {
      method: "POST",
    });
    if (!error && data && data.processed > 0) {
      setLastRun(new Date().toLocaleTimeString());
    }
  }, []);

  useEffect(() => {
    const run = async () => {
      await tick();
    };
    run();
    const i = setInterval(run, 30000);
    return () => clearInterval(i);
  }, [tick]);

  const active = NAV.find((n) => n.id === tab)!;

  // Group nav items by section
  const navGroups = NAV.reduce((acc, item) => {
    const g = item.group ?? "Main";
    if (!acc[g]) acc[g] = [];
    acc[g].push(item);
    return acc;
  }, {} as Record<string, typeof NAV>);

  const groupLabelKey = (g: string) =>
    g === "Overview" ? "nav.group.overview" : g === "Messaging" ? "nav.group.messaging" : "nav.group.config";

  const navButton = (item: (typeof NAV)[number]) => {
    const Icon = item.icon;
    const activeItem = item.id === tab;
    return (
      <button
        key={item.id}
        onClick={() => {
          setTab(item.id);
          setMobileNavOpen(false);
        }}
        className={cn(
          "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm border-l-2 transition-all duration-200",
          activeItem
            ? "nav-item-active bg-emerald-500/10 border-emerald-500 text-emerald-700 dark:text-emerald-300 font-semibold shadow-sm"
            : "nav-item-inactive text-muted-foreground hover:bg-emerald-500/5 hover:text-foreground border-transparent font-normal hover:translate-x-0.5",
        )}
      >
        <Icon className={cn("h-4.5 w-4.5 shrink-0", activeItem ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground/60 group-hover:text-foreground")} />
        <span className="truncate">{t(item.labelKey)}</span>
        {item.id === "scheduled" && activeItem && (
          <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
        )}
      </button>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="flex flex-1">
        {/* Sidebar (desktop) */}
        <aside className="hidden lg:flex w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
          <SidebarHeader />
          <nav className="flex-1 space-y-4 px-3 py-4 overflow-y-auto scrollbar-thin">
            {Object.entries(navGroups).map(([group, items]) => (
              <div key={group}>
                <div className="flex items-center gap-2 px-3 pb-1.5 pt-2 my-2">
                  <span className="h-px flex-1 bg-sidebar-border/80" />
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">{t(groupLabelKey(group))}</p>
                  <span className="h-px flex-1 bg-sidebar-border/80" />
                </div>
                <div className="space-y-1">{items.map(navButton)}</div>
              </div>
            ))}
          </nav>
          <SidebarFooter tokenStatus={tokenStatus} lastRun={lastRun} />
        </aside>

        {/* Mobile nav drawer */}
        {mobileNavOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black/50" onClick={() => setMobileNavOpen(false)} />
            <aside className="absolute left-0 top-0 h-full w-72 bg-sidebar text-sidebar-foreground flex flex-col animate-in slide-in-from-left duration-200">
              <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
                <SidebarHeader compact />
                <Button variant="ghost" size="icon" className="text-sidebar-foreground" onClick={() => setMobileNavOpen(false)}>
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <nav className="flex-1 space-y-4 px-3 py-4 overflow-y-auto scrollbar-thin">
                {Object.entries(navGroups).map(([group, items]) => (
                  <div key={group}>
                    <div className="flex items-center gap-2 px-3 pb-1.5 pt-2 my-2">
                      <span className="h-px flex-1 bg-sidebar-border/80" />
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">{t(groupLabelKey(group))}</p>
                      <span className="h-px flex-1 bg-sidebar-border/80" />
                    </div>
                    <div className="space-y-1">{items.map(navButton)}</div>
                  </div>
                ))}
              </nav>
              <SidebarFooter tokenStatus={tokenStatus} lastRun={lastRun} />
            </aside>
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Topbar */}
          <header className="sticky top-0 z-30 glass border-b border-border/60">
            <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-2.5">
              <div className="flex items-center gap-3 min-w-0">
                <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileNavOpen(true)}>
                  <Menu className="h-5 w-5" />
                </Button>
                <div className="min-w-0">
                  <h1 className="text-base sm:text-lg font-semibold truncate flex items-center gap-2">
                    <active.icon className="h-4.5 w-4.5 text-emerald-600 hidden sm:block" />
                    {t(active.labelKey)}
                  </h1>
                  <p className="text-xs text-muted-foreground truncate hidden sm:block">{active.desc}</p>
                </div>
              </div>
              {/* Topbar buttons — gap-1 for tighter grouping, consistent h-9 w-9 on icon-only buttons */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setPaletteOpen(true)}
                  className="hidden sm:flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent transition-colors"
                >
                  <Search className="h-3.5 w-3.5" />
                  <span>{t("topbar.quickJump")}</span>
                  <kbd className="ml-2 flex items-center gap-0.5 rounded border border-border px-1 py-0.5 text-[10px] font-mono">
                    <Command className="h-2.5 w-2.5" />K
                  </kbd>
                </button>
                <button
                  onClick={() => setShortcutsOpen(true)}
                  className="h-9 w-9 rounded-lg border border-border bg-card hover:bg-accent flex items-center justify-center transition-colors hidden sm:flex"
                  title={t("topbar.keyboardShortcuts")}
                  aria-label={t("topbar.keyboardShortcuts")}
                >
                  <Keyboard className="h-4 w-4 text-muted-foreground" />
                </button>
                <NotificationCenter />
                <div className="hidden md:block"><TelegramWebAppBadge /></div>
                <LanguageToggle />
                <ThemeToggle mounted={mounted} theme={theme} setTheme={setTheme} />
                <TokenPill status={tokenStatus} />
                <a
                  href="https://core.telegram.org/bots/api"
                  target="_blank"
                  rel="noreferrer"
                  className="hidden sm:inline-flex"
                >
                  <Button variant="outline" size="sm">
                    <Github className="h-4 w-4" /> API docs
                  </Button>
                </a>
                <button
                  onClick={() => {
                    void onLogout();
                  }}
                  className="h-9 w-9 rounded-lg border border-border bg-card hover:bg-rose-50 hover:border-rose-200 hover:text-rose-600 dark:hover:bg-rose-950/40 flex items-center justify-center transition-colors"
                  title={t("login.logout")}
                  aria-label={t("login.logout")}
                >
                  <LogOut className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            </div>
          </header>

          {/* Section content */}
          <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">
            {tab === "dashboard" && <Dashboard onNavigate={(t) => setTab(t as Tab)} />}
            {tab === "scheduled" && <Scheduled />}
            {tab === "broadcast" && <Broadcast />}
            {tab === "templates" && <Templates />}
            {tab === "analytics" && <Analytics />}
            {tab === "activity" && <ActivityLog />}
            {tab === "channels" && <Channels />}
            {tab === "admins" && <Admins />}
            {tab === "settings" && <Settings />}
          </main>

          {/* Footer — sticky to bottom via mt-auto */}
          <footer className="mt-auto border-t border-border/60 bg-card/50">
            <div className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground/70 max-w-7xl w-full mx-auto">
              <p className="flex items-center gap-1.5 text-xs">
                <Bot className="h-3.5 w-3.5 text-emerald-600" />
                {t("app.footer")} <span className="text-muted-foreground/50 ml-1">v1.0</span>
              </p>
              <p className="flex items-center gap-3 text-xs">
                <span>{t("app.runner30s")}</span>
                {lastRun && <span>{t("app.lastFire")}: {lastRun}</span>}
              </p>
            </div>
          </footer>
        </div>
      </div>

      {/* Command palette */}
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onNavigate={(t) => setTab(t as Tab)}
        onShowShortcuts={() => {
          setPaletteOpen(false);
          setShortcutsOpen(true);
        }}
      />

      {/* Keyboard shortcuts help */}
      <ShortcutsHelp open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}

function SidebarHeader({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  return (
    <div className={cn("flex items-center gap-3 bg-mesh-emerald", compact ? "" : "px-5 py-5 border-b border-sidebar-border")}>
      <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-sm shrink-0">
        <Send className="h-4.5 w-4.5 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-sidebar-foreground truncate">{t("app.title")}</p>
        <p className="text-[11px] text-sidebar-foreground/60 truncate">{t("app.subtitle")}</p>
      </div>
    </div>
  );
}

function SidebarFooter({
  tokenStatus,
  lastRun,
}: {
  tokenStatus: "loading" | "ok" | "none";
  lastRun: string | null;
}) {
  const { t } = useI18n();
  return (
    <div className="border-t border-sidebar-border px-4 py-4 space-y-3">
      <div className="rounded-lg bg-sidebar-accent/60 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wide text-sidebar-foreground/60">{t("sidebar.runner")}</span>
          <Badge variant="outline" className="text-[10px] bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 mr-1 animate-pulse" /> {t("sidebar.live")}
          </Badge>
        </div>
        <p className="text-[11px] text-sidebar-foreground/70">
          {t("sidebar.runnerDesc")}
        </p>
        {lastRun && <p className="text-[10px] text-sidebar-foreground/50">{t("app.lastFire")}: {lastRun}</p>}
      </div>
      <div className="flex items-center justify-between text-[11px] text-sidebar-foreground/50">
        <span>{t("sidebar.token")}</span>
        {tokenStatus === "loading" ? (
          <Skeleton className="h-3 w-12" />
        ) : tokenStatus === "ok" ? (
          <span className="text-emerald-300">{t("sidebar.configured")}</span>
        ) : (
          <span className="text-amber-300">{t("sidebar.notSet")}</span>
        )}
      </div>
    </div>
  );
}

function TokenPill({ status }: { status: "loading" | "ok" | "none" }) {
  const { t } = useI18n();
  if (status === "loading") return <Skeleton className="h-7 w-28 rounded-full" />;
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 px-2 py-0.5",
        status === "ok"
          ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
          : "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-200 dark:border-rose-800",
      )}
    >
      {status === "ok" ? (
        <span className={cn("h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse")} />
      ) : (
        <AlertTriangle className="h-3 w-3 shrink-0" />
      )}
      {status === "ok" ? t("topbar.botConnected") : t("topbar.noToken")}
    </Badge>
  );
}

function ThemeToggle({
  mounted,
  theme,
  setTheme,
}: {
  mounted: boolean;
  theme: string | undefined;
  setTheme: (t: string) => void;
}) {
  if (!mounted) {
    return <Skeleton className="h-9 w-9 rounded-lg" />;
  }
  const isDark = theme === "dark";
  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="h-9 w-9 rounded-lg border border-border bg-card hover:bg-accent flex items-center justify-center transition-colors"
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label="Toggle theme"
    >
      {isDark ? (
        <Sun className="h-4 w-4 text-amber-500" />
      ) : (
        <Moon className="h-4 w-4 text-emerald-600" />
      )}
    </button>
  );
}
