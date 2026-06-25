"use client";

import { useMemo, useState } from "react";
import { Search, Filter, ArrowDownLeft, ArrowUpRight, Download } from "lucide-react";
import { type Txn, CATEGORIES, categoryMeta, inr } from "@/lib/api";
import { toDayKey, dayLabel } from "@/lib/date";
import { toCsv, downloadCsv } from "@/lib/csv";
import { TransactionRowSkeleton } from "@/components/skeletons";

interface TransactionsViewProps {
  transactions: Txn[];
  loading?: boolean;
  onRecategorize: (id: string, categoryId: string) => Promise<void> | void;
}

type DateRange = "7d" | "30d" | "90d" | "all";
type Direction = "all" | "debit" | "credit";

interface FilterState {
  range: DateRange;
  direction: Direction;
  category: string;   // "" = all
  merchant: string;
}

/** Extract HH:MM from ISO timestamp */
function txnTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return "";
  }
}

const SOURCE_LABELS: Record<string, string> = {
  gmail: "Gmail",
  sms: "SMS",
  csv: "CSV",
  pdf: "PDF",
};

function SourceBadge({ source }: { source: string }) {
  return (
    <span className={`pc-badge pc-badge-${source}`} title={`Source: ${SOURCE_LABELS[source] ?? source}`}>
      {SOURCE_LABELS[source] ?? source}
    </span>
  );
}

