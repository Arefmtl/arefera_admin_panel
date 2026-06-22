"use client";

import { useMemo } from "react";
import { Check, CheckCheck, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ButtonConfig } from "./shared";

/**
 * Client-side variable substitution that mirrors the server-side
 * `substituteVariables` in `src/lib/scheduler.ts`. Used by the live preview
 * so admins can see exactly how `{{channel}}`, `{{date}}`, etc. resolve.
 */
function substituteForPreview(
  text: string,
  channelTitle: string,
  messageTitle: string,
): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const weekdayStr = now.toLocaleDateString("en-GB", { weekday: "long" });
  return text.replace(/\{\{\s*([^}]+?)\s*\}\}/gi, (full, key: string) => {
    const k = key.trim().toLowerCase();
    if (k === "channel" || k === "channel_title" || k === "channeltitle") return channelTitle || "channel";
    if (k === "channel_id" || k === "channelid") return "-1001234567890";
    if (k === "date") return dateStr;
    if (k === "time") return timeStr;
    if (k === "datetime" || k === "timestamp") return `${dateStr} ${timeStr}`;
    if (k === "weekday" || k === "day") return weekdayStr;
    if (k === "count" || k === "channel_count") return "1";
    if (k === "message_title" || k === "title" || k === "messagetitle") return messageTitle || "message";
    return full;
  });
}

/**
 * TelegramMessagePreview
 * Renders a pixel-perfect mockup of how a message will look inside a
 * Telegram chat — including bot avatar, message bubble with Markdown/HTML
 * rendering, inline buttons, and channel name caption.
 *
 * The preview is purely cosmetic — no network calls. It mirrors the
 * MarkdownV2 / HTML subset that Telegram supports.
 */
