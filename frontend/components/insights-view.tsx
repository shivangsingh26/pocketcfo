"use client";

import { useMemo } from "react";
import { TrendingUp, TrendingDown, PiggyBank, CalendarClock, Wallet, BarChart3 } from "lucide-react";
import { type Txn, inr, categoryMeta } from "@/lib/api";
import { projectMonthEnd, monthOverMonth, savingsRate } from "@/lib/insights";
import { RecurringPanel } from "@/components/recurring-panel";
import { ChartSkeleton } from "@/components/skeletons";

export function InsightsView({ transactions, loading }: { transactions: Txn[]; loading?: boolean }) {
  const forecast = useMemo(() => projectMonthEnd(transactions), [transactions]);
  const mom = useMemo(() => monthOverMonth(transactions), [transactions]);
  const deltas = useMemo(() => mom.filter((d) => d.deltaPct != null).slice(0, 5), [mom]);
  const byCategory = useMemo(
    () => [...mom].filter((d) => d.thisMonth > 0).sort((a, b) => b.thisMonth - a.thisMonth).slice(0, 6),
    [mom]
  );
  const savings = useMemo(() => savingsRate(transactions), [transactions]);
  const dailyAvg = forecast.daysElapsed > 0 ? Math.round(forecast.monthToDate / forecast.daysElapsed) : 0;
  const maxCat = Math.max(...byCategory.map((d) => d.thisMonth), 1);

  if (loading) {
    return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
      {Array.from({ length: 3 }).map((_, i) => <ChartSkeleton key={i} height={120} />)}
    </div>;
  }

  const thin = forecast.daysElapsed < 5;

  // Savings card adapts: saving → %, overspending → net amount, no income → spend.
  let savingsLabel = "Savings rate";
  let savingsValue = `${Math.round(savings.rate * 100)}%`;
  let savingsColor = "var(--pc-credit)";
  let savingsSub = `${inr(savings.income)} in · ${inr(savings.spend)} out`;
  let SavingsIcon = PiggyBank;
  if (savings.income === 0) {
    savingsLabel = "Spent this month";
    savingsValue = inr(savings.spend);
    savingsColor = "var(--pc-ink)";
    savingsSub = "No income recorded yet";
    SavingsIcon = Wallet;
  } else if (savings.net < 0) {
    savingsLabel = "Net this month";
    savingsValue = `−${inr(Math.abs(savings.net))}`;
    savingsColor = "var(--pc-danger)";
    savingsSub = `Overspending · ${inr(savings.spend)} on ${inr(savings.income)} income`;
    SavingsIcon = TrendingDown;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div>
        <h2 className="pc-h2">Insights</h2>
        <p style={{ color: "var(--pc-ink-2)", fontSize: "0.875rem", marginTop: 4 }}>Forecasts, trends and recurring charges from your spending.</p>
      </div>

      {/* Stat row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        <StatCard Icon={CalendarClock} iconColor="var(--pc-accent)" label="Projected this month"
          value={inr(forecast.projected)}
          sub={`${inr(forecast.monthToDate)} so far · day ${forecast.daysElapsed} of ${forecast.daysInMonth}${thin ? " · early estimate" : ""}`} />
        <StatCard Icon={BarChart3} iconColor="var(--pc-gold)" label="Daily average"
          value={inr(dailyAvg)} sub={`over ${forecast.daysElapsed} day${forecast.daysElapsed === 1 ? "" : "s"} this month`} />
        <StatCard Icon={SavingsIcon} iconColor={savingsColor} label={savingsLabel}
          value={savingsValue} valueColor={savingsColor} sub={savingsSub} />
      </div>

      {/* This month by category — always present when there is spend */}
      {byCategory.length > 0 && (
        <section aria-labelledby="bycat-heading">
          <h3 id="bycat-heading" className="pc-label" style={{ marginBottom: 12 }}>This month by category</h3>
          <div className="pc-card" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
            {byCategory.map((d) => {
              const meta = categoryMeta(d.categoryId);
              return (
                <div key={d.categoryId} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, width: 120, flexShrink: 0 }}>
                    <span aria-hidden="true">{d.emoji}</span>
                    <span style={{ fontSize: "0.8125rem", color: "var(--pc-ink-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.label}</span>
                  </div>
                  <div style={{ flex: 1, height: 8, background: "var(--pc-accent-soft)", borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ width: `${(d.thisMonth / maxCat) * 100}%`, height: "100%", background: meta.color, borderRadius: 999 }} />
                  </div>
                  <span className="pc-tabular" style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--pc-ink)", width: 84, textAlign: "right", flexShrink: 0 }}>{inr(d.thisMonth)}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Top movers — only render when there's comparable history */}
      {deltas.length > 0 && (
        <section aria-labelledby="movers-heading">
          <h3 id="movers-heading" className="pc-label" style={{ marginBottom: 12 }}>Top movers vs last month</h3>
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
        </section>
      )}

      <RecurringPanel transactions={transactions} />
    </div>
  );
}

function StatCard({ Icon, iconColor, label, value, valueColor, sub }: {
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number; color?: string; "aria-hidden"?: boolean | "true" }>;
  iconColor: string; label: string; value: string; valueColor?: string; sub: string;
}) {
  return (
    <div className="pc-card pc-card-hover" style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <Icon size={16} strokeWidth={2} color={iconColor} aria-hidden="true" />
        <h3 className="pc-label">{label}</h3>
      </div>
      <p className="pc-h1 pc-tabular" style={{ fontSize: "1.75rem", color: valueColor ?? "var(--pc-ink)" }}>{value}</p>
      <p style={{ fontSize: "0.8125rem", color: "var(--pc-ink-2)", marginTop: 6 }}>{sub}</p>
    </div>
  );
}
