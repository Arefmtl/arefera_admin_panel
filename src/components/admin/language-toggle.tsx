"use client";

/**
 * Language Toggle — switch between EN (English, LTR) and FA (Persian, RTL).
 *
 * Shows a globe icon with a small badge indicating the current locale.
 * Clicking it toggles between the two languages.
 */

import { Languages, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useI18n, type Locale } from "@/lib/i18n";

const OPTIONS: { code: Locale; label: string; native: string; flag: string }[] = [
  { code: "en", label: "English", native: "English", flag: "🇬🇧" },
  { code: "fa", label: "Persian", native: "فارسی", flag: "🇮🇷" },
];

export function LanguageToggle() {
  const { locale, setLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const current = OPTIONS.find((o) => o.code === locale) || OPTIONS[0];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "h-9 px-2 rounded-lg border border-border bg-card hover:bg-accent flex items-center gap-1.5 transition-colors text-xs font-medium",
          open && "bg-accent ring-2 ring-emerald-500/30",
        )}
        title="Change language"
        aria-label="Change language"
      >
        <Languages className="h-4 w-4 text-muted-foreground" />
        <span className="hidden sm:inline">{current.flag}</span>
        <span className="uppercase text-[10px] font-bold tracking-wide">{locale}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-44 rounded-xl border border-border bg-card shadow-2xl z-50 overflow-hidden"
          >
            <div className="p-2 border-b border-border bg-gradient-to-r from-emerald-50/50 to-teal-50/50 dark:from-emerald-950/30 dark:to-teal-950/30">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Language / زبان
              </p>
            </div>
            <ul className="p-1">
              {OPTIONS.map((opt) => {
                const isActive = opt.code === locale;
                return (
                  <li key={opt.code}>
                    <button
                      onClick={() => {
                        setLocale(opt.code);
                        setOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors",
                        isActive
                          ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300"
                          : "hover:bg-accent",
                      )}
                    >
                      <span className="text-base leading-none">{opt.flag}</span>
                      <div className="flex-1 text-left">
                        <p className="font-medium leading-tight">{opt.native}</p>
                        <p className="text-[10px] text-muted-foreground">{opt.label}</p>
                      </div>
                      {isActive && <Check className="h-4 w-4 text-emerald-500 shrink-0" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
