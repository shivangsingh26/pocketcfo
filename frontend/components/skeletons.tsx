/** Reusable shimmer skeleton primitives */

interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({ className = "", style }: SkeletonProps) {
  return (
    <div
      className={`pc-skeleton ${className}`}
      role="presentation"
      aria-hidden="true"
      style={style}
    />
  );
}

export function HeroSkeleton() {
  return (
    <div className="pc-glass p-8" style={{ borderRadius: "var(--pc-radius-lg)" }}>
      <Skeleton style={{ width: 160, height: 14, marginBottom: 16 }} />
      <Skeleton style={{ width: 280, height: 52, marginBottom: 12 }} />
      <Skeleton style={{ width: 120, height: 14 }} />
    </div>
  );
}

export function BentoSkeleton() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} style={{ height: 100, borderRadius: "var(--pc-radius)" }} />
      ))}
    </div>
  );
}

export function ChartSkeleton({ height = 160 }: { height?: number }) {
  return <Skeleton style={{ width: "100%", height, borderRadius: "var(--pc-radius)" }} />;
}

export function TransactionRowSkeleton() {
  return (
    <div
      className="pc-card flex items-center gap-3 px-4 py-3"
      aria-hidden="true"
    >
      <div className="flex-1 flex flex-col gap-2">
        <Skeleton style={{ width: "55%", height: 13 }} />
        <Skeleton style={{ width: "35%", height: 11 }} />
      </div>
      <Skeleton style={{ width: 60, height: 13 }} />
      <Skeleton style={{ width: 72, height: 26, borderRadius: 6 }} />
      <Skeleton style={{ width: 64, height: 13 }} />
    </div>
  );
}

export function BudgetRowSkeleton() {
  return (
    <div className="pc-card px-4 py-3 flex flex-col gap-2" aria-hidden="true">
      <div className="flex justify-between">
        <Skeleton style={{ width: 120, height: 14 }} />
        <Skeleton style={{ width: 90, height: 14 }} />
      </div>
      <Skeleton style={{ width: "100%", height: 8, borderRadius: 999 }} />
    </div>
  );
}
