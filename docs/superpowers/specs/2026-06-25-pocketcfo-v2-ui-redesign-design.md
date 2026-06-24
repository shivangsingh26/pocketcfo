# PocketCFO v2 — UI Redesign, Bug Fixes & Advanced Features

**Date:** 2026-06-25
**Status:** Approved design, pending spec review
**Scope:** Frontend (`frontend/`) overhaul + static backend bug fixes. No DB/schema changes, no new backend endpoints.

---

## 1. Goals

1. **Bolder visual redesign** of the Next.js app — new accent (indigo/violet `#5B4BE0`) over the warm-paper base, refined type/elevation, working dark mode.
2. **Four advanced features**: dark-mode toggle, recurring/subscription detection, search + filters + CSV export, forecast & insights.
3. **Fix all identified bugs** — frontend (runnable, verified) and backend (static review only; backend not reachable this session).

## 2. Constraints & context

- **No live backend.** Supabase + Anthropic creds are not available. Verification is frontend-only: `npm run build` + browser against empty states and a dev-only sample dataset.
- All four features **compute client-side** from data the existing API already returns (`/api/summary`, `/api/transactions`, `/api/budgets`). No backend changes required for features.
- Existing styling is inline-style heavy with a `--pc-*` design-token layer in `globals.css`. We keep the token approach but extend it (accent + dark) and extract shared keyframes.
- Delivery: **single feature branch**, reviewable commits per workstream. Do not push or open a PR unless the user asks.

## 3. Architecture

```
frontend/
  app/
    globals.css         # extend: accent tokens, .dark overrides for --pc-*, shared keyframes
    layout.tsx          # add theme bootstrap (no-flash inline script), suppressHydrationWarning
  lib/
    api.ts              # CATEGORIES helper extended; inr() NaN-guard; category lookup map
    sample-data.ts      # NEW — dev-only fixtures (txns, categories, budgets)
    insights.ts         # NEW — pure functions: recurring detect, forecast, MoM deltas
    theme.ts            # NEW — theme get/set/toggle + system-pref resolution
    csv.ts              # NEW — rows -> CSV string + browser download
    date.ts             # NEW — single local-date helpers (fixes UTC bucket bug)
  components/
    app-shell.tsx       # 4th nav item (Insights); theme toggle in topbar; optimistic recat; Retry
    theme-toggle.tsx    # NEW
    insights-view.tsx   # NEW — forecast cards, MoM movers, savings rate
    recurring-panel.tsx # NEW — detected subscriptions list + monthly total
    category-donut.tsx  # NEW — category split donut
    overview-view.tsx   # redesigned layout; donut; wire hero period
    transactions-view.tsx # search+amount, CSV export button
    budgets-view.tsx    # restyle to new tokens
    *-chart.tsx, hero-card, category-bento, sync-upload, skeletons  # restyle to new tokens
  api/main.py           # static fixes only
```

**Module boundaries (each independently testable):**
- `lib/insights.ts` — pure: `(Txn[]) -> { recurring, forecast, deltas }`. No React, no fetch.
- `lib/date.ts` — pure local-date helpers; the single source of truth for date→day-key.
- `lib/csv.ts` — pure serialize + one DOM download side-effect function.
- `lib/theme.ts` — reads/writes localStorage + `matchMedia`; no React state.
- View components stay presentational; data math lives in `lib/`.

## 4. Design system changes (`globals.css`)

- Add accent tokens: `--pc-accent: #5B4BE0`, `--pc-accent-ink` (on-accent text), `--pc-accent-soft` (tint for backgrounds/active states), `--pc-accent-ring`.
- Add `.dark` overrides for the whole `--pc-*` set (bg, ink scale, borders, card surfaces, accent stays vivid). Category pastels get slightly desaturated dark variants so cards stay legible on a dark canvas.
- Promote accent into: active nav pill, primary button, chart line/area, progress fills (non-alert), focus rings.
- Extract `@keyframes spin / bounce / pc-shimmer` into `globals.css`; remove per-component duplicate `<style>` keyframe blocks.
- Type scale nudge: larger hero, tighter section labels; consistent card radii/shadows via tokens.

## 5. Features

### 5.1 Dark mode toggle
- `lib/theme.ts`: `resolveTheme()` (stored value → else system), `applyTheme(t)` (toggle `.dark` on `<html>`, set `color-scheme`), `setTheme(t)` (persist + apply).
- No-flash: small inline script in `layout.tsx` `<head>` applies the stored/system theme before paint; `<html suppressHydrationWarning>`.
- `theme-toggle.tsx`: sun/moon button in topbar; cycles light/dark; `aria-pressed`, reduced-motion safe.

### 5.2 Recurring / subscription detection
- In `lib/insights.ts`: `detectRecurring(txns)`:
  - Consider debits only. Normalize merchant (lowercase, strip trailing ref numbers/dates/extra whitespace).
  - Group by normalized merchant. A group is "recurring" when it has ≥3 charges whose median gap is 26–35 days (monthly) **or** 6–8 days (weekly), and amounts cluster (within ±15% of median).
  - Return `{ merchant, cadence, avgAmount, monthlyEquivalent, lastSeen, count }`, sorted by `monthlyEquivalent` desc.
