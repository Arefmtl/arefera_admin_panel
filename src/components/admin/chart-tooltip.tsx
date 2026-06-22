"use client";

/**
 * Custom recharts tooltip — emerald-tinted card with colored swatches,
 * value chips, and proper dark mode support.
 *
 * Usage:
 *   <Tooltip content={<ChartTooltip payloadLabels={[["sent", "Sent"], ["failed", "Failed"]]} />} />
 */

import type { ReactNode } from "react";

export type ChartTooltipPayload = {
  name: string;
  value: number | string;
  color: string;
  dataKey: string;
};

export type ChartTooltipProps = {
  active?: boolean;
  payload?: ChartTooltipPayload[];
  label?: string | number;
  payloadLabels?: [string, string][]; // [dataKey, displayLabel][]
  formatter?: (value: number | string, dataKey: string) => ReactNode;
  labelFormatter?: (label: string | number) => string;
};

const COLOR_HEX: Record<string, string> = {
  sent: "#10b981",
  failed: "#fb7185",
  total: "#0d9488",
  rate: "#8b5cf6",
  value: "#14b8a6",
};

export function ChartTooltip({
  active,
  payload,
  label,
  payloadLabels,
  formatter,
  labelFormatter,
}: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const labelText = label !== undefined && label !== null
    ? (labelFormatter ? labelFormatter(label) : String(label))
    : null;

  return (
    <div className="rounded-xl border border-emerald-200/60 dark:border-emerald-800/60 bg-card/95 dark:bg-card/95 backdrop-blur-md shadow-xl px-3 py-2.5 min-w-32">
      {labelText && (
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 pb-1.5 border-b border-border/60">
          {labelText}
        </p>
      )}
      <ul className="space-y-1">
        {payload.map((entry, i) => {
          const displayLabel =
            payloadLabels?.find(([key]) => key === entry.dataKey)?.[1] ||
            entry.name ||
            entry.dataKey;
          const color = entry.color || COLOR_HEX[entry.dataKey] || "#10b981";
          return (
            <li key={`${entry.dataKey}-${i}`} className="flex items-center gap-2 text-xs">
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0 ring-2 ring-background/80"
                style={{ backgroundColor: color }}
              />
              <span className="text-muted-foreground">{displayLabel}</span>
              <span className="ml-auto font-semibold text-foreground tabular-nums">
                {formatter ? formatter(entry.value, entry.dataKey) : entry.value}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Hourly heatmap tooltip — special variant for the 24-hour delivery heatmap
 * in the Analytics section.
 */
export function HourlyHeatmapTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { hour: number; sent: number; failed: number; total: number } }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  const hour12 = d.hour === 0 ? "12 AM" : d.hour < 12 ? `${d.hour} AM` : d.hour === 12 ? "12 PM" : `${d.hour - 12} PM`;
  return (
    <div className="rounded-xl border border-emerald-200/60 dark:border-emerald-800/60 bg-card/95 backdrop-blur-md shadow-xl px-3 py-2.5 min-w-40">
      <p className="text-xs font-semibold text-foreground mb-1.5 pb-1.5 border-b border-border/60">{hour12}</p>
      <ul className="space-y-1 text-xs">
        <li className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="text-muted-foreground">Sent</span>
          <span className="ml-auto font-semibold tabular-nums">{d.sent}</span>
        </li>
        <li className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-rose-400" />
          <span className="text-muted-foreground">Failed</span>
          <span className="ml-auto font-semibold tabular-nums">{d.failed}</span>
        </li>
        <li className="flex items-center gap-2 pt-1 mt-1 border-t border-border/60">
          <span className="text-muted-foreground">Total</span>
          <span className="ml-auto font-bold tabular-nums">{d.total}</span>
        </li>
      </ul>
    </div>
  );
}
