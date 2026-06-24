import type { Txn, CategoryTotal, BudgetStatus } from "@/lib/api";
import { categoryMeta } from "@/lib/api";
import { toDayKey, addDays } from "@/lib/date";

/** Demo mode: activated by ?demo=1 in the URL or NEXT_PUBLIC_DEMO=1.
 * Default builds are unaffected — the app still calls the real /api. */
export function isDemo(): boolean {
  if (process.env.NEXT_PUBLIC_DEMO === "1") return true;
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("demo") === "1";
}

let _seed = 1;
function rand(): number { _seed = (_seed * 1103515245 + 12345) & 0x7fffffff; return _seed / 0x7fffffff; }
function pick<T>(xs: T[]): T { return xs[Math.floor(rand() * xs.length)]; }
function amt(min: number, max: number): number { return Math.round(min + rand() * (max - min)); }

const ONE_OFFS: { merchant: string; category: string; min: number; max: number }[] = [
  { merchant: "Swiggy", category: "food", min: 180, max: 650 },
  { merchant: "Zomato", category: "food", min: 200, max: 700 },
  { merchant: "BigBasket", category: "groceries", min: 400, max: 2200 },
  { merchant: "Uber", category: "transport", min: 90, max: 480 },
  { merchant: "Myntra", category: "clothing", min: 700, max: 3500 },
  { merchant: "Amazon", category: "shopping", min: 300, max: 4000 },
  { merchant: "BookMyShow", category: "entertainment", min: 250, max: 1200 },
  { merchant: "Apollo Pharmacy", category: "health", min: 150, max: 1400 },
  { merchant: "IndianOil", category: "transport", min: 800, max: 2500 },
  { merchant: "Starbucks", category: "food", min: 250, max: 600 },
];

export function sampleTransactions(now: Date = new Date()): Txn[] {
  _seed = 42;
  const txns: Txn[] = [];
  let id = 1;
  const push = (merchant: string, category: string, amount: number, daysAgo: number, direction: Txn["direction"] = "debit") => {
    txns.push({
      id: String(id++),
      occurred_at: `${toDayKey(addDays(now, -daysAgo))}T${String(8 + (id % 12)).padStart(2, "0")}:15:00`,
      amount, direction, merchant, category_id: category, source: pick(["gmail", "sms", "csv", "pdf"]) as Txn["source"],
    });
  };
  // Recurring: Netflix monthly, Cult gym weekly, Rent monthly, Salary monthly (credit)
  for (const d of [3, 33, 63]) push("Netflix", "entertainment", 499, d);
  for (const d of [2, 9, 16, 23, 30, 37]) push("Cult Fitness", "health", 300, d);
  for (const d of [5, 35]) push("Home Rent", "bills", 18000, d);
  for (const d of [1, 31]) push("Acme Payroll", "other", 85000, d, "credit");
  // One-offs across ~56 days (spans current + previous month)
  for (let d = 0; d < 56; d++) {
    if (rand() < 0.6) { const o = pick(ONE_OFFS); push(o.merchant, o.category, amt(o.min, o.max), d); }
  }
  return txns.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
}

export function sampleCategories(now: Date = new Date()): CategoryTotal[] {
  const totals = new Map<string, number>();
  for (const t of sampleTransactions(now)) {
    if (t.direction !== "debit") continue;
    totals.set(t.category_id, (totals.get(t.category_id) ?? 0) + Number(t.amount));
  }
  return [...totals.entries()]
    .map(([category_id, total]) => {
      const m = categoryMeta(category_id);
      return { category_id, label: m.label, emoji: m.emoji, color: m.color, total };
    })
    .sort((a, b) => Number(b.total) - Number(a.total));
}

export function sampleBudgets(now: Date = new Date()): { statuses: BudgetStatus[]; nudges: string[] } {
  const cats = sampleCategories(now);
  const byId = new Map(cats.map((c) => [c.category_id, Number(c.total)]));
  const defs: { category_id: string; limit: number }[] = [
    { category_id: "food", limit: 6000 },
    { category_id: "groceries", limit: 8000 },
    { category_id: "bills", limit: 20000 },
    { category_id: "shopping", limit: 5000 },
  ];
  const statuses: BudgetStatus[] = defs.map((d) => {
    const m = categoryMeta(d.category_id);
    const spent = byId.get(d.category_id) ?? 0;
    const pct = d.limit > 0 ? spent / d.limit : 0;
    return { category_id: d.category_id, label: m.label, emoji: m.emoji, color: m.color, spent, limit: d.limit, pct, over: spent > d.limit };
  });
  const nudges: string[] = [];
  for (const s of statuses) {
    const pct = Math.round(s.pct * 100);
    if (s.over) nudges.push(`⚠️ ${s.emoji} ${s.label} is OVER budget — ${pct}% of ₹${Number(s.limit).toLocaleString("en-IN")}.`);
    else if (s.pct >= 0.8) nudges.push(`🔔 ${s.emoji} ${s.label} is at ${pct}% of its ₹${Number(s.limit).toLocaleString("en-IN")} budget.`);
  }
  return { statuses, nudges };
}

export function sampleChatReply(question: string): string {
  const top = sampleCategories()[0];
  return `Demo mode 🧪 — based on the sample data, your biggest category is ${top?.emoji ?? ""} ${top?.label ?? "—"} ` +
    `at ₹${Number(top?.total ?? 0).toLocaleString("en-IN")}. (Connect the backend for real answers to: “${question}”.)`;
}
