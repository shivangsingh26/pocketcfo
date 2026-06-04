"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getSummary,
  getTransactions,
  getBudgets,
  setBudget,
  recategorize,
  type CategoryTotal,
  type Txn,
  type BudgetStatus,
} from "@/lib/api";
import { HeroCard } from "@/components/hero-card";
import { CategoryBento } from "@/components/category-bento";
import { TransactionList } from "@/components/transaction-list";
import { SyncUpload } from "@/components/sync-upload";
import { CFOChat } from "@/components/cfo-chat";
import { Budgets } from "@/components/budgets";

type LoadState = "loading" | "empty" | "error" | "ready";

export function Dashboard() {
  const [categories, setCategories] = useState<CategoryTotal[]>([]);
  const [transactions, setTransactions] = useState<Txn[]>([]);
  const [budgetStatuses, setBudgetStatuses] = useState<BudgetStatus[]>([]);
  const [nudges, setNudges] = useState<string[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");
  // Ref so refresh() can guard against races without being a dep of the callback
  const cancelRef = useRef<boolean>(false);

  const refresh = useCallback(async () => {
    cancelRef.current = false;
    try {
      const [cats, txns, budgets] = await Promise.all([
        getSummary(),
        getTransactions(),
        getBudgets(),
      ]);
      if (cancelRef.current) return;
      setCategories(cats);
      setTransactions(txns);
      setBudgetStatuses(budgets.statuses);
      setNudges(budgets.nudges);
      setLoadState(cats.length === 0 && txns.length === 0 ? "empty" : "ready");
    } catch (err) {
      if (cancelRef.current) return;
      setErrorMsg(err instanceof Error ? err.message : "Unknown error");
      setLoadState("error");
    }
  }, []);

  const handleRecategorize = useCallback(
    async (id: string | number, categoryId: string) => {
      await recategorize(id, categoryId);
      await refresh();
    },
    [refresh]
  );

  const handleSetBudget = useCallback(
    async (categoryId: string, limit: number) => {
      await setBudget(categoryId, limit);
      await refresh();
    },
    [refresh]
  );

  useEffect(() => {
    refresh();
    return () => {
      cancelRef.current = true;
    };
  }, [refresh]);

  const heroTotal = categories.reduce(
    (sum, cat) => sum + Number(cat.total),
    0
  );

  if (loadState === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center min-h-[60vh]">
        <div
          className="pc-glass px-10 py-8 text-center"
          style={{ borderRadius: "var(--pc-radius)" }}
        >
          <div
            className="text-3xl mb-3 animate-spin inline-block"
            aria-hidden="true"
          >
            ⏳
          </div>
          <p
            className="text-base font-medium"
            style={{ color: "var(--pc-ink)", opacity: 0.7 }}
          >
            Loading your finances…
          </p>
        </div>
      </div>
    );
  }

  // "error" and "empty" both fall through to the full layout — SyncUpload +
  // CFOChat are always rendered so the user can see the design and populate
  // data even when the API is unreachable. The error surfaces as a banner.

  return (
    <main
      className="w-full max-w-5xl mx-auto px-4 py-8 flex flex-col gap-6"
      style={{ color: "var(--pc-ink)" }}
    >
      {/* Non-blocking notice when the API can't be reached */}
      {loadState === "error" && (
        <div
          className="px-4 py-3 text-sm flex items-center gap-2"
          style={{
            background: "var(--pc-bills)",
            borderRadius: "var(--pc-radius)",
            color: "var(--pc-ink)",
          }}
        >
          <span aria-hidden="true">⚠️</span>
          <span>
            Backend not reachable ({errorMsg}). Showing empty dashboard — start
            the API (<code>vercel dev</code>) or upload a statement to populate it.
          </span>
        </div>
      )}

      {/* Hero: total spent */}
      <HeroCard total={heroTotal} />

      {/* Sync / upload controls */}
      <SyncUpload onChanged={refresh} />

      {/* Category bento grid */}
      {categories.length > 0 && (
        <section>
          <h2
            className="text-xs font-semibold uppercase tracking-widest mb-3"
            style={{ color: "var(--pc-ink)", opacity: 0.5 }}
          >
            By category
          </h2>
          <CategoryBento categories={categories} />
        </section>
      )}

      {/* Budgets + overspend nudges */}
      <Budgets
        statuses={budgetStatuses}
        nudges={nudges}
        onSetBudget={handleSetBudget}
      />

      {/* Two-column: transactions (left) + CFO chat (right); stacks on mobile */}
      <section className="pc-txn-chat-grid">
        {/* Transactions column */}
        <div className="flex flex-col gap-2">
          {transactions.length > 0 ? (
            <>
              <h2
                className="text-xs font-semibold uppercase tracking-widest mb-1"
                style={{ color: "var(--pc-ink)", opacity: 0.5 }}
              >
                Recent transactions
              </h2>
              <TransactionList
                transactions={transactions}
                onRecategorize={handleRecategorize}
              />
            </>
          ) : (
            <p
              className="text-sm"
              style={{ color: "var(--pc-ink)", opacity: 0.4 }}
            >
              No transactions yet — sync or upload to get started.
            </p>
          )}
        </div>

        {/* CFO chat column */}
        <div>
          <CFOChat />
        </div>
      </section>
    </main>
  );
}
