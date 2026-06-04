"use client";

import { useState } from "react";
import { type BudgetStatus, CATEGORIES, inr } from "@/lib/api";

interface BudgetsProps {
  statuses: BudgetStatus[];
  nudges: string[];
  onSetBudget: (categoryId: string, limit: number) => void;
}

export function Budgets({ statuses, nudges, onSetBudget }: BudgetsProps) {
  const [cat, setCat] = useState("food");
  const [amt, setAmt] = useState("");

  function add() {
    const n = Number(amt);
    if (n > 0) {
      onSetBudget(cat, n);
      setAmt("");
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2
        className="text-xs font-semibold uppercase tracking-widest"
        style={{ color: "var(--pc-ink)", opacity: 0.5 }}
      >
        Budgets
      </h2>

      {nudges.length > 0 && (
        <div
          className="flex flex-col gap-1 px-4 py-3 text-sm"
          style={{ background: "#FCE3C3", borderRadius: "var(--pc-radius)", color: "var(--pc-ink)" }}
        >
          {nudges.map((n, i) => (
            <span key={i}>{n}</span>
          ))}
        </div>
      )}

      {statuses.map((s) => {
        const pct = Math.min(s.pct, 1) * 100;
        return (
          <div
            key={s.category_id}
            className="px-4 py-3"
            style={{ background: "rgba(255,255,255,0.8)", borderRadius: "var(--pc-radius)" }}
          >
            <div className="flex items-center justify-between mb-2 text-sm" style={{ color: "var(--pc-ink)" }}>
              <span>
                {s.emoji} {s.label}
              </span>
              <span className="pc-tabular" style={{ opacity: 0.7 }}>
                {inr(s.spent)} / {inr(s.limit)}
              </span>
            </div>
            <div style={{ height: 8, borderRadius: 999, background: "rgba(0,0,0,0.06)" }}>
              <div
                style={{
                  width: `${pct}%`,
                  height: "100%",
                  borderRadius: 999,
                  background: s.over ? "#E08B8B" : s.color ?? "var(--pc-other)",
                  transition: "width 300ms",
                }}
              />
            </div>
          </div>
        );
      })}

      {/* Add / edit a budget */}
      <div className="flex items-center gap-2">
        <select
          aria-label="Budget category"
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          className="text-sm rounded-md px-2 py-2"
          style={{ background: "rgba(255,255,255,0.9)", border: "1px solid rgba(0,0,0,0.08)", color: "var(--pc-ink)" }}
        >
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.emoji} {c.label}
            </option>
          ))}
        </select>
        <input
          type="number"
          inputMode="numeric"
          value={amt}
          onChange={(e) => setAmt(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Monthly limit ₹"
          aria-label="Monthly budget limit"
          className="text-sm rounded-md px-3 py-2 flex-1 min-w-0"
          style={{ background: "rgba(255,255,255,0.9)", border: "1px solid rgba(0,0,0,0.08)", color: "var(--pc-ink)" }}
        />
        <button
          onClick={add}
          className="text-sm font-semibold px-4 py-2 rounded-md"
          style={{ background: "#CDEAD9", color: "var(--pc-ink)", border: "none", cursor: "pointer" }}
        >
          Set
        </button>
      </div>
    </section>
  );
}