export function TelegramMessagePreview({
  text,
  format,
  buttons,
  channelTitle,
  messageTitle,
  botName = "Broadcast Bot",
  className,
}: {
  text: string;
  format: "markdown" | "html";
  buttons: ButtonConfig;
  channelTitle?: string;
  messageTitle?: string;
  botName?: string;
  className?: string;
}) {
  // Apply variable substitution so the preview shows resolved values.
  const resolvedText = useMemo(
    () => substituteForPreview(text, channelTitle || botName, messageTitle || ""),
    [text, channelTitle, botName, messageTitle],
  );
  const rendered = useMemo(() => renderFormatted(resolvedText, format), [resolvedText, format]);
  const cleanButtons = useMemo(
    () =>
      buttons
        .map((row) => row.filter((b) => b.text.trim() && b.url.trim()))
        .filter((row) => row.length > 0),
    [buttons],
  );
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  return (
    <div className={cn("rounded-2xl overflow-hidden border border-border bg-gradient-to-b from-sky-100 to-slate-200 dark:from-slate-900 dark:to-slate-950", className)}>
      {/* Telegram chat header */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-white/80 dark:bg-slate-900/70 backdrop-blur-sm border-b border-black/5 dark:border-white/5">
        <div className="h-9 w-9 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shrink-0">
          <Send className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
            {channelTitle || botName}
          </p>
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
            {channelTitle ? "channel" : "bot"} · online
          </p>
        </div>
        <div className="flex gap-1">
          <span className="h-1 w-1 rounded-full bg-slate-400" />
          <span className="h-1 w-1 rounded-full bg-slate-400" />
          <span className="h-1 w-1 rounded-full bg-slate-400" />
        </div>
      </div>

      {/* Chat body — message bubble */}
      <div
        className="px-4 py-6 min-h-[180px]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 30%, rgba(255,255,255,0.4) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.3) 0%, transparent 50%)",
        }}
      >
        {!text.trim() && cleanButtons.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-10 text-slate-500 dark:text-slate-400">
            <Send className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-xs">Your message preview will appear here</p>
            <p className="text-[10px] mt-1 opacity-70">Start typing to see the live preview</p>
          </div>
        ) : (
          <div className="max-w-[85%]">
            {/* Outgoing message bubble (what the bot just sent) */}
            <div className="relative inline-block bg-white dark:bg-slate-800 rounded-2xl rounded-tl-md shadow-sm overflow-hidden">
              <div className="px-3 py-2">
                {channelTitle && (
                  <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 mb-0.5">
                    {botName}
                  </p>
                )}
                <div
                  className="text-sm text-slate-900 dark:text-slate-100 whitespace-pre-wrap break-words leading-relaxed [&_a]:text-sky-600 [&_a]:underline [&_a]:no-underline-offset-2 [&_strong]:font-bold [&_em]:italic [&_code]:font-mono [&_code]:text-xs [&_code]:bg-slate-100 [&_code]:dark:bg-slate-700 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_pre]:bg-slate-100 [&_pre]:dark:bg-slate-700 [&_pre]:p-2 [&_pre]:rounded [&_pre]:my-1 [&_pre]:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:p-0"
                  dangerouslySetInnerHTML={{ __html: rendered }}
                />
              </div>
              {/* Inline buttons */}
              {cleanButtons.length > 0 && (
                <div className="border-t border-slate-100 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700">
                  {cleanButtons.map((row, i) => (
                    <div key={i} className="flex">
                      {row.map((btn, j) => (
                        <a
                          key={j}
                          href={btn.url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.preventDefault()}
                          className={cn(
                            "flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 text-[13px] font-medium text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/30 transition-colors truncate",
                            j > 0 && "border-l border-slate-100 dark:border-slate-700",
                          )}
                          title={btn.url}
                        >
                          <span className="truncate">{btn.text}</span>
                        </a>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              {/* Timestamp + read receipt */}
              <div className="flex items-center justify-end gap-1 px-3 pb-1.5 -mt-1">
                <span className="text-[10px] text-slate-400">{timeStr}</span>
                <CheckCheck className="h-3 w-3 text-sky-500" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Composer (decorative) */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white/80 dark:bg-slate-900/70 backdrop-blur-sm border-t border-black/5 dark:border-white/5">
        <div className="flex-1 rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1.5">
          <p className="text-xs text-slate-400">Message…</p>
        </div>
        <div className="h-7 w-7 rounded-full bg-emerald-500 flex items-center justify-center">
          <Send className="h-3.5 w-3.5 text-white" />
        </div>
      </div>
    </div>
  );
}

/**
 * Convert Markdown or HTML message text into safe HTML for the preview.
 * This is a simplified renderer that covers the common subset Telegram
 * supports (bold, italic, code, pre, links). It does not attempt full
 * MarkdownV2 fidelity — only enough for a believable preview.
 */
function renderFormatted(text: string, format: "markdown" | "html"): string {
  if (!text.trim()) return "";
  let html = escapeHtml(text);

  if (format === "markdown") {
    // Code blocks ```...```
    html = html.replace(/```([\s\S]*?)```/g, (_m, c) => `<pre><code>${c}</code></pre>`);
    // Inline code `...`
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    // Bold **...** or __...__
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/__([^_]+)__/g, "<strong>$1</strong>");
    // Italic *...* or _..._
    html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    html = html.replace(/(^|[^_])_([^_\n]+)_/g, "$1<em>$2</em>");
    // Links [text](url)
    html = html.replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer">$1</a>',
    );
    // Bare URLs
    html = html.replace(
      /(^|[\s(])((https?:\/\/)[^\s<)]+)/g,
      '$1<a href="$2" target="_blank" rel="noreferrer">$2</a>',
    );
  } else {
    // HTML — allow only the safe subset Telegram supports
    // We've already escaped everything; now re-allow known tags.
    const allowed = ["b", "strong", "i", "em", "u", "ins", "s", "strike", "del", "code", "pre", "a", "br"];
    for (const tag of allowed) {
      const open = new RegExp(`&lt;(${tag})(\\s[^&]*)&gt;`, "gi");
      const close = new RegExp(`&lt;/(${tag})&gt;`, "gi");
      html = html.replace(open, (m, t, attrs) => {
        if (t.toLowerCase() === "a") {
          const href = (attrs || "").match(/href=["']([^"']+)["']/i);
          return href ? `<a href="${href[1]}" target="_blank" rel="noreferrer">` : `<a>`;
        }
        return `<${t}>`;
      });
      html = html.replace(close, "</$1>");
    }
    // <br> self-closing
    html = html.replace(/&lt;br\s*\/?&gt;/gi, "<br/>");
  }

  return html;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * CompactPreviewCard — wraps the preview inside a Card-style container with a
 * label, used inside the Scheduled editor and Broadcast composer.
 */
export function PreviewCard({
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
          <Send className="h-3 w-3 text-emerald-600" />
          Live preview
        </p>
        <p className="text-[10px] text-muted-foreground">
          How recipients will see this message
        </p>
      </div>
      <TelegramMessagePreview
        text={text}
        format={format}
        buttons={buttons}
        channelTitle={channelTitle}
      />
    </div>
  );
}

// Suppress unused warning for `Check` (kept for future single-tick status)
void Check;
