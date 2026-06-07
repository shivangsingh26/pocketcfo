import { type CategoryTotal, type Txn, type BudgetStatus, inr } from "@/lib/api";
import { HeroCard } from "@/components/hero-card";
import { CategoryBento } from "@/components/category-bento";
import { SpendTrendChart } from "@/components/spend-trend-chart";
import { TopCategoriesChart } from "@/components/top-categories-chart";
import { CFOChat } from "@/components/cfo-chat";
import { HeroSkeleton, ChartSkeleton } from "@/components/skeletons";
import { AlertTriangle, CheckCircle } from "lucide-react";

interface OverviewViewProps {
  categories: CategoryTotal[];
  transactions: Txn[];
  budgetStatuses: BudgetStatus[];
  nudges: string[];
  loading?: boolean;
}

export function OverviewView({
  categories,
  transactions,
  budgetStatuses,
  nudges,
  loading,
}: OverviewViewProps) {
  const heroTotal = categories.reduce((sum, c) => sum + Number(c.total), 0);
  const debitCount = transactions.filter((t) => t.direction === "debit").length;

  const overBudget = budgetStatuses.filter((s) => s.over);
  const warningBudget = budgetStatuses.filter((s) => !s.over && s.pct >= 0.8);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {/* Hero */}
      {loading ? (
        <HeroSkeleton />
      ) : (
        <HeroCard total={heroTotal} txnCount={debitCount} />
      )}

      {/* Two-column: left = charts, right = chat */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.55fr) minmax(0, 1fr)",
          gap: 20,
          alignItems: "start",
        }}
        className="overview-grid"
      >
        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Category bento */}
          <section aria-labelledby="overview-cats-heading">
            <h3 id="overview-cats-heading" className="pc-label" style={{ marginBottom: 12 }}>
              By category
            </h3>
            <CategoryBento categories={categories} loading={loading} />
          </section>

          {/* Spend trend chart */}
          {loading ? (
            <ChartSkeleton height={220} />
          ) : (
            <SpendTrendChart transactions={transactions} />
          )}

          {/* Top categories bar chart */}
          {loading ? (
            <ChartSkeleton height={180} />
          ) : (
            <TopCategoriesChart categories={categories} />
          )}

          {/* Budget summary */}
          {!loading && budgetStatuses.length > 0 && (
            <section aria-labelledby="overview-budget-heading">
              <h3 id="overview-budget-heading" className="pc-label" style={{ marginBottom: 12 }}>
                Budget snapshot
              </h3>

              {/* Nudges */}
              {nudges.length > 0 && (
                <div
                  style={{
                    background: "var(--pc-warn-bg)",
                    borderRadius: "var(--pc-radius-sm)",
                    padding: "10px 14px",
                    marginBottom: 10,
                    border: "1px solid rgba(46,42,38,0.08)",
                  }}
                  role="alert"
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <AlertTriangle size={13} strokeWidth={2} color="var(--pc-danger)" aria-hidden="true" />
                    <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--pc-ink)" }}>
                      {overBudget.length > 0
                        ? `${overBudget.length} budget${overBudget.length > 1 ? "s" : ""} exceeded`
                        : `${warningBudget.length} budget${warningBudget.length > 1 ? "s" : ""} near limit`}
                    </span>
                  </div>
                  {nudges.slice(0, 3).map((n, i) => (
                    <p key={i} style={{ fontSize: "0.8125rem", color: "var(--pc-ink)", margin: 0, paddingLeft: 19 }}>
                      {n}
                    </p>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {budgetStatuses.slice(0, 5).map((s) => {
                  const pct = Math.min(s.pct, 1) * 100;
                  return (
                    <div
                      key={s.category_id}
                      className="pc-card"
                      style={{ padding: "10px 14px" }}
                      aria-label={`${s.label}: ${Math.round(s.pct * 100)}% of budget used`}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
                        <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--pc-ink)" }}>
                          <span aria-hidden="true">{s.emoji} </span>{s.label}
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span
                            className="pc-tabular"
                            style={{ fontSize: "0.8125rem", color: "var(--pc-ink-2)" }}
                          >
                            {inr(s.spent)} / {inr(s.limit)}
                          </span>
                          {s.over ? (
                            <AlertTriangle size={12} strokeWidth={2} color="var(--pc-danger)" aria-label="Over budget" />
                          ) : s.pct >= 0.8 ? null : (
                            <CheckCircle size={12} strokeWidth={2} color="var(--pc-credit)" aria-label="On track" />
                          )}
                        </div>
                      </div>
                      <div className="pc-progress-track">
                        <div
                          className="pc-progress-fill"
                          style={{
                            width: `${pct}%`,
                            background: s.over ? "var(--pc-danger)" : s.color ?? "var(--pc-groceries)",
                          }}
                          role="progressbar"
                          aria-valuenow={Math.round(pct)}
                          aria-valuemin={0}
                          aria-valuemax={100}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        {/* Right column: CFO chat */}
        <div style={{ position: "sticky", top: 16 }}>
          <CFOChat />
        </div>
      </div>

      {/* Responsive: stack columns on narrow screens */}
      <style>{`
        @media (max-width: 768px) {
          .overview-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
