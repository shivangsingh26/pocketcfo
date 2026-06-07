"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle, Target, Plus } from "lucide-react";
import { type BudgetStatus, CATEGORIES, inr } from "@/lib/api";
import { BudgetRowSkeleton } from "@/components/skeletons";

interface BudgetsViewProps {
  statuses: BudgetStatus[];
  nudges: string[];
  loading?: boolean;
  onSetBudget: (categoryId: string, limit: number) => Promise<void> | void;
}

export function BudgetsView({ statuses, nudges, loading, onSetBudget }: BudgetsViewProps) {
  const [cat, setCat] = useState("food");
  const [amt, setAmt] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    const n = Number(amt);
    if (n <= 0) return;
    setSaving(true);
    try {
      await onSetBudget(cat, n);
      setAmt("");
    } finally {
      setSaving(false);
    }
  }

  const overBudget = statuses.filter((s) => s.over);
  const onTrack = statuses.filter((s) => !s.over);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 680 }}>
      {/* Page header */}
      <div>
        <h2 className="pc-h2">Budgets</h2>
        <p style={{ color: "var(--pc-ink-2)", fontSize: "0.875rem", marginTop: 4 }}>
          Set monthly limits and track your spending per category.
        </p>
      </div>

      {/* Nudges / alerts */}
      {nudges.length > 0 && (
        <div
          style={{
            background: "var(--pc-warn-bg)",
            borderRadius: "var(--pc-radius)",
            padding: "14px 18px",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            border: "1px solid rgba(46,42,38,0.10)",
          }}
          role="alert"
          aria-label="Budget alerts"
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <AlertTriangle size={15} strokeWidth={2} color="var(--pc-danger)" aria-hidden="true" />
            <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--pc-ink)" }}>
              Budget alerts
            </span>
          </div>
          {nudges.map((n, i) => (
            <p key={i} style={{ fontSize: "0.875rem", color: "var(--pc-ink)", margin: 0, paddingLeft: 23 }}>
              {n}
            </p>
          ))}
        </div>
      )}

      {/* Set / edit a budget */}
      <div className="pc-card" style={{ padding: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <Target size={16} strokeWidth={2} color="var(--pc-ink-2)" aria-hidden="true" />
          <h3 className="pc-h3">Set a Budget</h3>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label htmlFor="budget-cat" className="pc-label">Category</label>
            <select
              id="budget-cat"
              value={cat}
              onChange={(e) => setCat(e.target.value)}
              className="pc-select"
              style={{ minWidth: 140 }}
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji} {c.label}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 140px" }}>
            <label htmlFor="budget-amt" className="pc-label">Monthly Limit (₹)</label>
            <input
              id="budget-amt"
              type="number"
              inputMode="numeric"
              min="1"
              value={amt}
              onChange={(e) => setAmt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="e.g. 5000"
              aria-label="Monthly budget limit in rupees"
              className="pc-input"
              style={{ minWidth: 120 }}
            />
          </div>

          <button
            onClick={handleAdd}
            disabled={saving || !amt || Number(amt) <= 0}
            className="pc-btn pc-btn-primary"
            style={{ alignSelf: "flex-end" }}
          >
            <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
            {saving ? "Saving…" : "Set Budget"}
          </button>
        </div>
      </div>

      {/* Budget status list */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {Array.from({ length: 4 }).map((_, i) => <BudgetRowSkeleton key={i} />)}
        </div>
      ) : statuses.length === 0 ? (
        <div className="pc-card" style={{ padding: "32px 20px", textAlign: "center" }}>
          <Target size={32} strokeWidth={1.2} color="var(--pc-ink-3)" style={{ margin: "0 auto 12px" }} aria-hidden="true" />
          <p style={{ color: "var(--pc-ink-2)", fontSize: "0.9rem" }}>
            No budgets set yet. Add one above to start tracking.
          </p>
        </div>
      ) : (
        <>
          {overBudget.length > 0 && (
            <section aria-label="Over-budget categories">
              <h4 className="pc-label" style={{ marginBottom: 10, color: "var(--pc-danger)" }}>
                Over budget
              </h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {overBudget.map((s) => (
                  <BudgetRow key={s.category_id} status={s} />
                ))}
              </div>
            </section>
          )}

          {onTrack.length > 0 && (
            <section aria-label="On-track categories">
              <h4 className="pc-label" style={{ marginBottom: 10 }}>On track</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {onTrack.map((s) => (
                  <BudgetRow key={s.category_id} status={s} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function BudgetRow({ status: s }: { status: BudgetStatus }) {
  const pct = Math.min(s.pct, 1) * 100;
  const displayPct = Math.round(s.pct * 100);

  return (
    <div
      className="pc-card"
      style={{ padding: "14px 18px" }}
      aria-label={`${s.label}: ${inr(s.spent)} of ${inr(s.limit)} (${displayPct}%)`}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: "1.125rem", lineHeight: 1 }} aria-hidden="true">{s.emoji}</span>
          <span style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--pc-ink)" }}>{s.label}</span>
          {s.over ? (
            <span className="pc-badge" style={{ background: "var(--pc-danger-bg)", color: "var(--pc-danger)" }}>
              <AlertTriangle size={10} strokeWidth={2} style={{ marginRight: 3 }} aria-hidden="true" />
              Over
            </span>
          ) : displayPct >= 80 ? (
            <span className="pc-badge" style={{ background: "var(--pc-warn-bg)", color: "#8B5A00" }}>
              {displayPct}%
            </span>
          ) : (
            <span className="pc-badge" style={{ background: "var(--pc-success-bg)", color: "#276A4E" }}>
              <CheckCircle size={10} strokeWidth={2} style={{ marginRight: 3 }} aria-hidden="true" />
              {displayPct}%
            </span>
          )}
        </div>
        <span className="pc-tabular" style={{ fontSize: "0.875rem", color: "var(--pc-ink-2)" }}>
          {inr(s.spent)}{" "}
          <span style={{ opacity: 0.5 }}>/ {inr(s.limit)}</span>
        </span>
      </div>

      <div className="pc-progress-track">
        <div
          className="pc-progress-fill"
          style={{
            width: `${pct}%`,
            background: s.over
              ? "var(--pc-danger)"
              : displayPct >= 80
              ? "#D48A00"
              : s.color ?? "var(--pc-groceries)",
          }}
          role="progressbar"
          aria-valuenow={displayPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${s.label} budget ${displayPct}% used`}
        />
      </div>
    </div>
  );
}
