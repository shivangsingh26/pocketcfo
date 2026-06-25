"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getSummary,
  getTransactions,
  getBudgets,
  setBudget,
  recategorize,
  type CategoryTotal,
  type Txn,
  type BudgetStatus,
} from "@/lib/api";
import { SyncUpload } from "@/components/sync-upload";
import { OverviewView } from "@/components/overview-view";
import { TransactionsView } from "@/components/transactions-view";
import { BudgetsView } from "@/components/budgets-view";
import { InsightsView } from "@/components/insights-view";
import { ThemeToggle } from "@/components/theme-toggle";
import { isDemo, sampleCategories, sampleTransactions, sampleBudgets } from "@/lib/sample-data";
import {
  LayoutDashboard,
  List,
  Target,
  Sparkles,
  Menu,
  X,
  AlertTriangle,
} from "lucide-react";

type View = "overview" | "transactions" | "budgets" | "insights";
type LoadState = "loading" | "empty" | "error" | "ready";

const NAV_ITEMS: { id: View; label: string; Icon: React.ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean | "true" }> }[] = [
  { id: "overview",     label: "Overview",     Icon: LayoutDashboard },
  { id: "transactions", label: "Transactions", Icon: List },
  { id: "budgets",      label: "Budgets",      Icon: Target },
  { id: "insights",     label: "Insights",     Icon: Sparkles },
];

