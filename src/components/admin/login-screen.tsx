"use client";

import { useState, useEffect, type FormEvent } from "react";
import { Send, Lock, Loader2, Eye, EyeOff, ShieldCheck, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n";
import { TwoFactorPrompt } from "./two-factor-prompt";

export function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  // 2FA state: when the server returns `requires2FA: true`, we render the
  // TwoFactorPrompt overlay instead of the password form. `tempToken` is the
  // short-lived HMAC-signed challenge returned by `/api/auth/login`.
  const [requires2FA, setRequires2FA] = useState(false);
  const [tempToken, setTempToken] = useState<string | null>(null);
  const { t } = useI18n();

  // Auto-focus the password input on mount.
  useEffect(() => {
    if (requires2FA) return;
    const id = setTimeout(() => {
      document.getElementById("panel-password")?.focus();
    }, 200);
    return () => clearTimeout(id);
  }, [requires2FA]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({ error: "Login failed" }));
      if (!res.ok) {
        // 2FA branch: the password was correct, but the panel requires a
        // second factor. Capture the tempToken and switch to the 2FA prompt.
        if (data?.requires2FA && typeof data.tempToken === "string") {
          setRequires2FA(true);
          setTempToken(data.tempToken);
          setLoading(false);
          return;
        }
        setError(data.error || "Login failed");
        setAttempts((a) => a + 1);
        setPassword("");
      } else {
        onSuccess();
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10 relative overflow-hidden bg-background">
      {/* Decorative animated gradient mesh background */}
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-24 h-96 w-96 rounded-full bg-emerald-400/20 blur-3xl animate-pulse" />
        <div className="absolute top-1/3 -right-24 h-96 w-96 rounded-full bg-teal-400/20 blur-3xl animate-pulse" style={{ animationDelay: "0.6s" }} />
        <div className="absolute -bottom-32 left-1/3 h-96 w-96 rounded-full bg-cyan-400/15 blur-3xl animate-pulse" style={{ animationDelay: "1.2s" }} />
        <div className="absolute inset-0 bg-grid opacity-[0.04]" />
      </div>

      <AnimatePresence mode="wait">
        {requires2FA && tempToken ? (
          <TwoFactorPrompt
            key="2fa"
            tempToken={tempToken}
            onSuccess={onSuccess}
            onBack={() => {
              setRequires2FA(false);
              setTempToken(null);
              setPassword("");
              setError(null);
            }}
          />
        ) : (
          <motion.div
            key="password"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="w-full max-w-md"
          >
            {/* Logo / brand */}
            <div className="flex flex-col items-center mb-8">
              <motion.div
                initial={{ scale: 0.8, rotate: -10 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ duration: 0.6, type: "spring", bounce: 0.5 }}
                className="h-16 w-16 rounded-2xl bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-emerald-500/30 mb-4"
              >
                <Send className="h-8 w-8 text-white" />
              </motion.div>
              <h1 className="text-2xl font-bold tracking-tight">{t("app.title")}</h1>
              <p className="text-sm text-muted-foreground mt-1">{t("login.subtitle")}</p>
            </div>

            {/* Login card */}
            <div className="rounded-2xl border border-border bg-card/80 backdrop-blur-xl shadow-xl p-6 sm:p-8">
              <form onSubmit={submit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="panel-password" className="flex items-center gap-1.5 text-sm font-medium">
                    <Lock className="h-3.5 w-3.5 text-emerald-600" />
                    {t("login.passwordLabel")}
                  </Label>
                  <div className="relative">
                    <Input
                      id="panel-password"
                      type={show ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      className="pr-10 font-mono"
                      disabled={loading}
                    />
                    <button
                      type="button"
                      onClick={() => setShow((s) => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent flex items-center justify-center transition-colors"
                      tabIndex={-1}
                      aria-label={show ? "Hide password" : "Show password"}
                    >
                      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-900 p-3 text-sm text-rose-700 dark:text-rose-300"
                  >
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">{error}</p>
                      {attempts >= 2 && (
                        <p className="text-xs mt-1 text-rose-600/80 dark:text-rose-400/80">
                          {t("login.hint")}
                        </p>
                      )}
                    </div>
                  </motion.div>
                )}

                <Button
                  type="submit"
                  className="w-full h-11 text-sm font-medium bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-md shadow-emerald-500/20 transition-all"
                  disabled={loading || !password}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("login.signingIn")}
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-4 w-4" />
                      {t("login.signIn")}
                    </>
                  )}
                </Button>
              </form>

              <div className="mt-6 pt-6 border-t border-border/60 text-center">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t("login.footerHint")}
                </p>
              </div>
            </div>

            {/* Footer */}
            <p className="text-center text-xs text-muted-foreground mt-6">
              {t("app.footer")}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
