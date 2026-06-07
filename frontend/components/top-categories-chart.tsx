"use client";

import { useMemo, useState } from "react";
import { type CategoryTotal, inr } from "@/lib/api";

interface TopCategoriesChartProps {
  categories: CategoryTotal[];
}

export function TopCategoriesChart({ categories }: TopCategoriesChartProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const sorted = useMemo(
    () =>
      [...categories]
        .sort((a, b) => Number(b.total) - Number(a.total))
        .slice(0, 6),
    [categories]
  );

  const maxTotal = useMemo(
    () => Math.max(...sorted.map((c) => Number(c.total)), 1),
    [sorted]
  );

  if (sorted.length === 0) {
    return (
      <div className="pc-card" style={{ padding: "20px" }}>
        <h3 className="pc-h3" style={{ fontSize: "0.9375rem", marginBottom: 12 }}>Top Categories</h3>
        <p style={{ color: "var(--pc-ink-3)", fontSize: "0.875rem" }}>No category data yet.</p>
      </div>
    );
  }

  return (
    <div className="pc-card pc-card-hover" style={{ padding: "20px" }}>
      <h3 className="pc-h3" style={{ fontSize: "0.9375rem", marginBottom: 16 }}>Top Categories</h3>
      <div role="list" aria-label="Top spending categories" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {sorted.map((cat) => {
          const pct = (Number(cat.total) / maxTotal) * 100;
          const isHovered = hoveredId === cat.category_id;

          return (
            <div
              key={cat.category_id}
              role="listitem"
              onMouseEnter={() => setHoveredId(cat.category_id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{ display: "flex", alignItems: "center", gap: 10, cursor: "default" }}
              aria-label={`${cat.label}: ${inr(cat.total)}`}
            >
              {/* Label col */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  width: 110,
                  flexShrink: 0,
                }}
              >
                <span style={{ fontSize: "1rem", lineHeight: 1 }} aria-hidden="true">
                  {cat.emoji ?? "💳"}
                </span>
                <span
                  style={{
                    fontSize: "0.8125rem",
                    fontWeight: 500,
                    color: "var(--pc-ink-2)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {cat.label}
                </span>
              </div>

              {/* Bar */}
              <div
                style={{
                  flex: 1,
                  height: 10,
                  background: "rgba(0,0,0,0.06)",
                  borderRadius: 999,
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    width: `${pct}%`,
                    height: "100%",
                    background: cat.color ?? "var(--pc-other)",
                    borderRadius: 999,
                    transition: "width 400ms cubic-bezier(.4,0,.2,1)",
                    filter: isHovered ? "brightness(0.88)" : "none",
                  }}
                />
              </div>

              {/* Amount */}
              <span
                className="pc-tabular"
                style={{
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  color: "var(--pc-ink)",
                  width: 72,
                  textAlign: "right",
                  flexShrink: 0,
                }}
              >
                {inr(cat.total)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
