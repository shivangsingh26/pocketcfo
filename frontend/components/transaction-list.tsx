import { type Txn, inr, CATEGORIES } from "@/lib/api";

interface TransactionListProps {
  transactions: Txn[];
  onRecategorize?: (transactionId: string | number, categoryId: string) => void;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
    });
  } catch {
    return iso;
  }
}

export function TransactionList({ transactions, onRecategorize }: TransactionListProps) {
  if (transactions.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {transactions.map((txn) => {
        const isCredit = txn.direction === "credit";
        const sign = isCredit ? "+" : "−";
        const amountColor = isCredit ? "#3a8f6b" : "var(--pc-ink)";

        return (
          <div
            key={txn.id}
            className="flex items-center justify-between px-4 py-3"
            style={{
              background: "rgba(255,255,255,0.80)",
              borderRadius: "var(--pc-radius)",
              border: "1px solid rgba(255,255,255,0.6)",
            }}
          >
            <div className="flex flex-col min-w-0">
              <span
                className="font-medium text-sm truncate"
                style={{ color: "var(--pc-ink)" }}
              >
                {txn.merchant ?? "Unknown merchant"}
              </span>
              <span
                className="text-xs mt-0.5"
                style={{ color: "var(--pc-ink)", opacity: 0.5 }}
              >
                {formatDate(txn.occurred_at)}
              </span>
            </div>
            <div className="flex items-center gap-3 ml-4 shrink-0">
              <select
                aria-label={`Category for ${txn.merchant ?? "transaction"}`}
                value={txn.category_id}
                onChange={(e) => onRecategorize?.(txn.id, e.target.value)}
                disabled={!onRecategorize}
                className="text-xs rounded-md px-2 py-1 cursor-pointer"
                style={{
                  background: "rgba(255,255,255,0.9)",
                  border: "1px solid rgba(0,0,0,0.08)",
                  color: "var(--pc-ink)",
                }}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.emoji} {c.label}
                  </option>
                ))}
              </select>
              <span
                className="pc-tabular text-sm font-semibold"
                style={{ color: amountColor }}
              >
                {sign}
                {inr(txn.amount)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
