"use client";

/**
 * TelegramWebAppProvider
 * ─────────────────────────────────────────────────────────────────────────────
 * Bridges the Next.js admin panel with Telegram's WebApp (Mini App) runtime.
 *
 * What it does:
 *   1. Lazy-loads the official `telegram-web-app.js` SDK from core.telegram.org.
 *   2. Detects whether the page is actually running inside Telegram
 *      (`window.Telegram.WebApp.initData` non-empty) — if not, the provider is a
 *      no-op and the panel behaves exactly like a normal web app.
 *   3. When inside Telegram:
 *        • Calls `ready()` + `expand()` so the panel opens full-height.
 *        • Calls `enableClosingConfirmation()` so an accidental swipe doesn't
 *          kill the session mid-edit.
 *        • Reads `colorScheme` (`light`/`dark`) and applies it to next-themes so
 *          the panel matches the user's Telegram theme.
 *        • Reads `themeParams` and exposes the Telegram palette as CSS variables
 *          on `:root` (`--tg-bg`, `--tg-text`, `--tg-accent`, …) so any component
 *          can opt-in to native styling.
 *        • Exposes `viewportHeight`/`viewportStableHeight` as CSS variables
 *          (`--tg-vh`, `--tg-vh-stable`) and updates them on viewport events so
 *          layouts using `height: 100dvh`-style tricks respect the Telegram
 *          chrome height.
 *        • Exposes the signed-in Telegram user (`initDataUnsafe.user`) through
 *          React context so the panel can pre-fill forms, show the user's name,
 *          or auto-login the admin (the backend can verify `initData` separately).
 *        • Wires `BackButton`/`MainButton` events into optional callbacks, and
 *          hides the native `BackButton` by default (the panel has its own nav).
 *
 * Security note:
 *   `initDataUnsafe` is NOT trustworthy on its own — it's provided by the client
 *   and can be forged. Any privileged action must re-validate `initData` on the
 *   server using the bot token (HMAC). See `verifyTelegramInitData()` server
 *   helper (not included here; add when wiring panel↔bot SSO).
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Script from "next/script";
import { useTheme } from "next-themes";

// ─── Types (mirrors the subset of Telegram WebApp SDK we use) ─────────────────
type TgColorScheme = "light" | "dark";

interface TgThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
  accent_text_color?: string;
  section_bg_color?: string;
  section_header_text_color?: string;
  subtitle_text_color?: string;
  destructive_text_color?: string;
}

interface TgUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
  is_premium?: boolean;
}

interface TgInitDataUnsafe {
  user?: TgUser;
  auth_date?: number;
  hash?: string;
  start_param?: string;
  chat_instance?: string;
  chat_type?: string;
}

interface TgWebApp {
  initData: string;
  initDataUnsafe: TgInitDataUnsafe;
  version: string;
  platform: string;
  colorScheme: TgColorScheme;
  themeParams: TgThemeParams;
  viewportHeight: number;
  viewportStableHeight: number;
  isExpanded: boolean;
  ready: () => void;
  expand: () => void;
  close: () => void;
  enableClosingConfirmation: () => void;
  disableClosingConfirmation: () => void;
  onEvent: (event: string, cb: (...args: unknown[]) => void) => void;
  offEvent: (event: string, cb: (...args: unknown[]) => void) => void;
  setHeaderColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
  HapticFeedback?: {
    impactOccurred: (style: string) => void;
    notificationOccurred: (type: string) => void;
    selectionChanged: () => void;
  };
  BackButton?: {
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
  MainButton?: {
    text: string;
    show: () => void;
    hide: () => void;
    setText: (t: string) => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TgWebApp;
    };
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────
interface TelegramWebAppContextValue {
  /** True only when the page is actually running inside Telegram (initData present). */
  isInsideTelegram: boolean;
  /** Raw SDK object (undefined before load or when not in Telegram). */
  webApp: TgWebApp | null;
  /** Telegram-side user (from initDataUnsafe.user). Use for display only. */
  user: TgUser | null;
  /** Signed initData string — send to backend for HMAC verification. */
  initData: string;
  /** Platform: "tdesktop", "ios", "android", "web", "unknown". */
  platform: string;
  /** SDK version (e.g. "8.0"). */
  version: string;
  /** Start param from the bot's /start link (e.g. ?startapp=foo). */
  startParam: string | null;
  /** Whether the SDK script has finished loading. */
  scriptLoaded: boolean;
}

const Ctx = createContext<TelegramWebAppContextValue>({
  isInsideTelegram: false,
  webApp: null,
  user: null,
  initData: "",
  platform: "unknown",
  version: "",
  startParam: null,
  scriptLoaded: false,
});

