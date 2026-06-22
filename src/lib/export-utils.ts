/**
 * Client-side export utilities for downloading data as CSV or JSON.
 *
 * Both functions build a Blob in-memory and trigger a browser download via a
 * temporary anchor element. No server round-trip needed.
 */

/**
 * Convert an array of records to CSV.
 * - Strings containing commas, quotes, or newlines are quoted and escaped.
 * - Nested objects are JSON-stringified.
 * - Undefined/null become empty strings.
 */
export function toCSV(rows: Record<string, unknown>[], columns?: string[]): string {
  if (rows.length === 0) return "";
  const cols = columns || Object.keys(rows[0]);
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    let s = typeof v === "object" ? JSON.stringify(v) : String(v);
    if (/[",\n\r]/.test(s)) {
      s = `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const header = cols.map(escape).join(",");
  const body = rows
    .map((r) => cols.map((c) => escape((r as Record<string, unknown>)[c])).join(","))
    .join("\n");
  return `${header}\n${body}`;
}

/**
 * Trigger a browser download for any text content.
 */
export function downloadFile(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a tick so the download has time to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Download an array of records as a CSV file.
 */
export function downloadCSV(
  rows: Record<string, unknown>[],
  filename: string,
  columns?: string[],
): void {
  const csv = toCSV(rows, columns);
  downloadFile(csv, filename.endsWith(".csv") ? filename : `${filename}.csv`, "text/csv;charset=utf-8");
}

/**
 * Download any JSON-serializable value as a .json file.
 */
export function downloadJSON(data: unknown, filename: string): void {
  const json = JSON.stringify(data, null, 2);
  downloadFile(json, filename.endsWith(".json") ? filename : `${filename}.json`, "application/json");
}

/**
 * Generate a timestamped filename like "scheduled-2026-06-21-23-50.csv".
 */
export function timestampedFilename(prefix: string, ext: "csv" | "json"): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ts = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}-${pad(d.getMinutes())}`;
  return `${prefix}-${ts}.${ext}`;
}