function cutoffDate(range: DateRange): Date | null {
  if (range === "all") return null;
  const d = new Date();
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function TransactionsView({ transactions, loading, onRecategorize }: TransactionsViewProps) {
  const [filters, setFilters] = useState<FilterState>({
    range: "30d",
    direction: "all",
    category: "",
    merchant: "",
  });
  const [recatInFlight, setRecatInFlight] = useState<Set<string>>(new Set());

  function patch<K extends keyof FilterState>(key: K, val: FilterState[K]) {
    setFilters((prev) => ({ ...prev, [key]: val }));
  }

  async function handleRecategorize(id: string, categoryId: string) {
    setRecatInFlight((s) => new Set(s).add(id));
    try {
      await onRecategorize(id, categoryId);
    } finally {
      setRecatInFlight((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
  }

  const cutoff = useMemo(() => cutoffDate(filters.range), [filters.range]);

  // Filter transactions
  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (cutoff) {
        const d = new Date(t.occurred_at);
        if (isNaN(d.getTime()) || d < cutoff) return false;
      }
      if (filters.direction !== "all" && t.direction !== filters.direction) return false;
      if (filters.category && t.category_id !== filters.category) return false;
      if (filters.merchant) {
        const q = filters.merchant.toLowerCase().trim();
        const merchantHit = (t.merchant ?? "").toLowerCase().includes(q);
        const digits = q.replace(/[^0-9]/g, "");
        const amountHit = digits !== "" && String(Math.round(Number(t.amount))).includes(digits);
        if (!merchantHit && !amountHit) return false;
      }
      return true;
    });
  }, [transactions, cutoff, filters]);

  // Group by date (newest-first)
  const groups = useMemo(() => {
    const map = new Map<string, Txn[]>();
    for (const t of filtered) {
      const dateKey = toDayKey(t.occurred_at);
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push(t);
    }
    // Sort days newest-first
    const sorted = [...map.entries()].sort(([a], [b]) => b.localeCompare(a));
    return sorted;
  }, [filtered]);

  const totalDebit = useMemo(
    () => filtered.filter((t) => t.direction === "debit").reduce((sum, t) => sum + Number(t.amount), 0),
    [filtered]
  );
  const totalCredit = useMemo(
    () => filtered.filter((t) => t.direction === "credit").reduce((sum, t) => sum + Number(t.amount), 0),
    [filtered]
  );

  function handleExport() {
    const rows = filtered.map((t) => {
      const d = new Date(t.occurred_at);
      return {
        date: toDayKey(t.occurred_at),
        time: isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false }),
        merchant: t.merchant ?? "",
        category: categoryMeta(t.category_id).label,
        direction: t.direction,
        amount: Math.round(Number(t.amount)),
        source: t.source,
      };
    });
    const csv = toCsv(rows, [
      { key: "date", header: "Date" }, { key: "time", header: "Time" },
      { key: "merchant", header: "Merchant" }, { key: "category", header: "Category" },
      { key: "direction", header: "Direction" }, { key: "amount", header: "Amount (INR)" },
      { key: "source", header: "Source" },
    ]);
    downloadCsv(`pocketcfo-transactions-${toDayKey(new Date())}.csv`, csv);
  }

  const rangeOptions: { val: DateRange; label: string }[] = [
    { val: "7d", label: "7d" },
    { val: "30d", label: "30d" },
    { val: "90d", label: "90d" },
    { val: "all", label: "All" },
  ];

  const directionOptions: { val: Direction; label: string }[] = [
    { val: "all", label: "All" },
    { val: "debit", label: "Debits" },
    { val: "credit", label: "Credits" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <h2 className="pc-h2">Transactions</h2>
          <p style={{ color: "var(--pc-ink-2)", fontSize: "0.875rem", marginTop: 4 }}>
            {loading ? "Loading…" : `${filtered.length.toLocaleString("en-IN")} transactions`}
            {!loading && filtered.length > 0 && (
              <span className="pc-tabular">
                {" "}· {inr(totalDebit)} spent
                {totalCredit > 0 && ` · ${inr(totalCredit)} received`}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={loading || filtered.length === 0}
          className="pc-btn pc-btn-ghost"
          aria-label="Export filtered transactions as CSV"
        >
          <Download size={14} strokeWidth={2} aria-hidden="true" /> Export CSV
        </button>
      </div>

      {/* Filter bar */}
      <div
        className="pc-card"
        style={{ padding: "14px 16px", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}
        aria-label="Filter transactions"
      >
        {/* Date range */}
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <Filter size={13} strokeWidth={2} color="var(--pc-ink-3)" aria-hidden="true" style={{ marginRight: 2 }} />
          {rangeOptions.map((o) => (
            <button
              key={o.val}
              onClick={() => patch("range", o.val)}
              className={`pc-chip ${filters.range === o.val ? "active" : ""}`}
              aria-pressed={filters.range === o.val}
            >
              {o.label}
            </button>
          ))}
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 22, background: "var(--pc-border-strong)", flexShrink: 0 }} aria-hidden="true" />

        {/* Direction */}
        <div style={{ display: "flex", gap: 4 }}>
          {directionOptions.map((o) => (
            <button
              key={o.val}
              onClick={() => patch("direction", o.val)}
              className={`pc-chip ${filters.direction === o.val ? "active" : ""}`}
              aria-pressed={filters.direction === o.val}
            >
              {o.label}
            </button>
          ))}
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 22, background: "var(--pc-border-strong)", flexShrink: 0 }} aria-hidden="true" />

        {/* Category select */}
        <select
          value={filters.category}
          onChange={(e) => patch("category", e.target.value)}
          className="pc-select"
          aria-label="Filter by category"
          style={{ minWidth: 120 }}
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.emoji} {c.label}
            </option>
          ))}
        </select>

        {/* Merchant search */}
        <div style={{ position: "relative", flex: "1 1 160px", minWidth: 140 }}>
          <Search
            size={13}
            strokeWidth={2}
            color="var(--pc-ink-3)"
            aria-hidden="true"
            style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
          />
          <input
            type="search"
            value={filters.merchant}
            onChange={(e) => patch("merchant", e.target.value)}
            placeholder="Search merchant or amount…"
            aria-label="Search by merchant name or amount"
            className="pc-input"
            style={{ paddingLeft: 28, width: "100%" }}
          />
        </div>
      </div>

      {/* Transaction list */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {Array.from({ length: 8 }).map((_, i) => <TransactionRowSkeleton key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="pc-card" style={{ padding: "40px 24px", textAlign: "center" }}>
          <p style={{ color: "var(--pc-ink-2)", fontSize: "0.9375rem", fontWeight: 500, marginBottom: 6 }}>
            No transactions match your filters
          </p>
          <p style={{ color: "var(--pc-ink-3)", fontSize: "0.875rem" }}>
            Try widening the date range or clearing filters.
          </p>
          <button
            onClick={() => setFilters({ range: "all", direction: "all", category: "", merchant: "" })}
            className="pc-btn pc-btn-ghost"
            style={{ marginTop: 16 }}
          >
            Clear all filters
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {groups.map(([dateKey, txns]) => (
            <div key={dateKey}>
              <div className="pc-day-header" aria-label={`Transactions for ${dayLabel(dateKey)}`}>
                {dayLabel(dateKey)}{" "}
                <span className="pc-tabular" style={{ fontWeight: 400, opacity: 0.7 }}>
                  · {txns.length} {txns.length === 1 ? "txn" : "txns"}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 4 }}>
                {txns.map((txn) => (
                  <TransactionRow
                    key={txn.id}
                    txn={txn}
                    inFlight={recatInFlight.has(String(txn.id))}
                    onRecategorize={(catId) => handleRecategorize(String(txn.id), catId)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface TransactionRowProps {
  txn: Txn;
  inFlight: boolean;
  onRecategorize: (categoryId: string) => void;
}

function TransactionRow({ txn, inFlight, onRecategorize }: TransactionRowProps) {
  const isCredit = txn.direction === "credit";
  const time = txnTime(txn.occurred_at);

  return (
    <div
      className="pc-card pc-card-hover"
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", opacity: inFlight ? 0.6 : 1 }}
    >
      {/* Direction icon */}
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: "50%",
          background: isCredit ? "var(--pc-success-bg)" : "var(--pc-bg-2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
        aria-hidden="true"
      >
        {isCredit
          ? <ArrowUpRight size={14} strokeWidth={2.2} color="var(--pc-credit)" />
          : <ArrowDownLeft size={14} strokeWidth={2.2} color="var(--pc-ink-2)" />
        }
      </div>

      {/* Merchant + time */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontWeight: 600, fontSize: "0.875rem", color: "var(--pc-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {txn.merchant ?? "Unknown merchant"}
        </p>
        {time && (
          <p className="pc-tabular" style={{ fontSize: "0.75rem", color: "var(--pc-ink-3)", marginTop: 1 }}>
            {time}
          </p>
        )}
      </div>

      {/* Source badge */}
      <SourceBadge source={txn.source} />

      {/* Category dropdown */}
      <select
        value={txn.category_id}
        onChange={(e) => onRecategorize(e.target.value)}
        disabled={inFlight}
        aria-label={`Category for ${txn.merchant ?? "transaction"}`}
        className="pc-select"
        style={{ fontSize: "0.8125rem", padding: "4px 8px", minWidth: 120, maxWidth: 150, cursor: "pointer" }}
      >
        {CATEGORIES.map((c) => (
          <option key={c.id} value={c.id}>
            {c.emoji} {c.label}
          </option>
        ))}
      </select>

      {/* Amount */}
      <span
        className="pc-tabular"
        style={{
          fontSize: "0.9rem",
          fontWeight: 700,
          color: isCredit ? "var(--pc-credit)" : "var(--pc-ink)",
          whiteSpace: "nowrap",
          flexShrink: 0,
          minWidth: 72,
          textAlign: "right",
        }}
      >
        {isCredit ? "+" : "−"}{inr(txn.amount)}
      </span>
    </div>
  );
}