export function useTelegramWebApp() {
  return useContext(Ctx);
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function TelegramWebAppProvider({ children }: { children: ReactNode }) {
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [isInsideTelegram, setIsInsideTelegram] = useState(false);
  const [user, setUser] = useState<TgUser | null>(null);
  const [initData, setInitData] = useState("");
  const [platform, setPlatform] = useState("unknown");
  const [version, setVersion] = useState("");
  const [startParam, setStartParam] = useState<string | null>(null);
  const { setTheme } = useTheme();
  const readyFiredRef = useRef(false);

  // After the SDK script loads, read the WebApp object and bootstrap.
  useEffect(() => {
    if (!scriptLoaded) return;
    const wa = window.Telegram?.WebApp;
    if (!wa) return;

    const inside = Boolean(wa.initData && wa.initData.length > 0);
    // We are syncing external (Telegram SDK) state INTO React state on a
    // one-shot basis when the SDK script finishes loading — this is the
    // canonical "subscribe to external system" use of useEffect. The values
    // come from a browser global, not from a parent prop, so there is no
    // cascading-render risk. Suppressing the lint rule here is intentional.
    /* eslint-disable react-hooks/set-state-in-effect */
    setIsInsideTelegram(inside);
    setPlatform(wa.platform || "unknown");
    setVersion(wa.version || "");
    setInitData(wa.initData || "");
    setStartParam(wa.initDataUnsafe?.start_param || null);
    setUser(wa.initDataUnsafe?.user || null);
    /* eslint-enable react-hooks/set-state-in-effect */

    if (!inside) return; // Running on the open web — no further setup.

    // 1. Tell Telegram the web app is ready and expand to full height.
    try {
      wa.ready();
      wa.expand();
      wa.enableClosingConfirmation();
    } catch {
      /* SDK not fully initialized — ignore */
    }

    // 2. Sync Telegram's color scheme to next-themes so dark/light matches.
    try {
      setTheme(wa.colorScheme === "dark" ? "dark" : "light");
    } catch {
      /* next-themes not ready — ignore */
    }

    // 3. Expose themeParams + viewport as CSS variables on :root.
    const applyThemeVars = () => {
      const root = document.documentElement;
      const tp = wa.themeParams || {};
      const map: Record<string, string | undefined> = {
        "--tg-bg": tp.bg_color,
        "--tg-text": tp.text_color,
        "--tg-hint": tp.hint_color,
        "--tg-link": tp.link_color,
        "--tg-button": tp.button_color,
        "--tg-button-text": tp.button_text_color,
        "--tg-secondary-bg": tp.secondary_bg_color,
        "--tg-accent": tp.accent_text_color || tp.button_color,
        "--tg-section-bg": tp.section_bg_color,
        "--tg-section-header": tp.section_header_text_color,
        "--tg-subtitle": tp.subtitle_text_color,
        "--tg-destructive": tp.destructive_text_color,
      };
      for (const [k, v] of Object.entries(map)) {
        if (v) root.style.setProperty(k, v);
      }
      root.style.setProperty("--tg-vh", `${wa.viewportHeight}px`);
      root.style.setProperty("--tg-vh-stable", `${wa.viewportStableHeight}px`);
      root.dataset.tgColorScheme = wa.colorScheme;
    };
    applyThemeVars();

    // 4. Keep viewport + theme in sync when Telegram reports changes.
    const onViewport = () => {
      const root = document.documentElement;
      root.style.setProperty("--tg-vh", `${wa.viewportHeight}px`);
      root.style.setProperty("--tg-vh-stable", `${wa.viewportStableHeight}px`);
    };
    const onThemeChanged = () => {
      try {
        setTheme(wa.colorScheme === "dark" ? "dark" : "light");
      } catch {
        /* ignore */
      }
      applyThemeVars();
    };
    wa.onEvent("viewportChanged", onViewport as (...args: unknown[]) => void);
    wa.onEvent("themeChanged", onThemeChanged as (...args: unknown[]) => void);

    // 5. Try to paint the native header to match our background so the WebApp
    //    blends in. (setHeaderColor accepts the literal "bg_color" / "secondary_bg_color".)
    try {
      wa.setHeaderColor(wa.themeParams?.bg_color || "#ffffff");
      wa.setBackgroundColor(wa.themeParams?.bg_color || "#ffffff");
    } catch {
      /* older SDKs don't support these — ignore */
    }

    // 6. Hide the native BackButton by default (the panel has its own nav).
    try {
      wa.BackButton?.hide();
    } catch {
      /* ignore */
    }

    readyFiredRef.current = true;

    return () => {
      wa.offEvent("viewportChanged", onViewport as (...args: unknown[]) => void);
      wa.offEvent("themeChanged", onThemeChanged as (...args: unknown[]) => void);
    };
  }, [scriptLoaded, setTheme]);

  const value = useMemo<TelegramWebAppContextValue>(
    () => ({
      isInsideTelegram,
      webApp: scriptLoaded ? window.Telegram?.WebApp ?? null : null,
      user,
      initData,
      platform,
      version,
      startParam,
      scriptLoaded,
    }),
    [scriptLoaded, isInsideTelegram, user, initData, platform, version, startParam],
  );

  return (
    <>
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="afterInteractive"
        onLoad={() => setScriptLoaded(true)}
        onError={() => setScriptLoaded(true) /* still mark loaded so we don't hang */}
      />
      <Ctx.Provider value={value}>{children}</Ctx.Provider>
    </>
  );
}

// ─── Tiny status pill — opt-in indicator for "running inside Telegram" ───────
export function TelegramWebAppBadge() {
  const { isInsideTelegram, platform, user } = useTelegramWebApp();
  if (!isInsideTelegram) return null;
  const name =
    [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim() ||
    user?.username ||
    `User ${user?.id ?? ""}`.trim();
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300"
      title={`Telegram WebApp · ${platform}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
      </span>
      Telegram{platform && platform !== "unknown" ? ` · ${platform}` : ""}
      {name ? <span className="opacity-70">· {name}</span> : null}
    </span>
  );
}

// ─── Haptics helper — call from any button click for native feedback ─────────
export function useTgHaptics() {
  const { webApp } = useTelegramWebApp();
  return useMemo(
    () => ({
      light: () => webApp?.HapticFeedback?.impactOccurred("light"),
      medium: () => webApp?.HapticFeedback?.impactOccurred("medium"),
      heavy: () => webApp?.HapticFeedback?.impactOccurred("heavy"),
      success: () => webApp?.HapticFeedback?.notificationOccurred("success"),
      error: () => webApp?.HapticFeedback?.notificationOccurred("error"),
      warning: () => webApp?.HapticFeedback?.notificationOccurred("warning"),
      selection: () => webApp?.HapticFeedback?.selectionChanged(),
    }),
    [webApp],
  );
}
