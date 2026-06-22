"use client";

/**
 * TwoFactorPrompt — login-screen overlay shown when `requires2FA: true`.
 *
 * Receives the tempToken from the login route (returned in the response body
 * when 2FA is enabled) and asks the user for either:
 *  - a 6-digit TOTP code (default), or
 *  - an 8-char backup code (toggle).
 *
 * POSTs to `/api/auth/login/2fa` with `{ tempToken, token }`. On success,
 * calls `onSuccess()` so the parent can navigate to the panel. On failure,
 * shows an inline error.
 *
 * Includes a "Back to password" link so the user can re-enter the password
 * (e.g. if they typed the wrong account).
 */

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, ShieldCheck, KeyRound, ArrowLeft, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
} from "@/components/ui/input-otp";
import { useI18n } from "@/lib/i18n";

export function TwoFactorPrompt({
  tempToken,
  onSuccess,
  onBack,
}: {
  tempToken: string;
  onSuccess: () => void;
  onBack: () => void;
}) {
  const { t, dir } = useI18n();
  const [mode, setMode] = useState<"totp" | "backup">("totp");
  const [token, setToken] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const backupInputRef = useRef<HTMLInputElement | null>(null);

  // Auto-focus the OTP input on mount.
  useEffect(() => {
    const id = setTimeout(() => {
      const el = document.querySelector<HTMLInputElement>('[data-input-otp="true"]');
      el?.focus();
    }, 100);
    return () => clearTimeout(id);
  }, []);

  const submit = async () => {
    const code = mode === "totp" ? token : backupCode;
    if (!code) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tempToken, token: code }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || t("login.2fa.invalid"));
      }
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("login.2fa.invalid"));
      // Clear inputs so the user can retry.
      setToken("");
      setBackupCode("");
    } finally {
      setLoading(false);
    }
  };

  const BackIcon = dir === "rtl" ? ArrowLeft : ArrowLeft;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="w-full max-w-md"
    >
      <div className="flex flex-col items-center mb-6">
        <motion.div
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.5, type: "spring", bounce: 0.5 }}
          className="h-14 w-14 rounded-2xl bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-emerald-500/30 mb-3"
        >
          <ShieldCheck className="h-7 w-7 text-white" />
        </motion.div>
        <h2 className="text-lg font-semibold tracking-tight">{t("login.2fa.title")}</h2>
        <p className="text-sm text-muted-foreground mt-1 text-center">{t("login.2fa.subtitle")}</p>
      </div>

      <div className="rounded-2xl border border-border bg-card/80 backdrop-blur-xl shadow-xl p-6">
        <div className="space-y-5">
          {mode === "totp" ? (
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t("login.2fa.enterCode")}</Label>
              <div className="flex justify-center pt-2">
                <InputOTP
                  maxLength={6}
                  value={token}
                  onChange={(v) => {
                    setToken(v);
                    setError(null);
                  }}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                  </InputOTPGroup>
                  <InputOTPSeparator />
                  <InputOTPGroup>
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                {t("login.2fa.backupCode")}
              </Label>
              <Input
                ref={backupInputRef}
                type="text"
                placeholder="e.g. 4f9a2b1c"
                value={backupCode}
                onChange={(e) => {
                  setBackupCode(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submit();
                }}
                className="font-mono text-center tracking-widest"
                autoComplete="one-time-code"
              />
              <p className="text-[11px] text-muted-foreground">{t("login.2fa.backupHint")}</p>
            </div>
          )}

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-900 p-3 text-sm text-rose-700 dark:text-rose-300"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <p className="font-medium">{error}</p>
            </motion.div>
          )}

          <Button
            className="w-full h-11 text-sm font-medium bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-md shadow-emerald-500/20 transition-all"
            onClick={submit}
            disabled={loading || (mode === "totp" ? token.length !== 6 : !backupCode)}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("login.2fa.verifying")}
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4" />
                {t("login.2fa.verify")}
              </>
            )}
          </Button>

          <div className="flex items-center justify-between pt-2 border-t border-border/60">
            <button
              type="button"
              onClick={onBack}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              <BackIcon className="h-3 w-3" />
              {t("login.2fa.back")}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode((m) => (m === "totp" ? "backup" : "totp"));
                setError(null);
                setToken("");
                setBackupCode("");
              }}
              className="text-xs text-emerald-700 dark:text-emerald-400 hover:underline"
            >
              {mode === "totp" ? t("login.2fa.useBackup") : t("login.2fa.useTOTP")}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
