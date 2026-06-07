"use client";

import { useMemo, useState } from "react";
import { type Txn, inr } from "@/lib/api";
import { ChartSkeleton } from "@/components/skeletons";

interface SpendTrendChartProps {
  transactions: Txn[];
  loading?: boolean;
}

interface DayPoint {
  label: string;         // "Mon 2", "Tue 3", etc.
  date: string;          // "2026-06-02"
  debit: number;
}

function buildDailyPoints(transactions: Txn[], days: number): DayPoint[] {
  const now = new Date();
  const points: DayPoint[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayName = d.toLocaleDateString("en-IN", { weekday: "short" });
    const dayNum = d.getDate();
    points.push({ label: `${dayName} ${dayNum}`, date: dateStr, debit: 0 });
  }

  const pointMap = new Map(points.map((p) => [p.date, p]));

  for (const txn of transactions) {
    if (txn.direction !== "debit") continue;
    const date = txn.occurred_at.slice(0, 10);
    const pt = pointMap.get(date);
    if (pt) pt.debit += Number(txn.amount);
  }

  return points;
}

const W = 560;
const H = 140;
const PAD_LEFT = 52;
const PAD_RIGHT = 16;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;
const CHART_W = W - PAD_LEFT - PAD_RIGHT;
const CHART_H = H - PAD_TOP - PAD_BOTTOM;

export function SpendTrendChart({ transactions, loading }: SpendTrendChartProps) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; point: DayPoint } | null>(null);
  const [days, setDays] = useState<7 | 14 | 30>(14);

  const points = useMemo(
    () => buildDailyPoints(transactions, days),
    [transactions, days]
  );

  const maxVal = useMemo(() => Math.max(...points.map((p) => p.debit), 1), [points]);

  const hasData = points.some((p) => p.debit > 0);

  // Map data points to SVG coordinates
  const coords = useMemo<{ x: number; y: number }[]>(() => {
    return points.map((p, i) => ({
      x: PAD_LEFT + (i / Math.max(points.length - 1, 1)) * CHART_W,
      y: PAD_TOP + CHART_H - (p.debit / maxVal) * CHART_H,
    }));
  }, [points, maxVal]);

  // Build path strings
  const linePath = coords
    .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(" ");

  const areaPath =
    coords.length > 0
      ? `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${(PAD_TOP + CHART_H).toFixed(1)} L ${PAD_LEFT.toFixed(1)} ${(PAD_TOP + CHART_H).toFixed(1)} Z`
      : "";

  // Y-axis ticks (3)
  const yTicks = [0, 0.5, 1].map((f) => ({
    y: PAD_TOP + CHART_H - f * CHART_H,
    label: inr(maxVal * f),
  }));

  // X-axis labels — show every nth label to avoid crowding
  const step = days <= 7 ? 1 : days <= 14 ? 2 : 5;
  const xLabels = points
    .map((p, i) => ({ i, label: p.label }))
    .filter((_, i) => i % step === 0 || i === points.length - 1);

  if (loading) return <ChartSkeleton height={H + 48} />;

  return (
    <div className="pc-card pc-card-hover" style={{ padding: "20px 20px 12px" }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="pc-h3" style={{ fontSize: "0.9375rem" }}>Daily Spend</h3>
        <div className="flex gap-1">
          {([7, 14, 30] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`pc-chip ${days === d ? "active" : ""}`}
              style={{ fontSize: "0.75rem", padding: "3px 10px" }}
              aria-pressed={days === d}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {!hasData ? (
        <div
          style={{ height: H, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <p style={{ color: "var(--pc-ink-3)", fontSize: "0.875rem" }}>No spend data for this period</p>
        </div>
      ) : (
        <div style={{ position: "relative" }}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            height={H}
            aria-label="Daily debit spend trend chart"
            role="img"
            style={{ display: "block", overflow: "visible" }}
            onMouseLeave={() => setTooltip(null)}
          >
            <defs>
              <linearGradient id="area-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2E2A26" stopOpacity="0.15" />
                <stop offset="100%" stopColor="#2E2A26" stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {/* Grid lines */}
            {yTicks.map((t, i) => (
              <g key={i}>
                <line
                  x1={PAD_LEFT}
                  y1={t.y}
                  x2={W - PAD_RIGHT}
                  y2={t.y}
                  stroke="rgba(46,42,38,0.07)"
                  strokeWidth="1"
                  strokeDasharray={i === 0 ? "0" : "3 3"}
                />
                <text
                  x={PAD_LEFT - 6}
                  y={t.y + 4}
                  textAnchor="end"
                  fontSize="10"
                  fill="var(--pc-ink-3)"
                  fontFamily="inherit"
                >
                  {t.label}
                </text>
              </g>
            ))}

            {/* Area fill */}
            {areaPath && (
              <path d={areaPath} fill="url(#area-gradient)" />
            )}

            {/* Line */}
            {linePath && (
              <path
                d={linePath}
                fill="none"
                stroke="var(--pc-ink)"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}

            {/* X-axis labels */}
            {xLabels.map(({ i, label }) => (
              <text
                key={i}
                x={coords[i]?.x ?? 0}
                y={H - 4}
                textAnchor="middle"
                fontSize="10"
                fill="var(--pc-ink-3)"
                fontFamily="inherit"
              >
                {label}
              </text>
            ))}

            {/* Interactive hit targets + dots */}
            {coords.map((c, i) => (
              <g key={i}>
                {/* Wide invisible hit area */}
                <rect
                  x={c.x - CHART_W / points.length / 2}
                  y={PAD_TOP}
                  width={CHART_W / points.length}
                  height={CHART_H}
                  fill="transparent"
                  style={{ cursor: "crosshair" }}
                  onMouseEnter={() => setTooltip({ x: c.x, y: c.y, point: points[i] })}
                />
                {/* Dot — only show on hover or for non-zero values */}
                {(points[i].debit > 0 || (tooltip && tooltip.point === points[i])) && (
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r={tooltip?.point === points[i] ? 5 : 3}
                    fill="var(--pc-ink)"
                    stroke="var(--pc-bg)"
                    strokeWidth="2"
                    style={{ transition: "r 100ms" }}
                  />
                )}
              </g>
            ))}
          </svg>

          {/* Tooltip */}
          {tooltip && (
            <div
              role="tooltip"
              style={{
                position: "absolute",
                left: `calc(${((tooltip.x - PAD_LEFT) / (W - PAD_LEFT - PAD_RIGHT)) * 100}% + ${PAD_LEFT}px)`,
                top: tooltip.y - 8,
                transform: "translate(-50%, -100%)",
                background: "rgba(46,42,38,0.90)",
                backdropFilter: "blur(6px)",
                color: "#F4F1EA",
                borderRadius: 8,
                padding: "6px 10px",
                fontSize: "0.75rem",
                fontWeight: 600,
                whiteSpace: "nowrap",
                pointerEvents: "none",
                zIndex: 10,
              }}
            >
              <div style={{ opacity: 0.7, marginBottom: 1 }}>{tooltip.point.label}</div>
              <div className="pc-tabular">{inr(tooltip.point.debit)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
