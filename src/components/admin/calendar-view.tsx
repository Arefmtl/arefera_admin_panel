"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Clock,
  CheckCircle2,
  XCircle,
  Repeat,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { apiFetch } from "./shared";
import { useI18n } from "@/lib/i18n";

type CalendarItem = {
  id: string;
  title: string;
  status: string;
  repeat: string;
  scheduledAt: string;
  nextRunAt: string | null;
};

type CalendarData = {
  month: number;
  year: number;
  items: CalendarItem[];
  summary: Record<string, { pending: number; repeating: number; failed: number }>;
};

type DayItems = {
  date: Date;
  key: string; // YYYY-MM-DD
  isCurrentMonth: boolean;
  isToday: boolean;
  items: CalendarItem[];
  pending: number;
  repeating: number;
  failed: number;
};

type Props = {
  onEdit: (id: string) => void;
  onCreate: (date: Date) => void;
};

const DAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_FA = ["ی", "د", "س", "چ", "پ", "ج", "ش"];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay(); // 0=Sun
}

/** Build a HTML-safe tooltip text summarizing all messages on a given day. */
function buildDayTooltip(day: DayItems, locale: "en" | "fa"): string {
  if (day.items.length === 0) return locale === "fa" ? "بدون پیام" : "No messages";
  const lines = day.items.map((item) => {
    const time = new Date(item.scheduledAt).toLocaleTimeString(
      locale === "fa" ? "fa-IR" : "en-US",
      { hour: "2-digit", minute: "2-digit" },
    );
    const tag =
      item.repeat !== "none"
        ? "↻"
        : item.status === "failed"
          ? "✗"
          : "✓";
    return `${tag} ${time} — ${item.title}`;
  });
  return lines.join("\n");
}

