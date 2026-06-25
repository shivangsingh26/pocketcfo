"use client";

import { useMemo } from "react";
import { Repeat } from "lucide-react";
import { type Txn, inr } from "@/lib/api";
import { detectRecurring } from "@/lib/insights";

export function RecurringPanel({ transactions, compact }: { transactions: Txn[]; compact?: boolean }) {
  const items = useMemo(() => detectRecurring(transactions), [transactions]);
  const monthlyTotal = items.reduce((s, r) => s + r.monthlyEquivalent, 0);

  return (
    <div className="pc-card" style={{ padding: compact ? "16px 18px" : 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Repeat size={16} strokeWidth={2} color="var(--pc-accent)" aria-hidden="true" />
        <h3 className="pc-h3" style={{ fontSize: "0.9375rem" }}>Subscriptions</h3>
        {items.length > 0 && (
          <span className="pc-badge" style={{ marginLeft: "auto", background: "var(--pc-accent-soft)", color: "var(--pc-accent-strong)" }}>
            ≈ {inr(monthlyTotal)}/mo
          </span>
        )}
      </div>
      {items.length === 0 ? (
        <p style={{ color: "var(--pc-ink-3)", fontSize: "0.875rem" }}>No recurring charges detected yet.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {(compact ? items.slice(0, 3) : items).map((r) => (
            <li key={r.merchant} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 600, fontSize: "0.875rem", color: "var(--pc-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.merchant}</p>
                <p style={{ fontSize: "0.75rem", color: "var(--pc-ink-3)" }}>{r.cadence} · {r.count} charges · ~{inr(r.avgAmount)} each</p>
              </div>
              <span className="pc-tabular" style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--pc-ink)" }}>{inr(r.monthlyEquivalent)}<span style={{ fontSize: "0.7rem", color: "var(--pc-ink-3)" }}>/mo</span></span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
