"use client";

import { useMemo, useState } from "react";
import { type CategoryTotal, inr } from "@/lib/api";

const R = 52, STROKE = 22, C = 2 * Math.PI * R, SIZE = 140;

export function CategoryDonut({ categories }: { categories: CategoryTotal[] }) {
  const [active, setActive] = useState<number | null>(null);
  const data = useMemo(
    () => [...categories].map((c) => ({ ...c, total: Number(c.total) })).filter((c) => c.total > 0).sort((a, b) => b.total - a.total).slice(0, 8),
    [categories]
  );
  const sum = data.reduce((s, c) => s + c.total, 0);
  if (sum === 0) {
    return <div className="pc-card" style={{ padding: 20 }}><h3 className="pc-h3" style={{ fontSize: "0.9375rem" }}>Category split</h3><p style={{ color: "var(--pc-ink-3)", fontSize: "0.875rem", marginTop: 12 }}>No spend yet.</p></div>;
  }
  let running = 0;
  const arcs = data.map((c, i) => {
    const frac = c.total / sum;
    const seg = { c, i, dash: frac * C, offset: running };
    running += frac * C;
    return seg;
  });
  const focus = active != null ? data[active] : null;

  return (
    <div className="pc-card pc-card-hover" style={{ padding: 20 }}>
      <h3 className="pc-h3" style={{ fontSize: "0.9375rem", marginBottom: 12 }}>Category split</h3>
      <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Spending by category donut chart" style={{ flexShrink: 0 }}>
          <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
            {arcs.map(({ c, i, dash, offset }) => (
              <circle key={c.category_id} cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none"
                stroke={c.color ?? "var(--pc-other)"} strokeWidth={active === i ? STROKE + 4 : STROKE}
                strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-offset}
                onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}
                style={{ transition: "stroke-width 120ms", cursor: "default" }} />
            ))}
          </g>
          <text x="50%" y="46%" textAnchor="middle" fontSize="11" fill="var(--pc-ink-3)">{focus ? focus.label : "Total"}</text>
          <text x="50%" y="60%" textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--pc-ink)" className="pc-tabular">
            {inr(focus ? focus.total : sum)}
          </text>
        </svg>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 140 }}>
          {data.map((c, i) => (
            <li key={c.category_id} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}
              style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.8125rem", opacity: active == null || active === i ? 1 : 0.5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: c.color ?? "var(--pc-other)", flexShrink: 0 }} aria-hidden="true" />
              <span style={{ color: "var(--pc-ink-2)", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.emoji} {c.label}</span>
              <span className="pc-tabular" style={{ color: "var(--pc-ink)", fontWeight: 600 }}>{Math.round((c.total / sum) * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
