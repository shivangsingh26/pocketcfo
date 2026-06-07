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

export const CATEGORIES: { id: string; label: string; emoji: string }[] = [
  { id: "food",          label: "Food",          emoji: "🍔" },
  { id: "travel",        label: "Travel",        emoji: "✈️" },
  { id: "clothing",      label: "Clothing",      emoji: "👕" },
  { id: "groceries",     label: "Groceries",     emoji: "🛒" },
  { id: "bills",         label: "Bills",         emoji: "🧾" },
  { id: "entertainment", label: "Entertainment", emoji: "🎬" },
  { id: "health",        label: "Health",        emoji: "💊" },
  { id: "transport",     label: "Transport",     emoji: "🚗" },
  { id: "shopping",      label: "Shopping",      emoji: "🛍️" },
  { id: "other",         label: "Other",         emoji: "❓" },
];

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

/** Format a number/string as Indian-locale INR amount (no paise). */
export const inr = (v: string | number): string =>
  "₹" + Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 });
