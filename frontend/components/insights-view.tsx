"use client";

import { useMemo } from "react";
import { TrendingUp, TrendingDown, PiggyBank, CalendarClock } from "lucide-react";
import { type Txn, inr } from "@/lib/api";
import { projectMonthEnd, monthOverMonth, savingsRate } from "@/lib/insights";
import { RecurringPanel } from "@/components/recurring-panel";
import { ChartSkeleton } from "@/components/skeletons";

export function InsightsView({ transactions, loading }: { transactions: Txn[]; loading?: boolean }) {
  const forecast = useMemo(() => projectMonthEnd(transactions), [transactions]);
  const deltas = useMemo(() => monthOverMonth(transactions).filter((d) => d.deltaPct != null).slice(0, 5), [transactions]);
  const savings = useMemo(() => savingsRate(transactions), [transactions]);

  if (loading) {
    return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
      {Array.from({ length: 4 }).map((_, i) => <ChartSkeleton key={i} height={140} />)}
    </div>;
  }

  const thin = forecast.daysElapsed < 5;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h2 className="pc-h2">Insights</h2>
        <p style={{ color: "var(--pc-ink-2)", fontSize: "0.875rem", marginTop: 4 }}>Forecasts, trends and recurring charges from your spending.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
        {/* Projected month-end */}
        <div className="pc-card" style={{ padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <CalendarClock size={16} strokeWidth={2} color="var(--pc-accent)" aria-hidden="true" />
            <h3 className="pc-label">Projected this month</h3>
          </div>
          <p className="pc-h1 pc-tabular" style={{ fontSize: "1.75rem" }}>{inr(forecast.projected)}</p>
          <p style={{ fontSize: "0.8125rem", color: "var(--pc-ink-2)", marginTop: 6 }}>
            {inr(forecast.monthToDate)} spent · day {forecast.daysElapsed} of {forecast.daysInMonth}
            {thin && <span style={{ color: "var(--pc-ink-3)" }}> · early estimate</span>}
          </p>
        </div>

        {/* Savings rate */}
        <div className="pc-card" style={{ padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <PiggyBank size={16} strokeWidth={2} color="var(--pc-credit)" aria-hidden="true" />
            <h3 className="pc-label">Savings rate</h3>
          </div>
          <p className="pc-h1 pc-tabular" style={{ fontSize: "1.75rem", color: savings.rate >= 0 ? "var(--pc-credit)" : "var(--pc-danger)" }}>
            {Math.round(savings.rate * 100)}%
          </p>
          <p style={{ fontSize: "0.8125rem", color: "var(--pc-ink-2)", marginTop: 6 }}>
            {inr(savings.income)} in · {inr(savings.spend)} out
          </p>
        </div>
      </div>

      {/* Top movers */}
      <section aria-labelledby="movers-heading">
        <h3 id="movers-heading" className="pc-label" style={{ marginBottom: 12 }}>Top movers vs last month</h3>
        {deltas.length === 0 ? (
          <div className="pc-card" style={{ padding: 20 }}>
            <p style={{ color: "var(--pc-ink-3)", fontSize: "0.875rem" }}>Not enough history yet — movers appear once you have two months of data.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {deltas.map((d) => {
              const up = (d.deltaPct ?? 0) >= 0;
              return (
                <div key={d.categoryId} className="pc-card" style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: "1.125rem" }} aria-hidden="true">{d.emoji}</span>
                  <span style={{ fontWeight: 600, fontSize: "0.875rem", color: "var(--pc-ink)", flex: 1 }}>{d.label}</span>
                  <span className="pc-tabular" style={{ fontSize: "0.8125rem", color: "var(--pc-ink-2)" }}>{inr(d.lastMonth)} → {inr(d.thisMonth)}</span>
                  <span className="pc-badge" style={{ background: up ? "var(--pc-danger-bg)" : "var(--pc-success-bg)", color: up ? "var(--pc-danger)" : "var(--pc-credit)", display: "inline-flex", alignItems: "center", gap: 3 }}>
                    {up ? <TrendingUp size={11} strokeWidth={2.4} aria-hidden="true" /> : <TrendingDown size={11} strokeWidth={2.4} aria-hidden="true" />}
                    {up ? "+" : ""}{Math.round(d.deltaPct ?? 0)}%
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <RecurringPanel transactions={transactions} />
    </div>
  );
}
