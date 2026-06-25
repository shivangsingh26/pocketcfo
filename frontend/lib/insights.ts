import type { Txn } from "@/lib/api";
import { categoryMeta } from "@/lib/api";
import { toDayKey, parseDayKey, daysInMonth, dayOfMonth } from "@/lib/date";

/** Lowercase, collapse whitespace, strip trailing reference/order tokens. */
export function normalizeMerchant(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[*#].*$/, " ")          // drop "*1234" / "#99-88" suffixes
    .replace(/[0-9]{3,}/g, " ")       // drop long digit runs
    .replace(/\s+/g, " ")
    .trim();
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export type Recurring = {
  merchant: string;
  cadence: "weekly" | "monthly";
  avgAmount: number;
  monthlyEquivalent: number;
  count: number;
  lastSeen: string;
};

const WEEKS_PER_MONTH = 30.44 / 7;

export function detectRecurring(txns: Txn[]): Recurring[] {
  const groups = new Map<string, Txn[]>();
  for (const t of txns) {
    if (t.direction !== "debit") continue;
    const key = normalizeMerchant(t.merchant ?? "");
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  const out: Recurring[] = [];
  for (const [key, list] of groups) {
    if (list.length < 3) continue;
    const sorted = [...list].sort((a, b) => toDayKey(a.occurred_at).localeCompare(toDayKey(b.occurred_at)));
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const a = parseDayKey(toDayKey(sorted[i - 1].occurred_at));
      const b = parseDayKey(toDayKey(sorted[i].occurred_at));
      gaps.push(Math.round((b.getTime() - a.getTime()) / 86_400_000));
    }
    const gapMed = median(gaps);
    let cadence: "weekly" | "monthly" | null = null;
    if (gapMed >= 26 && gapMed <= 35) cadence = "monthly";
    else if (gapMed >= 6 && gapMed <= 8) cadence = "weekly";
    if (!cadence) continue;

    const amounts = sorted.map((t) => Number(t.amount));
    const amtMed = median(amounts);
    if (amtMed <= 0) continue;
    const stable = amounts.every((a) => Math.abs(a - amtMed) <= amtMed * 0.15);
    if (!stable) continue;

    const avgAmount = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    const monthlyEquivalent = cadence === "monthly" ? avgAmount : avgAmount * WEEKS_PER_MONTH;
    out.push({
      merchant: sorted[sorted.length - 1].merchant ?? key,
      cadence,
      avgAmount: Math.round(avgAmount),
      monthlyEquivalent: Math.round(monthlyEquivalent),
      count: sorted.length,
      lastSeen: toDayKey(sorted[sorted.length - 1].occurred_at),
    });
  }
  return out.sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent);
}

// ---------------------------------------------------------------------------
// Forecast / month-over-month / savings  (Task 6)
// ---------------------------------------------------------------------------

function inMonth(t: Txn, year: number, month0: number): boolean {
  const k = toDayKey(t.occurred_at);
  const [y, m] = k.split("-").map(Number);
  return y === year && m - 1 === month0;
}

export type Forecast = { monthToDate: number; projected: number; daysElapsed: number; daysInMonth: number };

export function projectMonthEnd(txns: Txn[], now: Date = new Date()): Forecast {
  const y = now.getFullYear();
  const m0 = now.getMonth();
  const monthToDate = txns
    .filter((t) => t.direction === "debit" && inMonth(t, y, m0))
    .reduce((s, t) => s + Number(t.amount), 0);
  const dim = daysInMonth(now);
  const elapsed = Math.max(1, dayOfMonth(now));
  const projected = Math.round((monthToDate / elapsed) * dim);
  return { monthToDate: Math.round(monthToDate), projected, daysElapsed: elapsed, daysInMonth: dim };
}

export type CategoryDelta = {
  categoryId: string; label: string; emoji: string;
  thisMonth: number; lastMonth: number; deltaPct: number | null;
};

export function monthOverMonth(txns: Txn[], now: Date = new Date()): CategoryDelta[] {
  const y = now.getFullYear();
  const m0 = now.getMonth();
  const prev = new Date(y, m0 - 1, 1);
  const py = prev.getFullYear();
  const pm0 = prev.getMonth();

  const acc = new Map<string, { thisMonth: number; lastMonth: number }>();
  for (const t of txns) {
    if (t.direction !== "debit") continue;
    const cur = acc.get(t.category_id) ?? { thisMonth: 0, lastMonth: 0 };
    if (inMonth(t, y, m0)) cur.thisMonth += Number(t.amount);
    else if (inMonth(t, py, pm0)) cur.lastMonth += Number(t.amount);
    acc.set(t.category_id, cur);
  }

  const out: CategoryDelta[] = [];
  for (const [categoryId, v] of acc) {
    if (v.thisMonth === 0 && v.lastMonth === 0) continue;
    const meta = categoryMeta(categoryId);
    const deltaPct = v.lastMonth > 0 ? ((v.thisMonth - v.lastMonth) / v.lastMonth) * 100 : null;
    out.push({
      categoryId, label: meta.label, emoji: meta.emoji,
      thisMonth: Math.round(v.thisMonth), lastMonth: Math.round(v.lastMonth), deltaPct,
    });
  }
  return out.sort((a, b) => Math.abs(b.thisMonth - b.lastMonth) - Math.abs(a.thisMonth - a.lastMonth));
}

export type Savings = { income: number; spend: number; rate: number; net: number };

export function savingsRate(txns: Txn[], now: Date = new Date()): Savings {
  const y = now.getFullYear();
  const m0 = now.getMonth();
  let income = 0, spend = 0;
  for (const t of txns) {
    if (!inMonth(t, y, m0)) continue;
    if (t.direction === "credit") income += Number(t.amount);
    else spend += Number(t.amount);
  }
  const rate = income > 0 ? (income - spend) / income : 0;
  return { income: Math.round(income), spend: Math.round(spend), rate, net: Math.round(income - spend) };
}
