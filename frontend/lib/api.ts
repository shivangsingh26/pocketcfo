export type CategoryTotal = {
  category_id: string;
  label: string;
  emoji?: string;
  color?: string;
  total: string | number;
};

export type Txn = {
  id: string;
  occurred_at: string;
  amount: string | number;
  direction: string;
  merchant?: string;
  category_id: string;
  source: string;
};

export async function getSummary(): Promise<CategoryTotal[]> {
  const r = await fetch("/api/summary");
  if (!r.ok) throw new Error(`summary ${r.status}`);
  return (await r.json()).categories ?? [];
}

export async function getTransactions(): Promise<Txn[]> {
  const r = await fetch("/api/transactions");
  if (!r.ok) throw new Error(`transactions ${r.status}`);
  return (await r.json()).transactions ?? [];
}

export const inr = (v: string | number) =>
  "₹" + Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 });
