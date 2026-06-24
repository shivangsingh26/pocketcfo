export interface CsvColumn { key: string; header: string; }

function escapeField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Record<string, unknown>[], columns: CsvColumn[]): string {
  const header = columns.map((c) => escapeField(c.header)).join(",");
  const body = rows.map((row) => columns.map((c) => escapeField(row[c.key])).join(","));
  return [header, ...body].join("\r\n");
}

/** Trigger a browser download of `csv` as `filename`. No-op outside the browser. */
export function downloadCsv(filename: string, csv: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
