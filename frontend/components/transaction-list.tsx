import { type Txn, inr } from "@/lib/api";

interface TransactionListProps {
  transactions: Txn[];
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

export function TransactionList({ transactions }: TransactionListProps) {
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
            <span
              className="pc-tabular text-sm font-semibold ml-4 shrink-0"
              style={{ color: amountColor }}
            >
              {sign}
              {inr(txn.amount)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
