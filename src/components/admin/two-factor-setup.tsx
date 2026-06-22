"use client";

/**
 * TwoFactorSetup — 3-step dialog for enabling TOTP-based 2FA.
 *
 * Step 1: Display the QR code (pre-rendered PNG data URL from the server) +
 *         the raw base32 secret + "Scan with Google Authenticator / Authy /
 *         1Password" instructions.
 * Step 2: 6-digit code input (using shadcn InputOTP). Verifies against
 *         `/api/auth/2fa/verify`. On success, advances to step 3.
 * Step 3: Display the 8 one-time-use backup codes with a "Download" button
 *         + "I've saved these codes" button to close the dialog.
 *
 * Framer-motion step transitions (slide + fade).
 * Full dark mode + FA/RTL support via the i18n keys in `lib/i18n.tsx`.
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
} from "@/components/ui/input-otp";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2,
  QrCode,
  ShieldCheck,
  Copy,
  Check,
  Download,
  ArrowRight,
  ArrowLeft,
  KeyRound,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";

type SetupResponse = {
  secret: string;
  qrCodeURI: string;
  qrCodeDataUrl: string | null;
  backupCodes: string[];
};

export function TwoFactorSetup({
  open,
  onClose,
  onEnabled,
}: {
  open: boolean;
  onClose: () => void;
  onEnabled?: () => void;
}) {
  const { t, dir } = useI18n();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [setup, setSetup] = useState<SetupResponse | null>(null);
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  // Reset state whenever the dialog opens.
  useEffect(() => {
    if (open) {
      setStep(1);
      setSetup(null);
      setToken("");
      setError(null);
      setCopied(false);
      setSaved(false);
      // Kick off the setup request immediately so the QR code is ready by
      // the time the user looks at step 1.
      void startSetup();
    }
  }, [open]);

  const startSetup = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/2fa/setup", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || t("settings.2fa.setupFailed"));
      }
      setSetup(data as SetupResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("settings.2fa.setupFailed"));
    } finally {
      setLoading(false);
    }
  };

  const verify = async () => {
    if (!/^\d{6}$/.test(token)) {
      setError(t("settings.2fa.invalidToken"));
      return;
    }
    setVerifying(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || t("settings.2fa.invalidToken"));
      }
      toast.success(t("settings.2fa.enableSuccess"));
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("settings.2fa.invalidToken"));
    } finally {
      setVerifying(false);
    }
  };

  const copySecret = async () => {
    if (!setup) return;
    try {
      await navigator.clipboard.writeText(setup.secret);
      setCopied(true);
      toast.success(t("settings.2fa.copied"));
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed — select the text manually");
    }
  };

  const downloadCodes = () => {
    if (!setup) return;
    const content =
      `Telegram Bot Admin Panel — 2FA Backup Codes\n` +
      `Generated: ${new Date().toISOString()}\n` +
      `Each code is single-use. Store them securely (e.g. password manager).\n\n` +
      setup.backupCodes.map((c, i) => `${i + 1}. ${c}`).join("\n") +
      `\n\n— End of backup codes —\n`;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tg-bot-admin-2fa-backup-codes.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setSaved(true);
    toast.success("Backup codes downloaded");
  };

  const close = () => {
    if (step === 3) {
      onEnabled?.();
    }
    onClose();
  };

  // The "next" arrow direction depends on RTL/LTR.
  const NextIcon = dir === "rtl" ? ArrowLeft : ArrowRight;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            {t("settings.2fa.title")}
            <Badge variant="outline" className="ml-auto text-[11px] font-medium">
              {t("settings.2fa.step")} {step} {t("settings.2fa.of")} 3
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {step === 1 && t("settings.2fa.scanQR")}
            {step === 2 && t("settings.2fa.enterCode")}
            {step === 3 && t("settings.2fa.backupCodesDesc")}
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {/* Step 1 — QR code + secret */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: dir === "rtl" ? -20 : 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: dir === "rtl" ? 20 : -20 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {loading ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <Loader2 className="h-6 w-6 animate-spin text-emerald-600 dark:text-emerald-400" />
                  <p className="text-xs text-muted-foreground">Generating secret…</p>
                </div>
              ) : error ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-900 p-3 text-sm text-rose-700 dark:text-rose-300">
                  {error}
                </div>
              ) : setup ? (
                <>
                  <div className="flex justify-center p-3 bg-white rounded-xl border border-border">
                    {setup.qrCodeDataUrl ? (
                      <img
                        src={setup.qrCodeDataUrl}
                        alt={t("settings.2fa.qrAlt")}
                        width={220}
                        height={220}
                        className="rounded-md"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-[220px] w-[220px] text-muted-foreground">
                        <QrCode className="h-10 w-10 mb-2" />
                        <p className="text-xs">QR rendering failed — use the secret below.</p>
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <KeyRound className="h-3 w-3" />
                      Secret (manual entry)
                    </Label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 truncate rounded-md bg-muted px-3 py-2 text-xs font-mono tracking-wide">
                        {setup.secret}
                      </code>
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={copySecret}
                        aria-label={t("settings.2fa.copySecret")}
                        className="shrink-0"
                      >
                        {copied ? (
                          <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground leading-relaxed">
                    Open Google Authenticator, Authy, or 1Password → Add account → Scan QR code
                    (or enter the secret manually as a &quot;Time-based&quot; key).
                  </div>
                  <Button
                    className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white"
                    onClick={() => setStep(2)}
                  >
                    {t("settings.2fa.scanQR").split(".")[0]}
                    <NextIcon className="h-4 w-4 ms-1.5" />
                    Next
                  </Button>
                </>
              ) : null}
            </motion.div>
          )}

          {/* Step 2 — verify 6-digit token */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: dir === "rtl" ? -20 : 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: dir === "rtl" ? 20 : -20 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              <div className="flex flex-col items-center gap-3 py-2">
                <Label className="text-sm font-medium">{t("settings.2fa.enterCode")}</Label>
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
                {error && (
                  <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                  Back
                </Button>
                <Button
                  className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white"
                  onClick={verify}
                  disabled={verifying || token.length !== 6}
                >
                  {verifying ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("settings.2fa.verifying")}
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-4 w-4" />
                      {t("settings.2fa.verify")}
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          )}

          {/* Step 3 — backup codes */}
          {step === 3 && setup && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: dir === "rtl" ? -20 : 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: dir === "rtl" ? 20 : -20 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-3 text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
                {t("settings.2fa.backupCodesDesc")}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {setup.backupCodes.map((code, i) => (
                  <div
                    key={i}
                    className="rounded-md border border-border bg-muted/50 px-3 py-2 text-center font-mono text-sm tracking-wider"
                  >
                    {code}
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={downloadCodes} className="flex-1">
                  <Download className="h-4 w-4" />
                  {t("settings.2fa.downloadCodes")}
                </Button>
                <Button
                  className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white"
                  onClick={close}
                  disabled={!saved}
                  title={saved ? undefined : "Download the codes first"}
                >
                  <Check className="h-4 w-4" />
                  {t("settings.2fa.savedCodes")}
                </Button>
              </div>
              {!saved && (
                <p className="text-[11px] text-muted-foreground text-center">
                  Please download the codes before closing — they won&apos;t be shown again.
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
