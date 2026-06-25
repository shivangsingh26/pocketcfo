import { inr } from "@/lib/api";
import { TrendingUp } from "lucide-react";

interface HeroCardProps {
  total: number;
  txnCount?: number;
  period?: string;
}

export function HeroCard({ total, txnCount, period }: HeroCardProps) {
  return (
    <div
      className="pc-glass"
      style={{ borderRadius: "var(--pc-radius-lg)", padding: "28px 32px" }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <p className="pc-label" style={{ marginBottom: 10 }}>
            {period ? `Spent · ${period}` : "Total Spent"}
          </p>
          <p
            className="pc-h1 pc-tabular"
            style={{ fontSize: "clamp(1.75rem, 5vw, 2.75rem)", lineHeight: 1.1 }}
          >
            {inr(total)}
          </p>
          {txnCount != null && txnCount > 0 && (
            <p style={{ marginTop: 8, fontSize: "0.875rem", color: "var(--pc-ink-2)" }}>
              across{" "}
              <span className="pc-tabular" style={{ fontWeight: 600 }}>
                {txnCount.toLocaleString("en-IN")}
              </span>{" "}
              {txnCount === 1 ? "transaction" : "transactions"}
            </p>
          )}
        </div>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            background: "var(--pc-accent-soft)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
          aria-hidden="true"
        >
          <TrendingUp size={22} strokeWidth={1.8} color="var(--pc-accent)" />
        </div>
      </div>
    </div>
  );
}
