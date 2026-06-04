import { inr } from "@/lib/api";

interface HeroCardProps {
  total: string | number;
  period?: string;
}

export function HeroCard({ total, period }: HeroCardProps) {
  return (
    <div
      className="pc-glass pc-tabular w-full p-8"
      style={{ borderRadius: "var(--pc-radius)" }}
    >
      <p
        className="text-sm font-medium uppercase tracking-widest mb-3"
        style={{ color: "var(--pc-ink)", opacity: 0.55 }}
      >
        Spent this period
        {period ? <span className="ml-2 normal-case opacity-70">{period}</span> : null}
      </p>
      <p
        className="text-5xl font-bold leading-none"
        style={{ color: "var(--pc-ink)" }}
      >
        {inr(total)}
      </p>
    </div>
  );
}