export function CalendarView({ onEdit, onCreate }: Props) {
  const { t, locale, dir } = useI18n();
  const [data, setData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null); // YYYY-MM-DD
  const [expandedMobile, setExpandedMobile] = useState<string | null>(null);

  // Current view month/year
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1); // 1-12

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch<CalendarData>(
      `/api/scheduled/calendar?month=${viewMonth}&year=${viewYear}`
    );
    if (res.error) {
      setData(null);
    } else {
      setData(res.data);
    }
    setLoading(false);
  }, [viewMonth, viewYear]);

  useEffect(() => {
    const run = async () => {
      await fetchData();
    };
    run();
  }, [fetchData]);

  const goToPrevMonth = () => {
    if (viewMonth === 1) {
      setViewMonth(12);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
    setSelectedDay(null);
  };

  const goToNextMonth = () => {
    if (viewMonth === 12) {
      setViewMonth(1);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
    setSelectedDay(null);
  };

  const goToToday = () => {
    const n = new Date();
    setViewYear(n.getFullYear());
    setViewMonth(n.getMonth() + 1);
    setSelectedDay(null);
  };

  const isCurrentMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth() + 1;
  const monthName = new Date(viewYear, viewMonth - 1, 1).toLocaleDateString(
    locale === "fa" ? "fa-IR" : "en-US",
    { month: "long", year: "numeric" }
  );

  // Build grid of days
  const days = useMemo<DayItems[]>(() => {
    const result: DayItems[] = [];
    const daysInMonth = getDaysInMonth(viewYear, viewMonth);
    const firstDay = getFirstDayOfWeek(viewYear, viewMonth);

    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    // Previous month padding
    const prevMonth = viewMonth === 1 ? 12 : viewMonth - 1;
    const prevYear = viewMonth === 1 ? viewYear - 1 : viewYear;
    const daysInPrevMonth = getDaysInMonth(prevYear, prevMonth);
    for (let i = firstDay - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i;
      const date = new Date(prevYear, prevMonth - 1, day);
      const key = `${prevYear}-${String(prevMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      result.push({
        date,
        key,
        isCurrentMonth: false,
        isToday: key === todayKey,
        items: [],
        pending: 0,
        repeating: 0,
        failed: 0,
      });
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(viewYear, viewMonth - 1, day);
      const key = `${viewYear}-${String(viewMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const summary = data?.summary?.[key] || { pending: 0, repeating: 0, failed: 0 };
      const dayItems = (data?.items || []).filter((item) => {
        const scheduledDate = item.scheduledAt.slice(0, 10);
        const nextRunDate = item.nextRunAt?.slice(0, 10);
        return scheduledDate === key || nextRunDate === key;
      });
      result.push({
        date,
        key,
        isCurrentMonth: true,
        isToday: key === todayKey,
        items: dayItems,
        ...summary,
      });
    }

    // Next month padding — fill to 42 cells (6 rows)
    const totalCells = result.length <= 35 ? 35 : 42;
    const nextMonth = viewMonth === 12 ? 1 : viewMonth + 1;
    const nextYear = viewMonth === 12 ? viewYear + 1 : viewYear;
    let nextDay = 1;
    while (result.length < totalCells) {
      const date = new Date(nextYear, nextMonth - 1, nextDay);
      const key = `${nextYear}-${String(nextMonth).padStart(2, "0")}-${String(nextDay).padStart(2, "0")}`;
      result.push({
        date,
        key,
        isCurrentMonth: false,
        isToday: key === todayKey,
        items: [],
        pending: 0,
        repeating: 0,
        failed: 0,
      });
      nextDay++;
    }

    return result;
  }, [viewYear, viewMonth, data, now]);

  const dayLabels = locale === "fa" ? DAYS_FA : DAYS_EN;

  const handleDayClick = (day: DayItems) => {
    if (day.isCurrentMonth) {
      setSelectedDay(day.key);
    }
  };

  const handleDayEmptyClick = (day: DayItems) => {
    if (day.isCurrentMonth) {
      onCreate(day.date);
    }
  };

  // Selected day details
  const selectedDayData = selectedDay ? days.find((d) => d.key === selectedDay) : null;

  return (
    <div className="space-y-4">
      {/* Header: Month navigation */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={goToPrevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h3 className="text-base font-semibold min-w-[160px] text-center capitalize">
            {monthName}
          </h3>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={goToNextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        {!isCurrentMonth && (
          <Button variant="outline" size="sm" onClick={goToToday} className="text-xs">
            {t("calendar.today")}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="h-24 rounded-lg bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* Desktop: calendar grid (hidden on mobile) */}
          <div className="hidden sm:block">
            {/* Day-of-week headers */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {dayLabels.map((label, i) => (
                <div
                  key={i}
                  className="text-center text-xs font-medium text-muted-foreground py-1"
                >
                  {label}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7 gap-1">
              {days.map((day, i) => {
                const totalMsgs = day.items.length;
                const hasMessages = totalMsgs > 0;
                const hasFailures = day.failed > 0;
                const isSelected = selectedDay === day.key;
                const tooltipText = buildDayTooltip(day, locale);

                return (
                  <motion.div
                    key={day.key}
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.2, delay: i * 0.008 }}
                    className={cn(
                      "relative min-h-[88px] rounded-lg border p-1.5 cursor-pointer transition-colors",
                      // Base background per state — failures tint rose, messages tint emerald
                      day.isCurrentMonth
                        ? hasFailures
                          ? "day-cell-has-failures border-rose-200/60 dark:border-rose-900/40"
                          : hasMessages
                            ? "day-cell-has-messages border-emerald-200/60 dark:border-emerald-900/40"
                            : "bg-card border-border hover:bg-accent/50"
                        : "bg-muted/20 border-transparent",
                      // Today — prominent emerald ring + bg
                      day.isToday && "day-cell-today",
                      // Selected — emerald border highlight
                      isSelected && day.isCurrentMonth && "border-emerald-400 dark:border-emerald-500",
                    )}
                    onClick={() => handleDayClick(day)}
                    title={tooltipText}
                  >
                    {/* Day number — top-left */}
                    <div className="flex items-start justify-between">
                      <span
                        className={cn(
                          "text-xs font-medium",
                          day.isCurrentMonth ? "text-foreground" : "text-muted-foreground/50",
                          day.isToday && "text-emerald-600 dark:text-emerald-400 font-bold",
                        )}
                      >
                        {day.date.getDate()}
                      </span>
                      {/* Message count badge — top-right */}
                      {totalMsgs > 0 && (
                        <span
                          className={cn(
                            "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full tabular-nums",
                            hasFailures
                              ? "bg-rose-500 text-white dark:bg-rose-600"
                              : "bg-emerald-500 text-white dark:bg-emerald-500",
                          )}
                          title={t("calendar.messageCount").replace("{{count}}", String(totalMsgs))}
                        >
                          {totalMsgs}
                        </span>
                      )}
                    </div>

                    {/* Message pills — with status icons */}
                    {hasMessages && (
                      <div className="mt-1 space-y-0.5">
                        {day.items.slice(0, 3).map((item) => {
                          const isRepeating = item.repeat !== "none";
                          const isFailed = item.status === "failed";
                          const isSent = item.status === "sent";
                          const pillColor = isRepeating
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                            : isFailed
                              ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
                              : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
                          const StatusIcon = isRepeating ? Repeat : isFailed ? XCircle : isSent ? CheckCircle2 : Clock;
                          return (
                            <button
                              key={item.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                onEdit(item.id);
                              }}
                              className={cn("message-pill", pillColor)}
                              title={item.title}
                            >
                              <StatusIcon className="h-3 w-3 shrink-0" />
                              <span>{item.title}</span>
                            </button>
                          );
                        })}
                        {totalMsgs > 3 && (
                          <span className="text-[10px] text-muted-foreground pl-1">
                            +{totalMsgs - 3} {t("calendar.more")}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Click to add (shown when no messages) */}
                    {!hasMessages && day.isCurrentMonth && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDayEmptyClick(day);
                        }}
                        className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                        aria-label={t("calendar.addOnDay")}
                      >
                        <span className="text-emerald-500 text-lg font-light">+</span>
                      </button>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* Mobile: compact list (shown on sm and below) */}
          <div className="sm:hidden space-y-1">
            {days
              .filter((d) => d.isCurrentMonth)
              .map((day) => {
                const totalMsgs = day.items.length;
                const isExpanded = expandedMobile === day.key;

                return (
                  <motion.div
                    key={day.key}
                    initial={{ opacity: 0, x: dir === "rtl" ? 12 : -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2 }}
                    className={cn(
                      "rounded-lg border border-border p-3 transition-colors",
                      day.failed > 0 && "day-cell-has-failures",
                      day.items.length > 0 && day.failed === 0 && "day-cell-has-messages",
                      day.isToday && "day-cell-today",
                      selectedDay === day.key && "border-emerald-400 dark:border-emerald-500",
                    )}
                    onClick={() => {
                      setSelectedDay(day.key);
                      setExpandedMobile(isExpanded ? null : day.key);
                    }}
                    title={buildDayTooltip(day, locale)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "text-sm font-medium",
                            day.isToday && "text-emerald-600 dark:text-emerald-400",
                          )}
                        >
                          {day.date.getDate()}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {day.date.toLocaleDateString(locale === "fa" ? "fa-IR" : "en-US", { weekday: "short" })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {totalMsgs > 0 ? (
                          <>
                            {/* Count badge for mobile too */}
                            <span
                              className={cn(
                                "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full tabular-nums",
                                day.failed > 0
                                  ? "bg-rose-500 text-white dark:bg-rose-600"
                                  : "bg-emerald-500 text-white dark:bg-emerald-500",
                              )}
                            >
                              {totalMsgs}
                            </span>
                            {day.pending > 0 && (
                              <Badge variant="outline" className="text-[10px] h-5 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
                                {day.pending}
                              </Badge>
                            )}
                            {day.repeating > 0 && (
                              <Badge variant="outline" className="text-[10px] h-5 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
                                {day.repeating}
                              </Badge>
                            )}
                            {day.failed > 0 && (
                              <Badge variant="outline" className="text-[10px] h-5 bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800">
                                {day.failed}
                              </Badge>
                            )}
                          </>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDayEmptyClick(day);
                            }}
                            className="text-xs text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                          >
                            + {t("calendar.add")}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expanded items */}
                    {isExpanded && totalMsgs > 0 && (
                      <div className="mt-2 space-y-1.5 border-t border-border pt-2">
                        {day.items.map((item) => {
                          const isRepeating = item.repeat !== "none";
                          const isFailed = item.status === "failed";
                          const isSent = item.status === "sent";
                          const pillColor = isRepeating
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                            : isFailed
                              ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
                              : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
                          const StatusIcon = isRepeating ? Repeat : isFailed ? XCircle : isSent ? CheckCircle2 : Clock;
                          return (
                            <button
                              key={item.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                onEdit(item.id);
                              }}
                              className={cn(
                                "w-full text-left text-xs rounded-md px-2.5 py-1.5 transition-colors hover:opacity-80 flex items-center gap-1.5",
                                pillColor,
                              )}
                            >
                              <StatusIcon className="h-3 w-3 shrink-0" />
                              <span className="font-medium flex-1 min-w-0 truncate">{item.title}</span>
                              <span className="opacity-70 shrink-0 inline-flex items-center gap-0.5">
                                <Clock className="h-3 w-3" />
                                {new Date(item.scheduledAt).toLocaleTimeString(locale === "fa" ? "fa-IR" : "en-US", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </motion.div>
                );
              })}
          </div>

          {/* Selected day detail panel */}
          {selectedDayData && selectedDayData.items.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-border bg-card p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">
                  {selectedDayData.date.toLocaleDateString(
                    locale === "fa" ? "fa-IR" : "en-US",
                    { weekday: "long", month: "long", day: "numeric" }
                  )}
                </h4>
                <Badge variant="outline" className="text-xs">
                  {selectedDayData.items.length} {t("calendar.messages")}
                </Badge>
              </div>
              <ul className="space-y-2">
                {selectedDayData.items.map((item) => {
                  const isRepeating = item.repeat !== "none";
                  const isFailed = item.status === "failed";
                  const statusCls = isRepeating
                    ? "border-l-amber-400"
                    : isFailed
                      ? "border-l-rose-400"
                      : "border-l-emerald-400";
                  const StatusIcon = isRepeating ? Repeat : isFailed ? XCircle : CheckCircle2;
                  return (
                    <li
                      key={item.id}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-lg border border-border border-l-4 p-3 hover:bg-accent/40 transition-colors cursor-pointer",
                        statusCls,
                      )}
                      onClick={() => onEdit(item.id)}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate flex items-center gap-1.5">
                          <StatusIcon className={cn(
                            "h-3.5 w-3.5 shrink-0",
                            isRepeating ? "text-amber-500" : isFailed ? "text-rose-500" : "text-emerald-500",
                          )} />
                          {item.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          <Clock className="inline h-3 w-3 mr-1" />
                          {new Date(item.scheduledAt).toLocaleTimeString(
                            locale === "fa" ? "fa-IR" : "en-US",
                            { hour: "2-digit", minute: "2-digit" }
                          )}
                          {item.repeat !== "none" && (
                            <Badge variant="outline" className="ml-2 text-[10px] h-4 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300">
                              {t(`repeat.${item.repeat}`)}
                            </Badge>
                          )}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}
