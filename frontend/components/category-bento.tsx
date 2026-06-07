import { type CategoryTotal, inr } from "@/lib/api";
import { BentoSkeleton } from "@/components/skeletons";

interface CategoryBentoProps {
  categories: CategoryTotal[];
  loading?: boolean;
}

export function CategoryBento({ categories, loading }: CategoryBentoProps) {
  if (loading) return <BentoSkeleton />;

  if (categories.length === 0) {
    return (
      <p style={{ color: "var(--pc-ink-3)", fontSize: "0.875rem" }}>
        No category data — sync or upload transactions to populate.
      </p>
    );
  }

  return (
    <div
      role="list"
      aria-label="Spending by category"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(138px, 1fr))",
        gap: 12,
      }}
    >
      {categories.map((cat) => (
        <div
          key={cat.category_id}
          role="listitem"
          className="pc-card-hover pc-tabular"
          style={{
            borderRadius: "var(--pc-radius)",
            background: cat.color ?? "var(--pc-other)",
            padding: "14px 16px",
            border: "1px solid rgba(255,255,255,0.50)",
            boxShadow: "var(--pc-shadow-sm)",
            display: "flex",
            flexDirection: "column",
            gap: 4,
            cursor: "default",
          }}
          aria-label={`${cat.label}: ${inr(cat.total)}`}
        >
          <span style={{ fontSize: "1.375rem", lineHeight: 1 }} aria-hidden="true">
            {cat.emoji ?? "💳"}
          </span>
          <span
            className="pc-label"
            style={{ marginTop: 6, color: "var(--pc-ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {cat.label}
          </span>
          <span style={{ fontSize: "1.0625rem", fontWeight: 700, color: "var(--pc-ink)", lineHeight: 1.2 }}>
            {inr(cat.total)}
          </span>
        </div>
      ))}
    </div>
  );
}