- `recurring-panel.tsx`: list + header total "≈ ₹X/mo across N subscriptions". Shown on Insights; compact summary card on Overview.

### 5.3 Search, filters & CSV export
- Extend `transactions-view.tsx`: search box matches **merchant OR amount** (numeric substring); keep range/direction/category filters.
- `lib/csv.ts`: `toCsv(rows, columns)` → RFC-4180-safe string (quote/escape); `downloadCsv(filename, csv)` via Blob + object URL, revoked after click.
- "Export CSV" button exports the **currently filtered** rows: date, time, merchant, category, direction, amount, source. Disabled when zero rows.

### 5.4 Forecast & insights (new Insights view)
- `lib/insights.ts` additionally:
  - `projectMonthEnd(txns, now)`: sum month-to-date debits, scale by `daysInMonth / daysElapsed` → projected month-end spend.
  - `monthOverMonth(txns, now)`: per-category total this month vs last month → `{ category, thisMonth, lastMonth, deltaPct }`; surface top movers.
  - `savingsRate(txns, now)`: credits vs debits this month.
- `insights-view.tsx`: cards for projected spend (with confidence note re: days elapsed), top movers ("🍔 Food up 30% vs last month"), savings rate, plus the recurring panel. Empty-safe when data is thin (e.g., <7 days → show "not enough data yet").

## 6. Bug fixes

**Frontend (verified):**
1. **Date bucketing.** `lib/date.ts` `toDayKey(date|string)` uses local components (no `toISOString`). `spend-trend-chart.tsx` and `transactions-view.tsx` both use it so generated day buckets and transaction day-keys align in IST.
2. **Category metadata resilience.** `lib/api.ts` exports a `categoryMeta(id)` lookup (label/emoji/color from canonical `CATEGORIES`, with an accent-tinted default). Components prefer backend-provided fields but fall back to the map instead of a bare `💳`.
3. **`inr` NaN guard.** `inr(v)` returns `₹0` (or `—`) when `v` is non-finite.
4. **Optimistic recategorize.** `app-shell.tsx` updates the local transaction's `category_id` immediately and reconciles category totals/budgets in the background (or a scoped refetch), instead of `await refresh()` re-rendering the whole tree and losing scroll.
5. **Hero period.** Pass current-month label into `HeroCard period`.
6. **Keyframe centralization.** Move `spin`/`bounce`/`pc-shimmer` to `globals.css`; delete duplicate `<style>` blocks.
7. **Breakpoint consistency.** Unify mobile breakpoint (use 768 everywhere).
8. **Error recovery.** Error banner gets a **Retry** button calling `refresh()`.

**Backend (static review only — not run this session):**
9. Remove dead unreachable second `except Exception` in `cron_sync` (`api/main.py:134-135`).
10. De-duplicate the double email parse in `_run_gmail_imap_sync` (compute the `parsed` count without parsing twice). Behavior-preserving.

## 7. Dev-only sample data (verification)

- `lib/sample-data.ts`: ~60 realistic INR transactions across categories/sources over ~8 weeks, including 3–4 recurring merchants (e.g. Netflix monthly, gym weekly, rent monthly), plus matching category totals and a couple of budgets (one over, one near).
- Activation: only when `?demo=1` is present in the URL (read once on mount) **or** `NEXT_PUBLIC_DEMO=1`. Default build is unchanged — it still calls the real API. Sample mode short-circuits the fetches in `app-shell`/`CFOChat` with canned data and a canned chat reply.
- Purpose: lets the redesign + charts + all four features be seen/verified with no credentials; also a usable demo for the user.

## 8. Testing & verification

- `npm run build` must pass (type-check + lint clean).
- Browser verification (agent-browser) in `?demo=1`: each view renders populated; dark mode toggles + persists across reload with no flash; CSV downloads; recurring panel lists subscriptions; insights cards compute; charts align to correct days; mobile drawer + responsive grids work.
- Pure `lib/` functions (insights, date, csv) written to be unit-testable; add lightweight tests if a frontend test runner is present (none currently — otherwise rely on build + browser).
- Backend changes: confirm `python -c "import ast"` parse / `py_compile` clean; cannot run the service (no creds).

## 9. Out of scope (YAGNI)

Multi-bank support, authentication, real Gmail OAuth, backend/DB schema changes, streaming chat responses, server-side persistence of theme. Can be pulled in later as separate slices.

## 10. Risks

- **No backend run** → backend fixes verified by static parse only; flagged as such in the PR/commit.
- **Recurring heuristic** can mis-flag irregular merchants; tuned conservatively (≥3 hits, tight gap + amount clustering) and clearly labeled "detected".
- **Inline-style volume** makes the restyle broad; mitigated by driving everything through `--pc-*` tokens so most changes are token-level, not per-component rewrites.
