/** Local-date helpers. Single source of truth for date→day-key so that
 * generated day buckets and transaction day-keys align regardless of timezone.
 * Never use toISOString() for day keys — it converts to UTC and shifts the day. */

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" from a Date (local components) or the date-prefix of a string. */
export function toDayKey(d: string | Date): string {
  if (typeof d === "string") {
    // ISO-with-time or date-only: take the leading date portion as authored.
    if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
    d = new Date(d);
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local midnight Date for a "YYYY-MM-DD" key. */
export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function daysInMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export function dayOfMonth(d: Date): number {
  return d.getDate();
}

/** "Today" / "Yesterday" / "Sat, 21 Jun" (year shown only if not current year). */
export function dayLabel(key: string, now: Date = new Date()): string {
  const d = parseDayKey(key);
  const todayKey = toDayKey(now);
  const yesterdayKey = toDayKey(addDays(now, -1));
  if (key === todayKey) return "Today";
  if (key === yesterdayKey) return "Yesterday";
  return d.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}
