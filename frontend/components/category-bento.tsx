import { type CategoryTotal, inr } from "@/lib/api";

interface CategoryBentoProps {
  categories: CategoryTotal[];
}

export function CategoryBento({ categories }: CategoryBentoProps) {
  if (categories.length === 0) return null;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
        gap: "12px",
      }}
    >
      {categories.map((cat) => (
        <div
          key={cat.category_id}
          className="pc-tabular flex flex-col gap-1 p-4 transition-transform hover:scale-[1.02]"
          style={{
            borderRadius: "var(--pc-radius)",
            background: cat.color ?? "var(--pc-other)",
          }}
        >
          <span className="text-2xl leading-none">
            {cat.emoji ?? "💳"}
          </span>
          <span
            className="text-xs font-semibold uppercase tracking-wide mt-1 truncate"
            style={{ color: "var(--pc-ink)", opacity: 0.65 }}
          >
            {cat.label}
          </span>
          <span
            className="text-lg font-bold leading-snug"
            style={{ color: "var(--pc-ink)" }}
          >
            {inr(cat.total)}
          </span>
        </div>
      ))}
    </div>
  );
}
