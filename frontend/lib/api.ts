export type CategoryTotal = {
  category_id: string;
  label: string;
  emoji?: string;
  color?: string;
  total: string | number;
};

export type Txn = {
  id: string;
  occurred_at: string;   // ISO-8601, includes time
  amount: string | number;
  direction: "debit" | "credit";
  merchant?: string;
  category_id: string;
  source: "gmail" | "sms" | "csv" | "pdf";
  confidence?: number;
};

export async function getSummary(): Promise<CategoryTotal[]> {
  const r = await fetch("/api/summary");
  if (!r.ok) throw new Error(`summary ${r.status}`);
  return (await r.json()).categories ?? [];
}

export async function getTransactions(limit = 200): Promise<Txn[]> {
  const r = await fetch(`/api/transactions?limit=${limit}`);
  if (!r.ok) throw new Error(`transactions ${r.status}`);
  return (await r.json()).transactions ?? [];
}

export type BudgetStatus = {
  category_id: string;
  label: string;
  emoji?: string;
  color?: string;
  spent: string | number;
  limit: string | number;
  pct: number;
  over: boolean;
};

export const CATEGORIES: { id: string; label: string; emoji: string; color: string }[] = [
  { id: "food",          label: "Food",          emoji: "🍔", color: "var(--pc-food)" },
  { id: "travel",        label: "Travel",        emoji: "✈️", color: "var(--pc-travel)" },
  { id: "clothing",      label: "Clothing",      emoji: "👕", color: "var(--pc-clothing)" },
  { id: "groceries",     label: "Groceries",     emoji: "🛒", color: "var(--pc-groceries)" },
  { id: "bills",         label: "Bills",         emoji: "🧾", color: "var(--pc-bills)" },
  { id: "entertainment", label: "Entertainment", emoji: "🎬", color: "var(--pc-entertainment)" },
  { id: "health",        label: "Health",        emoji: "💊", color: "var(--pc-health)" },
  { id: "transport",     label: "Transport",     emoji: "🚗", color: "var(--pc-transport)" },
  { id: "shopping",      label: "Shopping",      emoji: "🛍️", color: "var(--pc-shopping)" },
  { id: "other",         label: "Other",         emoji: "❓", color: "var(--pc-other)" },
];

const _CAT_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

/** Canonical label/emoji/color for a category id, with a safe fallback. */
export function categoryMeta(id: string): { id: string; label: string; emoji: string; color: string } {
  const hit = _CAT_BY_ID.get(id);
  if (hit) return hit;
  return { id, label: id ? id[0].toUpperCase() + id.slice(1) : "Other", emoji: "💳", color: "var(--pc-other)" };
}

export async function recategorize(transactionId: string | number, categoryId: string) {
  const r = await fetch("/api/recategorize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transaction_id: transactionId, category_id: categoryId }),
  });
  if (!r.ok) throw new Error(`recategorize ${r.status}`);
  return r.json();
}

export async function getBudgets(): Promise<{ statuses: BudgetStatus[]; nudges: string[] }> {
  const r = await fetch("/api/budgets");
  if (!r.ok) throw new Error(`budgets ${r.status}`);
  return r.json();
}

export async function setBudget(categoryId: string, monthlyLimit: number) {
  const r = await fetch("/api/budgets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category_id: categoryId, monthly_limit: monthlyLimit }),
  });
  if (!r.ok) throw new Error(`setBudget ${r.status}`);
  return r.json();
}

/** Format a number/string as Indian-locale INR amount (no paise). NaN-safe. */
export const inr = (v: string | number): string => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "₹0";
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
};