export function AppShell() {
  const [view, setView] = useState<View>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [categories, setCategories] = useState<CategoryTotal[]>([]);
  const [transactions, setTransactions] = useState<Txn[]>([]);
  const [budgetStatuses, setBudgetStatuses] = useState<BudgetStatus[]>([]);
  const [nudges, setNudges] = useState<string[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const cancelRef = useRef<boolean>(false);

  const refresh = useCallback(async () => {
    cancelRef.current = false;
    setLoadState((prev) => (prev === "error" || prev === "empty" ? "loading" : prev));
    if (isDemo()) {
      const cats = sampleCategories();
      const txns = sampleTransactions();
      const bdg = sampleBudgets();
      setCategories(cats);
      setTransactions(txns);
      setBudgetStatuses(bdg.statuses);
      setNudges(bdg.nudges);
      setLoadState("ready");
      return;
    }
    try {
      const [cats, txns, bdg] = await Promise.all([
        getSummary(),
        getTransactions(),
        getBudgets(),
      ]);
      if (cancelRef.current) return;
      setCategories(cats);
      setTransactions(txns);
      setBudgetStatuses(bdg.statuses);
      setNudges(bdg.nudges);
      setLoadState(cats.length === 0 && txns.length === 0 ? "empty" : "ready");
    } catch (err) {
      if (cancelRef.current) return;
      setErrorMsg(err instanceof Error ? err.message : "Unknown error");
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    // Initial data load on mount. refresh() updates state after its async
    // fetch (or synchronously in demo mode); this is the standard mount-fetch
    // idiom and intentionally exempt from set-state-in-effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    return () => { cancelRef.current = true; };
  }, [refresh]);

  const handleRecategorize = useCallback(
    async (id: string, categoryId: string) => {
      let undo: Txn[] | null = null;
      setTransactions((prev) => {
        undo = prev;
        return prev.map((t) => (String(t.id) === String(id) ? { ...t, category_id: categoryId } : t));
      });
      try {
        await recategorize(id, categoryId);
        if (!isDemo()) {
          const [cats, bdg] = await Promise.all([getSummary(), getBudgets()]);
          setCategories(cats);
          setBudgetStatuses(bdg.statuses);
          setNudges(bdg.nudges);
        }
      } catch {
        if (undo) setTransactions(undo); // revert on failure
      }
    },
    []
  );

  const handleSetBudget = useCallback(
    async (categoryId: string, limit: number) => {
      await setBudget(categoryId, limit);
      await refresh();
    },
    [refresh]
  );

  const isLoading = loadState === "loading";

  // Close mobile sidebar when navigating
  function navigate(v: View) {
    setView(v);
    setSidebarOpen(false);
  }

  const currentPeriod = new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "var(--pc-bg)" }}>
      {/* ── Sidebar (desktop persistent, mobile drawer) ── */}
      <>
        {/* Mobile overlay */}
        {sidebarOpen && (
          <button
            className="sidebar-overlay"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation"
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(46,42,38,0.35)",
              zIndex: 40,
              border: "none",
              cursor: "default",
            }}
          />
        )}

        <aside
          aria-label="Main navigation"
          style={{
            width: "var(--pc-sidebar-w)",
            background: "var(--pc-bg-2)",
            borderRight: "1px solid var(--pc-border)",
            display: "flex",
            flexDirection: "column",
            padding: "0 12px",
            flexShrink: 0,
            zIndex: 50,
            transition: "transform 250ms cubic-bezier(.4,0,.2,1)",
          }}
          className="app-sidebar"
          data-open={sidebarOpen}
        >
          {/* Logo */}
          <div
            style={{
              height: "var(--pc-topbar-h)",
              display: "flex",
              alignItems: "center",
              gap: 10,
              paddingLeft: 4,
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: "var(--pc-ink)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              aria-hidden="true"
            >
              <span style={{ color: "#F4F1EA", fontSize: "0.875rem", fontWeight: 700 }}>P</span>
            </div>
            <span style={{ fontWeight: 700, fontSize: "1rem", color: "var(--pc-ink)", letterSpacing: "-0.01em" }}>
              PocketCFO
            </span>
          </div>

          {/* Nav items */}
          <nav aria-label="App views" style={{ flex: 1 }}>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 2 }}>
              {NAV_ITEMS.map(({ id, label, Icon }) => (
                <li key={id}>
                  <button
                    onClick={() => navigate(id)}
                    className={`pc-nav-item ${view === id ? "active" : ""}`}
                    aria-current={view === id ? "page" : undefined}
                  >
                    <Icon size={17} strokeWidth={view === id ? 2.2 : 1.8} aria-hidden />
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* Footer */}
          <div style={{ paddingBottom: 16, paddingTop: 8 }}>
            <p className="pc-label" style={{ paddingLeft: 4, paddingBottom: 6 }}>
              {currentPeriod}
            </p>
            {loadState === "error" && (
              <div
                style={{
                  background: "var(--pc-danger-bg)",
                  borderRadius: "var(--pc-radius-sm)",
                  padding: "8px 10px",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 6,
                }}
              >
                <AlertTriangle size={13} strokeWidth={2} color="var(--pc-danger)" style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
                <p style={{ fontSize: "0.75rem", color: "var(--pc-danger)", margin: 0, lineHeight: 1.4 }}>
                  Backend unreachable. Run <code style={{ fontSize: "0.7rem" }}>vercel dev</code> to connect.
                </p>
              </div>
            )}
          </div>
        </aside>
      </>

      {/* ── Main area ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Topbar */}
        <header
          style={{
            height: "var(--pc-topbar-h)",
            background: "rgba(244,241,234,0.88)",
            backdropFilter: "blur(10px)",
            borderBottom: "1px solid var(--pc-border)",
            display: "flex",
            alignItems: "center",
            padding: "0 20px",
            gap: 16,
            flexShrink: 0,
            zIndex: 30,
          }}
          aria-label="Top navigation"
        >
          {/* Hamburger (mobile only) */}
          <button
            className="pc-btn pc-btn-ghost sidebar-toggle"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label={sidebarOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={sidebarOpen}
            style={{ padding: "6px 8px", display: "none" }}
          >
            {sidebarOpen ? <X size={18} strokeWidth={2} aria-hidden="true" /> : <Menu size={18} strokeWidth={2} aria-hidden="true" />}
          </button>

          {/* Mobile logo (hidden on desktop where sidebar shows it) */}
          <span
            className="mobile-logo"
            style={{ fontWeight: 700, fontSize: "1rem", color: "var(--pc-ink)", letterSpacing: "-0.01em", display: "none" }}
            aria-hidden="true"
          >
            PocketCFO
          </span>

          {/* Page title */}
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--pc-ink)", margin: 0 }}>
              {NAV_ITEMS.find((n) => n.id === view)?.label}
            </h1>
            <p style={{ fontSize: "0.75rem", color: "var(--pc-ink-3)", margin: 0, lineHeight: 1 }}>
              {currentPeriod}
            </p>
          </div>

          {/* Theme toggle + Sync + Upload */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <ThemeToggle />
            <SyncUpload onChanged={refresh} />
          </div>
        </header>

        {/* Scrollable content area */}
        <main
          id="main-content"
          className="pc-scroll"
          style={{ flex: 1, overflowY: "auto", padding: "28px 32px 48px" }}
          aria-label={`${NAV_ITEMS.find((n) => n.id === view)?.label} view`}
        >
         <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%" }}>
          {/* Error banner (full error state, non-blocking) */}
          {loadState === "error" && (
            <div
              role="alert"
              style={{
                background: "var(--pc-warn-bg)",
                borderRadius: "var(--pc-radius-sm)",
                padding: "10px 14px",
                marginBottom: 20,
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: "0.875rem",
                color: "var(--pc-ink)",
                border: "1px solid rgba(46,42,38,0.08)",
              }}
            >
              <AlertTriangle size={15} strokeWidth={2} color="var(--pc-danger)" aria-hidden="true" />
              <span>
                Backend not reachable ({errorMsg}). Showing empty state — start the API or upload a statement.
              </span>
              <button onClick={refresh} className="pc-btn pc-btn-ghost" style={{ marginLeft: "auto", padding: "4px 10px" }}>
                Retry
              </button>
            </div>
          )}

          {view === "overview" && (
            <OverviewView
              categories={categories}
              transactions={transactions}
              budgetStatuses={budgetStatuses}
              nudges={nudges}
              loading={isLoading}
            />
          )}

          {view === "transactions" && (
            <TransactionsView
              transactions={transactions}
              loading={isLoading}
              onRecategorize={handleRecategorize}
            />
          )}

          {view === "budgets" && (
            <BudgetsView
              statuses={budgetStatuses}
              nudges={nudges}
              loading={isLoading}
              onSetBudget={handleSetBudget}
            />
          )}

          {view === "insights" && (
            <InsightsView transactions={transactions} loading={isLoading} />
          )}
         </div>
        </main>
      </div>

      {/* ── Responsive CSS ── */}
      <style>{`
        /* Desktop: sidebar always visible */
        .app-sidebar {
          position: static !important;
          transform: none !important;
        }
        .sidebar-toggle,
        .mobile-logo {
          display: none !important;
        }

        /* Tablet/mobile breakpoint */
        @media (max-width: 768px) {
          .app-sidebar {
            position: fixed !important;
            top: 0;
            left: 0;
            bottom: 0;
            /* !important needed so the desktop base rule (transform:none
               !important) does not keep the drawer on-screen on mobile. */
            transform: translateX(-100%) !important;
          }
          .app-sidebar[data-open="true"] {
            transform: translateX(0) !important;
          }
          .sidebar-toggle {
            display: flex !important;
          }
          .mobile-logo {
            display: block !important;
          }
          main {
            padding: 16px !important;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .app-sidebar { transition: none !important; }
        }
      `}</style>
    </div>
  );
}
