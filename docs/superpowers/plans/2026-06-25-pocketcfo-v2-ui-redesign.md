# PocketCFO v2 — UI Redesign, Bugfixes & Advanced Features — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a bolder indigo/violet redesign of the PocketCFO frontend with working dark mode, four advanced features (dark toggle, recurring detection, search/filters/CSV export, forecast & insights), and fixes for 10 identified bugs.

**Architecture:** Pure data logic moves into testable `lib/` modules (`date`, `insights`, `csv`, `theme`, `sample-data`); React view components stay presentational and consume them. A `--pc-*` design-token layer in `globals.css` gains an accent + full dark variant, so most restyling is token-level. All features compute client-side from existing API responses; a dev-only `?demo=1` sample dataset enables full offline verification.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4 + custom CSS tokens, lucide-react, vitest (new, dev-only), FastAPI (backend, static fixes only).

## Global Constraints

- Frontend dir: `frontend/`. All `npm` commands run from `frontend/`.
- **No backend run** — Supabase/Anthropic creds unavailable. Verify frontend via `npm run build` + browser in `?demo=1`. Backend fixes verified by `python -m py_compile` only.
- Indian-locale INR formatting via existing `inr()`; amounts have no paise.
- Accent color is exactly `#5B4BE0` (indigo/violet).
- Default build behavior unchanged: app still calls real `/api/*`. Sample data activates ONLY with `?demo=1` in URL or `NEXT_PUBLIC_DEMO=1`.
- Single branch `feat/v2-ui-redesign` (already created). Commit per task. Do NOT push or open a PR unless asked.
- Existing code is inline-style + `--pc-*` tokens — follow that pattern; do not convert to a CSS framework.
- Reduced-motion: every animation already guards `prefers-reduced-motion`; keep that.

---

### Task 1: Add vitest for `lib/` pure-function tests

**Files:**
- Modify: `frontend/package.json` (add devDeps + `test` script)
- Create: `frontend/vitest.config.ts`
- Create: `frontend/lib/__tests__/smoke.test.ts`

**Interfaces:**
- Produces: `npm test` runner usable by all later `lib/` tasks.

- [ ] **Step 1: Install vitest**

Run (from `frontend/`):
```bash
npm install -D vitest@^3
```

- [ ] **Step 2: Add test script to package.json**

In `frontend/package.json` `"scripts"`, add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create vitest config**

`frontend/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: { environment: "node", include: ["lib/**/*.test.ts"] },
  resolve: { alias: { "@": resolve(__dirname, ".") } },
});
```

- [ ] **Step 4: Smoke test**

`frontend/lib/__tests__/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";
describe("vitest", () => {
  it("runs", () => { expect(1 + 1).toBe(2); });
});
```

- [ ] **Step 5: Run**

Run: `npm test`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vitest.config.ts frontend/lib/__tests__/smoke.test.ts
git commit -m "test(frontend): add vitest for lib pure-function tests"
```

---

### Task 2: `lib/date.ts` — local-date helpers (fixes date-bucket bug)

**Files:**
- Create: `frontend/lib/date.ts`
- Create: `frontend/lib/date.test.ts`

**Interfaces:**
- Produces:
  - `toDayKey(d: string | Date): string` → `"YYYY-MM-DD"` from LOCAL components.
  - `parseDayKey(key: string): Date` → local midnight Date.
  - `dayLabel(key: string, now?: Date): string` → `"Today"` / `"Yesterday"` / `"Sat, 21 Jun"`.
  - `addDays(d: Date, n: number): Date`
  - `startOfMonth(d: Date): Date`
  - `daysInMonth(d: Date): number`
  - `dayOfMonth(d: Date): number`

- [ ] **Step 1: Write failing tests**

`frontend/lib/date.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { toDayKey, parseDayKey, dayLabel, addDays, startOfMonth, daysInMonth, dayOfMonth } from "@/lib/date";

describe("toDayKey", () => {
  it("formats a Date using local components", () => {
    expect(toDayKey(new Date(2026, 5, 7, 23, 30))).toBe("2026-06-07");
  });
  it("does not shift across UTC midnight (local 00:30 stays same day)", () => {
    expect(toDayKey(new Date(2026, 5, 7, 0, 30))).toBe("2026-06-07");
  });
  it("takes the date prefix of an ISO-with-time string", () => {
    expect(toDayKey("2026-06-07T23:30:00")).toBe("2026-06-07");
  });
});

describe("parseDayKey", () => {
  it("returns local midnight", () => {
    const d = parseDayKey("2026-06-07");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(7);
    expect(d.getHours()).toBe(0);
  });
});

describe("dayLabel", () => {
  const now = new Date(2026, 5, 25);
  it("labels today/yesterday", () => {
    expect(dayLabel("2026-06-25", now)).toBe("Today");
    expect(dayLabel("2026-06-24", now)).toBe("Yesterday");
  });
  it("labels other days without throwing", () => {
    expect(dayLabel("2026-06-21", now)).toMatch(/Jun/);
  });
});

describe("date math", () => {
  it("addDays", () => { expect(toDayKey(addDays(new Date(2026, 5, 30), 1))).toBe("2026-07-01"); });
  it("startOfMonth", () => { expect(toDayKey(startOfMonth(new Date(2026, 5, 25)))).toBe("2026-06-01"); });
  it("daysInMonth", () => { expect(daysInMonth(new Date(2026, 1, 10))).toBe(28); });
  it("dayOfMonth", () => { expect(dayOfMonth(new Date(2026, 5, 25))).toBe(25); });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- date`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`frontend/lib/date.ts`:
```ts
/** Local-date helpers. Single source of truth for date→day-key so that
 * generated day buckets and transaction day-keys align regardless of timezone.
 * Never use toISOString() for day keys — it converts to UTC and shifts the day. */

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" from a Date (local components) or the date-prefix of a string. */
export function toDayKey(d: string | Date): string {
  if (typeof d === "string") {
    // ISO-with-time or date-only: take the leading date portion as authored.
    if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
    d = new Date(d);
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local midnight Date for a "YYYY-MM-DD" key. */
export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function daysInMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export function dayOfMonth(d: Date): number {
  return d.getDate();
}

/** "Today" / "Yesterday" / "Sat, 21 Jun" (year shown only if not current year). */
export function dayLabel(key: string, now: Date = new Date()): string {
  const d = parseDayKey(key);
  const todayKey = toDayKey(now);
  const yesterdayKey = toDayKey(addDays(now, -1));
  if (key === todayKey) return "Today";
  if (key === yesterdayKey) return "Yesterday";
  return d.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- date`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/date.ts frontend/lib/date.test.ts
git commit -m "feat(frontend): local-date helpers; fixes UTC day-bucket drift"
```

---

### Task 3: `lib/api.ts` — NaN-safe `inr`, category metadata map, colors on CATEGORIES

**Files:**
- Modify: `frontend/lib/api.ts`
- Create: `frontend/lib/api.test.ts`

**Interfaces:**
- Consumes: existing `CategoryTotal`, `Txn`, `BudgetStatus` types.
- Produces:
  - `inr(v)` returns `"₹0"` for non-finite input.
  - `CATEGORIES` entries gain `color: string` (a `var(--pc-*)` reference).
  - `categoryMeta(id: string): { id: string; label: string; emoji: string; color: string }` — falls back to an "Other"-style default for unknown ids.

- [ ] **Step 1: Write failing tests**

`frontend/lib/api.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { inr, categoryMeta, CATEGORIES } from "@/lib/api";

describe("inr", () => {
  it("formats integers in en-IN", () => { expect(inr(125000)).toBe("₹1,25,000"); });
  it("guards NaN", () => { expect(inr(Number.NaN)).toBe("₹0"); });
  it("guards undefined-ish", () => { expect(inr(undefined as unknown as number)).toBe("₹0"); });
});

describe("categoryMeta", () => {
  it("returns known category", () => {
    const m = categoryMeta("food");
    expect(m.label).toBe("Food");
    expect(m.emoji).toBe("🍔");
    expect(m.color).toContain("var(--pc-");
  });
  it("falls back for unknown id", () => {
    const m = categoryMeta("nonsense");
    expect(m.id).toBe("nonsense");
    expect(m.emoji).toBeTruthy();
    expect(m.color).toContain("var(--pc-");
  });
});

describe("CATEGORIES", () => {
  it("every category has a color token", () => {
    for (const c of CATEGORIES) expect(c.color).toContain("var(--pc-");
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- api`
Expected: FAIL (`categoryMeta` not exported / `color` missing).

- [ ] **Step 3: Implement**

In `frontend/lib/api.ts`:

(a) Replace the `CATEGORIES` constant so each entry has a `color`:
```ts
export const CATEGORIES: { id: string; label: string; emoji: string; color: string }[] = [
  { id: "food",          label: "Food",          emoji: "🍔", color: "var(--pc-food)" },
  { id: "travel",        label: "Travel",        emoji: "✈️", color: "var(--pc-travel)" },
  { id: "clothing",      label: "Clothing",      emoji: "👕", color: "var(--pc-clothing)" },
  { id: "groceries",     label: "Groceries",     emoji: "🛒", color: "var(--pc-groceries)" },
  { id: "bills",         label: "Bills",         emoji: "🧾", color: "var(--pc-bills)" },
  { id: "entertainment", label: "Entertainment", emoji: "🎬", color: "var(--pc-entertainment)" },
  { id: "health",        label: "Health",        emoji: "💊", color: "var(--pc-health)" },
  { id: "transport",     label: "Transport",     emoji: "🚗", color: "var(--pc-transport)" },
  { id: "shopping",      label: "Shopping",      emoji: "🛍️", color: "var(--pc-shopping)" },
  { id: "other",         label: "Other",         emoji: "❓", color: "var(--pc-other)" },
];

const _CAT_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

/** Canonical label/emoji/color for a category id, with a safe fallback. */
export function categoryMeta(id: string): { id: string; label: string; emoji: string; color: string } {
  const hit = _CAT_BY_ID.get(id);
  if (hit) return hit;
  return { id, label: id ? id[0].toUpperCase() + id.slice(1) : "Other", emoji: "💳", color: "var(--pc-other)" };
}
```

(b) Replace `inr`:
```ts
/** Format a number/string as Indian-locale INR amount (no paise). NaN-safe. */
export const inr = (v: string | number): string => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "₹0";
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
};
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- api`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/api.ts frontend/lib/api.test.ts
git commit -m "feat(frontend): NaN-safe inr + categoryMeta lookup with colors"
```

---

### Task 4: `lib/csv.ts` — CSV serialize + download

**Files:**
- Create: `frontend/lib/csv.ts`
- Create: `frontend/lib/csv.test.ts`

**Interfaces:**
- Produces:
  - `toCsv(rows: Record<string, unknown>[], columns: { key: string; header: string }[]): string` — RFC-4180 quoting (`"` doubled, fields with `,`/`"`/newline quoted), `\r\n` line endings, header row first.
  - `downloadCsv(filename: string, csv: string): void` — Blob + temporary object URL, revoked after click (DOM side-effect; not unit-tested).

- [ ] **Step 1: Write failing tests**

`frontend/lib/csv.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { toCsv } from "@/lib/csv";

const cols = [
  { key: "merchant", header: "Merchant" },
  { key: "amount", header: "Amount" },
];

describe("toCsv", () => {
  it("emits a header row", () => {
    expect(toCsv([], cols).split("\r\n")[0]).toBe("Merchant,Amount");
  });
  it("serializes simple rows", () => {
    const out = toCsv([{ merchant: "Cafe", amount: 250 }], cols);
    expect(out).toBe("Merchant,Amount\r\nCafe,250");
  });
  it("quotes fields with commas and doubles inner quotes", () => {
    const out = toCsv([{ merchant: 'A, "B"', amount: 1 }], cols);
    expect(out.split("\r\n")[1]).toBe('"A, ""B""",1');
  });
  it("treats null/undefined as empty", () => {
    const out = toCsv([{ merchant: null, amount: undefined }], cols);
    expect(out.split("\r\n")[1]).toBe(",");
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- csv`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`frontend/lib/csv.ts`:
```ts
export interface CsvColumn { key: string; header: string; }

function escapeField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Record<string, unknown>[], columns: CsvColumn[]): string {
  const header = columns.map((c) => escapeField(c.header)).join(",");
  const body = rows.map((row) => columns.map((c) => escapeField(row[c.key])).join(","));
  return [header, ...body].join("\r\n");
}

/** Trigger a browser download of `csv` as `filename`. No-op outside the browser. */
export function downloadCsv(filename: string, csv: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- csv`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/csv.ts frontend/lib/csv.test.ts
git commit -m "feat(frontend): CSV serialize + browser download helper"
```

---

### Task 5: `lib/insights.ts` — recurring detection

**Files:**
- Create: `frontend/lib/insights.ts`
- Create: `frontend/lib/insights.test.ts`

**Interfaces:**
- Consumes: `Txn` from `@/lib/api`; `toDayKey`/`parseDayKey` from `@/lib/date`.
- Produces:
  - `normalizeMerchant(s: string): string`
  - `type Recurring = { merchant: string; cadence: "weekly" | "monthly"; avgAmount: number; monthlyEquivalent: number; count: number; lastSeen: string }`
  - `detectRecurring(txns: Txn[]): Recurring[]` — sorted by `monthlyEquivalent` desc.

- [ ] **Step 1: Write failing tests**

`frontend/lib/insights.test.ts` (recurring portion):
```ts
import { describe, it, expect } from "vitest";
import { normalizeMerchant, detectRecurring } from "@/lib/insights";
import type { Txn } from "@/lib/api";

function txn(merchant: string, dayKey: string, amount: number, direction: Txn["direction"] = "debit"): Txn {
  return { id: `${merchant}-${dayKey}`, occurred_at: `${dayKey}T10:00:00`, amount, direction, merchant, category_id: "other", source: "csv" };
}

describe("normalizeMerchant", () => {
  it("lowercases, trims, strips trailing ref numbers", () => {
    expect(normalizeMerchant("NETFLIX  *12345")).toBe("netflix");
    expect(normalizeMerchant("Swiggy Order #99-88")).toBe("swiggy order");
  });
});

describe("detectRecurring", () => {
  it("flags a monthly subscription (3 charges ~30d apart, stable amount)", () => {
    const txns = [
      txn("Netflix", "2026-04-05", 499),
      txn("Netflix", "2026-05-05", 499),
      txn("Netflix", "2026-06-05", 499),
    ];
    const r = detectRecurring(txns);
    expect(r).toHaveLength(1);
    expect(r[0].cadence).toBe("monthly");
    expect(r[0].avgAmount).toBe(499);
    expect(r[0].monthlyEquivalent).toBeCloseTo(499, 0);
  });
  it("flags weekly cadence and computes ~4.33x monthly equivalent", () => {
    const txns = [
      txn("Gym", "2026-06-01", 200),
      txn("Gym", "2026-06-08", 200),
      txn("Gym", "2026-06-15", 200),
      txn("Gym", "2026-06-22", 200),
    ];
    const r = detectRecurring(txns);
    expect(r[0].cadence).toBe("weekly");
    expect(r[0].monthlyEquivalent).toBeGreaterThan(800);
  });
  it("ignores merchants with < 3 charges", () => {
    expect(detectRecurring([txn("X", "2026-05-01", 10), txn("X", "2026-06-01", 10)])).toHaveLength(0);
  });
  it("ignores irregular gaps", () => {
    const txns = [
      txn("Random", "2026-06-01", 50),
      txn("Random", "2026-06-03", 50),
      txn("Random", "2026-06-20", 50),
    ];
    expect(detectRecurring(txns)).toHaveLength(0);
  });
  it("ignores wildly varying amounts", () => {
    const txns = [
      txn("Store", "2026-04-05", 100),
      txn("Store", "2026-05-05", 900),
      txn("Store", "2026-06-05", 300),
    ];
    expect(detectRecurring(txns)).toHaveLength(0);
  });
  it("ignores credits", () => {
    const txns = [
      txn("Salary", "2026-04-01", 50000, "credit"),
      txn("Salary", "2026-05-01", 50000, "credit"),
      txn("Salary", "2026-06-01", 50000, "credit"),
    ];
    expect(detectRecurring(txns)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- insights`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`frontend/lib/insights.ts`:
```ts
import type { Txn } from "@/lib/api";
import { toDayKey, parseDayKey } from "@/lib/date";

/** Lowercase, collapse whitespace, strip trailing reference/order tokens. */
export function normalizeMerchant(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[*#].*$/, " ")          // drop "*1234" / "#99-88" suffixes
    .replace(/\b(order|ref|txn|no)\b.*$/i, " ")
    .replace(/[0-9]{3,}/g, " ")       // drop long digit runs
    .replace(/\s+/g, " ")
    .trim();
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export type Recurring = {
  merchant: string;
  cadence: "weekly" | "monthly";
  avgAmount: number;
  monthlyEquivalent: number;
  count: number;
  lastSeen: string;
};

const WEEKS_PER_MONTH = 30.44 / 7;

export function detectRecurring(txns: Txn[]): Recurring[] {
  const groups = new Map<string, Txn[]>();
  for (const t of txns) {
    if (t.direction !== "debit") continue;
    const key = normalizeMerchant(t.merchant ?? "");
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  const out: Recurring[] = [];
  for (const [key, list] of groups) {
    if (list.length < 3) continue;
    const sorted = [...list].sort((a, b) => toDayKey(a.occurred_at).localeCompare(toDayKey(b.occurred_at)));
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const a = parseDayKey(toDayKey(sorted[i - 1].occurred_at));
      const b = parseDayKey(toDayKey(sorted[i].occurred_at));
      gaps.push(Math.round((b.getTime() - a.getTime()) / 86_400_000));
    }
    const gapMed = median(gaps);
    let cadence: "weekly" | "monthly" | null = null;
    if (gapMed >= 26 && gapMed <= 35) cadence = "monthly";
    else if (gapMed >= 6 && gapMed <= 8) cadence = "weekly";
    if (!cadence) continue;

    const amounts = sorted.map((t) => Number(t.amount));
    const amtMed = median(amounts);
    if (amtMed <= 0) continue;
    const stable = amounts.every((a) => Math.abs(a - amtMed) <= amtMed * 0.15);
    if (!stable) continue;

    const avgAmount = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    const monthlyEquivalent = cadence === "monthly" ? avgAmount : avgAmount * WEEKS_PER_MONTH;
    out.push({
      merchant: sorted[sorted.length - 1].merchant ?? key,
      cadence,
      avgAmount: Math.round(avgAmount),
      monthlyEquivalent: Math.round(monthlyEquivalent),
      count: sorted.length,
      lastSeen: toDayKey(sorted[sorted.length - 1].occurred_at),
    });
  }
  return out.sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- insights`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/insights.ts frontend/lib/insights.test.ts
git commit -m "feat(frontend): recurring/subscription detection heuristic"
```

---

### Task 6: `lib/insights.ts` — forecast, month-over-month, savings rate

**Files:**
- Modify: `frontend/lib/insights.ts`
- Modify: `frontend/lib/insights.test.ts`

**Interfaces:**
- Consumes: `Txn`; `startOfMonth`, `daysInMonth`, `dayOfMonth`, `toDayKey` from `@/lib/date`; `categoryMeta` from `@/lib/api`.
- Produces:
  - `type Forecast = { monthToDate: number; projected: number; daysElapsed: number; daysInMonth: number }`
  - `projectMonthEnd(txns: Txn[], now?: Date): Forecast`
  - `type CategoryDelta = { categoryId: string; label: string; emoji: string; thisMonth: number; lastMonth: number; deltaPct: number | null }`
  - `monthOverMonth(txns: Txn[], now?: Date): CategoryDelta[]` (sorted by absolute rupee change desc)
  - `type Savings = { income: number; spend: number; rate: number }`
  - `savingsRate(txns: Txn[], now?: Date): Savings`

- [ ] **Step 1: Add failing tests** (append to `insights.test.ts`)

```ts
import { projectMonthEnd, monthOverMonth, savingsRate } from "@/lib/insights";

describe("projectMonthEnd", () => {
  it("scales month-to-date debits by days-in-month / days-elapsed", () => {
    const now = new Date(2026, 5, 10); // 10th of 30-day June
    const txns = [txn("A", "2026-06-01", 1000), txn("A", "2026-06-05", 2000)]; // MTD 3000
    const f = projectMonthEnd(txns, now);
    expect(f.monthToDate).toBe(3000);
    expect(f.daysElapsed).toBe(10);
    expect(f.daysInMonth).toBe(30);
    expect(f.projected).toBe(9000);
  });
  it("ignores prior-month and credit txns", () => {
    const now = new Date(2026, 5, 10);
    const txns = [txn("A", "2026-05-30", 5000), txn("A", "2026-06-02", 1000), txn("S", "2026-06-02", 4000, "credit")];
    expect(projectMonthEnd(txns, now).monthToDate).toBe(1000);
  });
});

describe("monthOverMonth", () => {
  it("computes per-category delta vs last month", () => {
    const now = new Date(2026, 5, 15);
    const txns = [
      { ...txn("A", "2026-05-10", 1000), category_id: "food" },
      { ...txn("B", "2026-06-10", 1300), category_id: "food" },
    ];
    const d = monthOverMonth(txns, now).find((x) => x.categoryId === "food")!;
    expect(d.thisMonth).toBe(1300);
    expect(d.lastMonth).toBe(1000);
    expect(d.deltaPct).toBeCloseTo(30, 0);
  });
});

describe("savingsRate", () => {
  it("rate = (income - spend) / income for the current month", () => {
    const now = new Date(2026, 5, 15);
    const txns = [txn("S", "2026-06-01", 10000, "credit"), txn("A", "2026-06-02", 4000)];
    const s = savingsRate(txns, now);
    expect(s.income).toBe(10000);
    expect(s.spend).toBe(4000);
    expect(s.rate).toBeCloseTo(0.6, 5);
  });
  it("rate is 0 when no income", () => {
    expect(savingsRate([txn("A", "2026-06-02", 4000)], new Date(2026, 5, 15)).rate).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- insights`
Expected: FAIL (new functions undefined).

- [ ] **Step 3: Implement** (append to `frontend/lib/insights.ts`)

```ts
import { startOfMonth, daysInMonth, dayOfMonth } from "@/lib/date";
import { categoryMeta } from "@/lib/api";

function inMonth(t: Txn, year: number, month0: number): boolean {
  const k = toDayKey(t.occurred_at);
  const [y, m] = k.split("-").map(Number);
  return y === year && m - 1 === month0;
}

export type Forecast = { monthToDate: number; projected: number; daysElapsed: number; daysInMonth: number };

export function projectMonthEnd(txns: Txn[], now: Date = new Date()): Forecast {
  const y = now.getFullYear();
  const m0 = now.getMonth();
  const monthToDate = txns
    .filter((t) => t.direction === "debit" && inMonth(t, y, m0))
    .reduce((s, t) => s + Number(t.amount), 0);
  const dim = daysInMonth(now);
  const elapsed = Math.max(1, dayOfMonth(now));
  const projected = Math.round((monthToDate / elapsed) * dim);
  return { monthToDate: Math.round(monthToDate), projected, daysElapsed: elapsed, daysInMonth: dim };
}

export type CategoryDelta = {
  categoryId: string; label: string; emoji: string;
  thisMonth: number; lastMonth: number; deltaPct: number | null;
};

export function monthOverMonth(txns: Txn[], now: Date = new Date()): CategoryDelta[] {
  const y = now.getFullYear();
  const m0 = now.getMonth();
  const prev = new Date(y, m0 - 1, 1);
  const py = prev.getFullYear();
  const pm0 = prev.getMonth();

  const acc = new Map<string, { thisMonth: number; lastMonth: number }>();
  for (const t of txns) {
    if (t.direction !== "debit") continue;
    const cur = acc.get(t.category_id) ?? { thisMonth: 0, lastMonth: 0 };
    if (inMonth(t, y, m0)) cur.thisMonth += Number(t.amount);
    else if (inMonth(t, py, pm0)) cur.lastMonth += Number(t.amount);
    acc.set(t.category_id, cur);
  }

  const out: CategoryDelta[] = [];
  for (const [categoryId, v] of acc) {
    if (v.thisMonth === 0 && v.lastMonth === 0) continue;
    const meta = categoryMeta(categoryId);
    const deltaPct = v.lastMonth > 0 ? ((v.thisMonth - v.lastMonth) / v.lastMonth) * 100 : null;
    out.push({
      categoryId, label: meta.label, emoji: meta.emoji,
      thisMonth: Math.round(v.thisMonth), lastMonth: Math.round(v.lastMonth), deltaPct,
    });
  }
  return out.sort((a, b) => Math.abs(b.thisMonth - b.lastMonth) - Math.abs(a.thisMonth - a.lastMonth));
}

export type Savings = { income: number; spend: number; rate: number };

export function savingsRate(txns: Txn[], now: Date = new Date()): Savings {
  const y = now.getFullYear();
  const m0 = now.getMonth();
  let income = 0, spend = 0;
  for (const t of txns) {
    if (!inMonth(t, y, m0)) continue;
    if (t.direction === "credit") income += Number(t.amount);
    else spend += Number(t.amount);
  }
  const rate = income > 0 ? (income - spend) / income : 0;
  return { income: Math.round(income), spend: Math.round(spend), rate };
}
```

Note: `startOfMonth` import is included for parity with the date module surface even though month membership uses `inMonth`; if lint flags it as unused, remove `startOfMonth` from the import.

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- insights`
Expected: PASS (all recurring + forecast/MoM/savings tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/insights.ts frontend/lib/insights.test.ts
git commit -m "feat(frontend): month-end forecast, MoM deltas, savings rate"
```

---

### Task 7: `lib/theme.ts` — theme resolution + apply + persist

**Files:**
- Create: `frontend/lib/theme.ts`
- Create: `frontend/lib/theme.test.ts`

**Interfaces:**
- Produces:
  - `type Theme = "light" | "dark"`
  - `STORAGE_KEY = "pc-theme"`
  - `getStored(): Theme | null`
  - `resolveTheme(): Theme` (stored → else `prefers-color-scheme` → else `"light"`)
  - `applyTheme(t: Theme): void` (toggles `.dark` on `documentElement`, sets `style.colorScheme`)
  - `setTheme(t: Theme): void` (persist + apply)

- [ ] **Step 1: Write failing tests** (jsdom env via inline directive)

`frontend/lib/theme.test.ts`:
```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { getStored, applyTheme, setTheme, STORAGE_KEY } from "@/lib/theme";

beforeEach(() => { localStorage.clear(); document.documentElement.className = ""; });

describe("theme", () => {
  it("getStored returns null when unset", () => { expect(getStored()).toBeNull(); });
  it("applyTheme toggles the dark class", () => {
    applyTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    applyTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
  it("setTheme persists and applies", () => {
    setTheme("dark");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
```

- [ ] **Step 2: Install jsdom + run to verify fail**

Run:
```bash
npm install -D jsdom@^25
npm test -- theme
```
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`frontend/lib/theme.ts`:
```ts
export type Theme = "light" | "dark";
export const STORAGE_KEY = "pc-theme";

export function getStored(): Theme | null {
  if (typeof localStorage === "undefined") return null;
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "light" || v === "dark" ? v : null;
}

export function resolveTheme(): Theme {
  const stored = getStored();
  if (stored) return stored;
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

export function applyTheme(t: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", t === "dark");
  document.documentElement.style.colorScheme = t;
}

export function setTheme(t: Theme): void {
  if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, t);
  applyTheme(t);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- theme`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/theme.ts frontend/lib/theme.test.ts frontend/package.json frontend/package-lock.json
git commit -m "feat(frontend): theme resolve/apply/persist helpers"
```

---

### Task 8: Design tokens — accent + dark variants + shared keyframes (`globals.css`)

**Files:**
- Modify: `frontend/app/globals.css`

**Interfaces:**
- Produces CSS custom properties consumed by every component: `--pc-accent`, `--pc-accent-soft`, `--pc-accent-ink`, `--pc-accent-ring`; full `.dark` overrides of the `--pc-*` set; global `@keyframes spin`, `bounce`, `pc-shimmer` (already present), and `.pc-spin` utility.

- [ ] **Step 1: Add accent tokens** — in the `:root` PocketCFO block (after `--pc-border-strong`), add:
```css
  /* Accent (indigo/violet) */
  --pc-accent: #5B4BE0;
  --pc-accent-strong: #4A3BD0;
  --pc-accent-soft: rgba(91, 75, 224, 0.12);
  --pc-accent-ink: #FFFFFF;
  --pc-accent-ring: rgba(91, 75, 224, 0.40);
```

- [ ] **Step 2: Add a dark variant block** — after the closing `}` of the PocketCFO `:root` token block, add a `.dark` override. Use a dark slate canvas, lifted ink scale, vivid accent, and slightly desaturated category pastels:
```css
.dark {
  --pc-bg: #1A1822;
  --pc-bg-2: #221F2E;
  --pc-ink: #F2EFFA;
  --pc-ink-2: #C3BEd2;
  --pc-ink-3: #8B859B;
  --pc-border: rgba(255, 255, 255, 0.10);
  --pc-border-strong: rgba(255, 255, 255, 0.20);

  --pc-accent: #8B7BFF;
  --pc-accent-strong: #A593FF;
  --pc-accent-soft: rgba(139, 123, 255, 0.18);
  --pc-accent-ink: #16121F;
  --pc-accent-ring: rgba(139, 123, 255, 0.45);

  --pc-food: #5A3D32;
  --pc-travel: #5A5230;
  --pc-clothing: #463A57;
  --pc-groceries: #2F4A3B;
  --pc-bills: #2E4456;
  --pc-entertainment: #553742;
  --pc-health: #36492F;
  --pc-transport: #564326;
  --pc-shopping: #433A57;
  --pc-other: #3A3744;

  --pc-credit: #5DCB97;
  --pc-danger: #E4736C;
  --pc-danger-bg: #3A2422;
  --pc-warn-bg: #43391F;
  --pc-success-bg: #244536;
}
```
Note: this `.dark` block intentionally overlaps the shadcn `.dark` block already in the file — both apply; ours sets the `--pc-*` vars the app actually uses. Keep both.

- [ ] **Step 3: Dark-aware surfaces** — the glass/card/nav classes hardcode white. Make them theme-aware by overriding inside `.dark`:
```css
.dark .pc-glass { background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.10); }
.dark .pc-card { background: rgba(255,255,255,0.05); }
.dark .pc-nav-item:hover { background: rgba(255,255,255,0.06); }
.dark .pc-nav-item.active { background: rgba(255,255,255,0.10); }
.dark .pc-btn-ghost { background: rgba(255,255,255,0.06); }
.dark .pc-chip { background: rgba(255,255,255,0.05); }
.dark .pc-chip:hover { background: rgba(255,255,255,0.10); }
.dark .pc-skeleton { background: linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0.04) 100%); }
.dark .pc-input, .dark .pc-select { background: rgba(255,255,255,0.06); }
```

- [ ] **Step 4: Promote accent into interactive states** — update existing rules:
```css
.pc-nav-item.active { background: var(--pc-accent-soft); color: var(--pc-accent-strong); box-shadow: none; font-weight: 600; }
.pc-chip.active { background: var(--pc-accent); color: var(--pc-accent-ink); border-color: var(--pc-accent); }
.pc-btn-primary { background: var(--pc-accent); color: var(--pc-accent-ink); border-color: var(--pc-accent); }
.pc-input:focus, .pc-select:focus { border-color: var(--pc-accent); box-shadow: 0 0 0 3px var(--pc-accent-ring); }
```
(Leave `.pc-btn-success` / `.pc-btn-info` as-is — they map to category pastels.)

- [ ] **Step 5: Shared keyframes + spin utility** — append:
```css
@keyframes spin { to { transform: rotate(360deg); } }
.pc-spin { animation: spin 1s linear infinite; }
@keyframes bounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-4px); } }
@media (prefers-reduced-motion: reduce) {
  .pc-spin { animation: none; }
  @keyframes bounce { 0%, 100% { transform: none; } }
}
```
(`pc-shimmer` already exists — leave it.)

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: build succeeds (CSS compiles).

- [ ] **Step 7: Commit**

```bash
git add frontend/app/globals.css
git commit -m "feat(frontend): accent token layer, dark variants, shared keyframes"
```

---

### Task 9: No-flash theme bootstrap in `layout.tsx`

**Files:**
- Modify: `frontend/app/layout.tsx`

**Interfaces:**
- Consumes: `STORAGE_KEY` value `"pc-theme"` (inline-duplicated in the pre-paint script; documented).

- [ ] **Step 1: Add `suppressHydrationWarning` to `<html>`** and an inline pre-paint script in `<head>` that applies the stored/system theme before first paint.

Replace the `<html ...>` open tag and add a `<head>`:
```tsx
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('pc-theme');if(!t){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}var e=document.documentElement;e.classList.toggle('dark',t==='dark');e.style.colorScheme=t;}catch(_){}})();`,
          }}
        />
      </head>
      <body className="h-full overflow-hidden">{children}</body>
    </html>
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds, no hydration errors in output.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/layout.tsx
git commit -m "feat(frontend): no-flash theme bootstrap before paint"
```

---

### Task 10: `theme-toggle.tsx` component

**Files:**
- Create: `frontend/components/theme-toggle.tsx`

**Interfaces:**
- Consumes: `resolveTheme`, `setTheme`, `type Theme` from `@/lib/theme`.
- Produces: `<ThemeToggle />` — a topbar button.

- [ ] **Step 1: Implement**

`frontend/components/theme-toggle.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { resolveTheme, setTheme, type Theme } from "@/lib/theme";

export function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setThemeState(resolveTheme());
    setMounted(true);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  }

  const isDark = theme === "dark";
  return (
    <button
      onClick={toggle}
      className="pc-btn pc-btn-ghost"
      style={{ padding: "7px 9px" }}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={isDark}
      title={isDark ? "Light mode" : "Dark mode"}
    >
      {/* Render a stable icon until mounted to avoid hydration mismatch */}
      {!mounted ? <Sun size={16} strokeWidth={2} aria-hidden="true" />
        : isDark ? <Moon size={16} strokeWidth={2} aria-hidden="true" />
        : <Sun size={16} strokeWidth={2} aria-hidden="true" />}
    </button>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/theme-toggle.tsx
git commit -m "feat(frontend): theme toggle button"
```

---

### Task 11: `lib/sample-data.ts` — dev-only fixtures + activation

**Files:**
- Create: `frontend/lib/sample-data.ts`

**Interfaces:**
- Consumes: `Txn`, `CategoryTotal`, `BudgetStatus` from `@/lib/api`; `toDayKey`, `addDays` from `@/lib/date`.
- Produces:
  - `isDemo(): boolean`
  - `sampleTransactions(now?: Date): Txn[]`
  - `sampleCategories(now?: Date): CategoryTotal[]` (derived from the txns)
  - `sampleBudgets(now?: Date): { statuses: BudgetStatus[]; nudges: string[] }`
  - `sampleChatReply(question: string): string`

- [ ] **Step 1: Implement** — generate ~8 weeks of debits/credits including recurring merchants (Netflix monthly, Cult gym weekly, Rent monthly), then derive categories/budgets from them so every view is populated and the recurring/forecast logic has real input.

`frontend/lib/sample-data.ts`:
```ts
import type { Txn, CategoryTotal, BudgetStatus } from "@/lib/api";
import { categoryMeta } from "@/lib/api";
import { toDayKey, addDays } from "@/lib/date";

export function isDemo(): boolean {
  if (process.env.NEXT_PUBLIC_DEMO === "1") return true;
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("demo") === "1";
}

let _seed = 1;
function rand(): number { _seed = (_seed * 1103515245 + 12345) & 0x7fffffff; return _seed / 0x7fffffff; }
function pick<T>(xs: T[]): T { return xs[Math.floor(rand() * xs.length)]; }
function amt(min: number, max: number): number { return Math.round(min + rand() * (max - min)); }

const ONE_OFFS: { merchant: string; category: string; min: number; max: number }[] = [
  { merchant: "Swiggy", category: "food", min: 180, max: 650 },
  { merchant: "Zomato", category: "food", min: 200, max: 700 },
  { merchant: "BigBasket", category: "groceries", min: 400, max: 2200 },
  { merchant: "Uber", category: "transport", min: 90, max: 480 },
  { merchant: "Myntra", category: "clothing", min: 700, max: 3500 },
  { merchant: "Amazon", category: "shopping", min: 300, max: 4000 },
  { merchant: "BookMyShow", category: "entertainment", min: 250, max: 1200 },
  { merchant: "Apollo Pharmacy", category: "health", min: 150, max: 1400 },
  { merchant: "IndianOil", category: "transport", min: 800, max: 2500 },
  { merchant: "Starbucks", category: "food", min: 250, max: 600 },
];

export function sampleTransactions(now: Date = new Date()): Txn[] {
  _seed = 42;
  const txns: Txn[] = [];
  let id = 1;
  const push = (merchant: string, category: string, amount: number, daysAgo: number, direction: Txn["direction"] = "debit") => {
    txns.push({
      id: String(id++),
      occurred_at: `${toDayKey(addDays(now, -daysAgo))}T${String(8 + (id % 12)).padStart(2, "0")}:15:00`,
      amount, direction, merchant, category_id: category, source: pick(["gmail", "sms", "csv", "pdf"]) as Txn["source"],
    });
  };
  // Recurring: Netflix monthly, Cult gym weekly, Rent monthly, Salary monthly (credit)
  for (const d of [3, 33, 63]) push("Netflix", "entertainment", 499, d);
  for (const d of [2, 9, 16, 23, 30, 37]) push("Cult Fitness", "health", 300, d);
  for (const d of [5, 35]) push("Home Rent", "bills", 18000, d);
  for (const d of [1, 31]) push("Acme Payroll", "other", 85000, d, "credit");
  // One-offs across ~56 days
  for (let d = 0; d < 56; d++) {
    if (rand() < 0.6) { const o = pick(ONE_OFFS); push(o.merchant, o.category, amt(o.min, o.max), d); }
  }
  return txns.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
}

export function sampleCategories(now: Date = new Date()): CategoryTotal[] {
  const totals = new Map<string, number>();
  for (const t of sampleTransactions(now)) {
    if (t.direction !== "debit") continue;
    totals.set(t.category_id, (totals.get(t.category_id) ?? 0) + Number(t.amount));
  }
  return [...totals.entries()]
    .map(([category_id, total]) => {
      const m = categoryMeta(category_id);
      return { category_id, label: m.label, emoji: m.emoji, color: m.color, total };
    })
    .sort((a, b) => b.total - a.total);
}

export function sampleBudgets(now: Date = new Date()): { statuses: BudgetStatus[]; nudges: string[] } {
  const cats = sampleCategories(now);
  const byId = new Map(cats.map((c) => [c.category_id, Number(c.total)]));
  const defs: { category_id: string; limit: number }[] = [
    { category_id: "food", limit: 6000 },
    { category_id: "groceries", limit: 8000 },
    { category_id: "bills", limit: 20000 },
    { category_id: "shopping", limit: 5000 },
  ];
  const statuses: BudgetStatus[] = defs.map((d) => {
    const m = categoryMeta(d.category_id);
    const spent = byId.get(d.category_id) ?? 0;
    const pct = d.limit > 0 ? spent / d.limit : 0;
    return { category_id: d.category_id, label: m.label, emoji: m.emoji, color: m.color, spent, limit: d.limit, pct, over: spent > d.limit };
  });
  const nudges: string[] = [];
  for (const s of statuses) {
    const pct = Math.round(s.pct * 100);
    if (s.over) nudges.push(`⚠️ ${s.emoji} ${s.label} is OVER budget — ${pct}% of ₹${Number(s.limit).toLocaleString("en-IN")}.`);
    else if (s.pct >= 0.8) nudges.push(`🔔 ${s.emoji} ${s.label} is at ${pct}% of its ₹${Number(s.limit).toLocaleString("en-IN")} budget.`);
  }
  return { statuses, nudges };
}

export function sampleChatReply(question: string): string {
  const top = sampleCategories()[0];
  return `Demo mode 🧪 — based on the sample data, your biggest category is ${top?.emoji ?? ""} ${top?.label ?? "—"} ` +
    `at ₹${Number(top?.total ?? 0).toLocaleString("en-IN")}. (Connect the backend for real answers to: “${question}”.)`;
}
```

- [ ] **Step 2: Verify build + types**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/sample-data.ts
git commit -m "feat(frontend): dev-only sample dataset gated behind ?demo=1"
```

---

### Task 12: Wire demo mode + theme toggle + optimistic recat + Retry + Insights nav into `app-shell.tsx`

**Files:**
- Modify: `frontend/components/app-shell.tsx`

**Interfaces:**
- Consumes: `isDemo`, `sampleCategories`, `sampleTransactions`, `sampleBudgets` from `@/lib/sample-data`; `<ThemeToggle />`; `<InsightsView />` (Task 14 — import lands here, component created there); `categoryMeta` for optimistic totals.
- Produces: a `View` union extended with `"insights"`; demo-aware `refresh`.

- [ ] **Step 1: Extend `View` + nav.** Change the type and `NAV_ITEMS`:
```tsx
import { LayoutDashboard, List, Target, Sparkles, Menu, X, AlertTriangle } from "lucide-react";
import { InsightsView } from "@/components/insights-view";
import { ThemeToggle } from "@/components/theme-toggle";
import { isDemo, sampleCategories, sampleTransactions, sampleBudgets } from "@/lib/sample-data";

type View = "overview" | "transactions" | "budgets" | "insights";
```
Add to `NAV_ITEMS` after budgets:
```tsx
  { id: "insights", label: "Insights", Icon: Sparkles },
```

- [ ] **Step 2: Demo-aware `refresh`.** Replace the body of `refresh` so demo mode short-circuits the network:
```tsx
  const refresh = useCallback(async () => {
    cancelRef.current = false;
    setLoadState((prev) => (prev === "error" || prev === "empty" ? "loading" : prev));
    if (isDemo()) {
      const cats = sampleCategories();
      const txns = sampleTransactions();
      const bdg = sampleBudgets();
      setCategories(cats); setTransactions(txns);
      setBudgetStatuses(bdg.statuses); setNudges(bdg.nudges);
      setLoadState("ready");
      return;
    }
    try {
      const [cats, txns, bdg] = await Promise.all([getSummary(), getTransactions(), getBudgets()]);
      if (cancelRef.current) return;
      setCategories(cats); setTransactions(txns);
      setBudgetStatuses(bdg.statuses); setNudges(bdg.nudges);
      setLoadState(cats.length === 0 && txns.length === 0 ? "empty" : "ready");
    } catch (err) {
      if (cancelRef.current) return;
      setErrorMsg(err instanceof Error ? err.message : "Unknown error");
      setLoadState("error");
    }
  }, []);
```

- [ ] **Step 3: Optimistic recategorize.** Replace `handleRecategorize` so it updates local state first and reconciles category totals without a full reload:
```tsx
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
          setCategories(cats); setBudgetStatuses(bdg.statuses); setNudges(bdg.nudges);
        }
      } catch {
        if (undo) setTransactions(undo); // revert on failure
      }
    },
    []
  );
```

- [ ] **Step 4: Topbar — add ThemeToggle** next to `<SyncUpload>`. In the header, wrap the right side:
```tsx
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <ThemeToggle />
            <SyncUpload onChanged={refresh} />
          </div>
```
(remove the bare `<SyncUpload onChanged={refresh} />` that was there.)

- [ ] **Step 5: Error banner — add Retry button.** Inside the `role="alert"` error `<div>`, after the `<span>…</span>`, add:
```tsx
              <button onClick={refresh} className="pc-btn pc-btn-ghost" style={{ marginLeft: "auto", padding: "4px 10px" }}>
                Retry
              </button>
```

- [ ] **Step 6: Render Insights view.** After the `budgets` block:
```tsx
          {view === "insights" && (
            <InsightsView transactions={transactions} loading={isLoading} />
          )}
```

- [ ] **Step 7: Breakpoint fix.** In the component's `<style>` change `@media (max-width: 767px)` to `@media (max-width: 768px)` so it matches the overview grid.

- [ ] **Step 8: Verify build**

Run: `npm run build`
Expected: succeeds (will require Task 14's `insights-view` to exist; if executing strictly in order, create a stub first or reorder so Task 14 precedes this build — see note). To keep this task independently buildable, create the stub now if `insights-view.tsx` does not yet exist:
```tsx
// frontend/components/insights-view.tsx (stub — replaced in Task 14)
export function InsightsView(_: { transactions: unknown[]; loading?: boolean }) { return null; }
```

- [ ] **Step 9: Commit**

```bash
git add frontend/components/app-shell.tsx frontend/components/insights-view.tsx
git commit -m "feat(frontend): demo mode, theme toggle, optimistic recat, retry, insights nav"
```

---

### Task 13: `category-donut.tsx` + Overview redesign (hero period, donut, layout)

**Files:**
- Create: `frontend/components/category-donut.tsx`
- Modify: `frontend/components/overview-view.tsx`
- Modify: `frontend/components/hero-card.tsx` (accent ring on the icon; no API change)

**Interfaces:**
- Consumes: `categoryMeta`, `inr`, `CategoryTotal`.
- Produces: `<CategoryDonut categories={...} />`.

- [ ] **Step 1: Donut component.** `frontend/components/category-donut.tsx`:
```tsx
"use client";

import { useMemo, useState } from "react";
import { type CategoryTotal, inr } from "@/lib/api";

const R = 52, STROKE = 22, C = 2 * Math.PI * R, SIZE = 140;

export function CategoryDonut({ categories }: { categories: CategoryTotal[] }) {
  const [active, setActive] = useState<number | null>(null);
  const data = useMemo(
    () => [...categories].map((c) => ({ ...c, total: Number(c.total) })).filter((c) => c.total > 0).sort((a, b) => b.total - a.total).slice(0, 8),
    [categories]
  );
  const sum = data.reduce((s, c) => s + c.total, 0);
  if (sum === 0) {
    return <div className="pc-card" style={{ padding: 20 }}><h3 className="pc-h3" style={{ fontSize: "0.9375rem" }}>Category split</h3><p style={{ color: "var(--pc-ink-3)", fontSize: "0.875rem", marginTop: 12 }}>No spend yet.</p></div>;
  }
  let offset = 0;
  const arcs = data.map((c, i) => {
    const frac = c.total / sum;
    const seg = { c, i, dash: frac * C, offset };
    offset += frac * C;
    return seg;
  });
  const focus = active != null ? data[active] : null;

  return (
    <div className="pc-card pc-card-hover" style={{ padding: 20 }}>
      <h3 className="pc-h3" style={{ fontSize: "0.9375rem", marginBottom: 12 }}>Category split</h3>
      <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Spending by category donut chart" style={{ flexShrink: 0 }}>
          <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
            {arcs.map(({ c, i, dash, offset }) => (
              <circle key={c.category_id} cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none"
                stroke={c.color ?? "var(--pc-other)"} strokeWidth={active === i ? STROKE + 4 : STROKE}
                strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-offset}
                onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}
                style={{ transition: "stroke-width 120ms", cursor: "default" }} />
            ))}
          </g>
          <text x="50%" y="46%" textAnchor="middle" fontSize="11" fill="var(--pc-ink-3)">{focus ? focus.label : "Total"}</text>
          <text x="50%" y="60%" textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--pc-ink)" className="pc-tabular">
            {inr(focus ? focus.total : sum)}
          </text>
        </svg>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 140 }}>
          {data.map((c, i) => (
            <li key={c.category_id} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}
              style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.8125rem", opacity: active == null || active === i ? 1 : 0.5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: c.color ?? "var(--pc-other)", flexShrink: 0 }} aria-hidden="true" />
              <span style={{ color: "var(--pc-ink-2)", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.emoji} {c.label}</span>
              <span className="pc-tabular" style={{ color: "var(--pc-ink)", fontWeight: 600 }}>{Math.round((c.total / sum) * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Overview — wire hero period + donut.** In `overview-view.tsx`:
  - Add import: `import { CategoryDonut } from "@/components/category-donut";`
  - Compute period: `const period = new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" });`
  - Pass it: `<HeroCard total={heroTotal} txnCount={debitCount} period={period} />`
  - Insert `<CategoryDonut categories={categories} />` in the left column between the `CategoryBento` section and the `SpendTrendChart` (only when `!loading`).

- [ ] **Step 3: Hero accent.** In `hero-card.tsx`, change the icon circle `background` from `rgba(255,255,255,0.6)` to `var(--pc-accent-soft)` and the `TrendingUp` `color` to `var(--pc-accent)`.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/category-donut.tsx frontend/components/overview-view.tsx frontend/components/hero-card.tsx
git commit -m "feat(frontend): category donut, hero period + accent on overview"
```

---

### Task 14: Transactions — amount search + CSV export + local date helper

**Files:**
- Modify: `frontend/components/transactions-view.tsx`

**Interfaces:**
- Consumes: `toDayKey`, `dayLabel` from `@/lib/date`; `toCsv`, `downloadCsv` from `@/lib/csv`; `categoryMeta` from `@/lib/api`.

- [ ] **Step 1: Use shared date helpers.** Delete the local `dayLabel` function and the inline day-key logic; import from `@/lib/date`:
```tsx
import { toDayKey, dayLabel } from "@/lib/date";
import { toCsv, downloadCsv } from "@/lib/csv";
import { Download } from "lucide-react";
```
In the grouping memo, change `const dateKey = t.occurred_at.slice(0, 10);` to `const dateKey = toDayKey(t.occurred_at);`. Where `dayLabel(dateKey)` is called, it now resolves to the imported helper (same signature).

- [ ] **Step 2: Search matches merchant OR amount.** In the filter predicate, replace the merchant-only block with:
```tsx
      if (filters.merchant) {
        const q = filters.merchant.toLowerCase().trim();
        const merchantHit = (t.merchant ?? "").toLowerCase().includes(q);
        const amountHit = String(Math.round(Number(t.amount))).includes(q.replace(/[^0-9]/g, ""));
        if (!merchantHit && !(q.replace(/[^0-9]/g, "") !== "" && amountHit)) return false;
      }
```
Update the input `placeholder` to `"Search merchant or amount…"`.

- [ ] **Step 3: Export CSV button.** Add an export handler in the component body:
```tsx
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
```
Add `categoryMeta` to the `@/lib/api` import. In the header `<div>` (next to the count `<p>`), add an export button aligned right:
```tsx
        <button onClick={handleExport} disabled={loading || filtered.length === 0}
          className="pc-btn pc-btn-ghost" style={{ marginLeft: "auto" }} aria-label="Export filtered transactions as CSV">
          <Download size={14} strokeWidth={2} aria-hidden="true" /> Export CSV
        </button>
```
(Wrap the existing header `<div>` content so it's `display:flex; align-items:flex-start; gap:12px` to seat the button on the right.)

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/transactions-view.tsx
git commit -m "feat(frontend): amount search + CSV export; shared date helper"
```

---

### Task 15: `recurring-panel.tsx` + `insights-view.tsx` (replaces stub)

**Files:**
- Create: `frontend/components/recurring-panel.tsx`
- Modify (replace stub): `frontend/components/insights-view.tsx`

**Interfaces:**
- Consumes: `detectRecurring`, `projectMonthEnd`, `monthOverMonth`, `savingsRate` from `@/lib/insights`; `inr` from `@/lib/api`.
- Produces: `<RecurringPanel transactions={...} compact? />`, `<InsightsView transactions={...} loading? />`.

- [ ] **Step 1: Recurring panel.** `frontend/components/recurring-panel.tsx`:
```tsx
"use client";

import { useMemo } from "react";
import { Repeat } from "lucide-react";
import { type Txn, inr } from "@/lib/api";
import { detectRecurring } from "@/lib/insights";

export function RecurringPanel({ transactions, compact }: { transactions: Txn[]; compact?: boolean }) {
  const items = useMemo(() => detectRecurring(transactions), [transactions]);
  const monthlyTotal = items.reduce((s, r) => s + r.monthlyEquivalent, 0);

  return (
    <div className="pc-card" style={{ padding: compact ? "16px 18px" : 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Repeat size={16} strokeWidth={2} color="var(--pc-accent)" aria-hidden="true" />
        <h3 className="pc-h3" style={{ fontSize: "0.9375rem" }}>Subscriptions</h3>
        {items.length > 0 && (
          <span className="pc-badge" style={{ marginLeft: "auto", background: "var(--pc-accent-soft)", color: "var(--pc-accent-strong)" }}>
            ≈ {inr(monthlyTotal)}/mo
          </span>
        )}
      </div>
      {items.length === 0 ? (
        <p style={{ color: "var(--pc-ink-3)", fontSize: "0.875rem" }}>No recurring charges detected yet.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {(compact ? items.slice(0, 3) : items).map((r) => (
            <li key={r.merchant} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 600, fontSize: "0.875rem", color: "var(--pc-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.merchant}</p>
                <p style={{ fontSize: "0.75rem", color: "var(--pc-ink-3)" }}>{r.cadence} · {r.count} charges · ~{inr(r.avgAmount)} each</p>
              </div>
              <span className="pc-tabular" style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--pc-ink)" }}>{inr(r.monthlyEquivalent)}<span style={{ fontSize: "0.7rem", color: "var(--pc-ink-3)" }}>/mo</span></span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Insights view.** Replace `frontend/components/insights-view.tsx`:
```tsx
"use client";

import { useMemo } from "react";
import { TrendingUp, TrendingDown, PiggyBank, CalendarClock } from "lucide-react";
import { type Txn, inr } from "@/lib/api";
import { projectMonthEnd, monthOverMonth, savingsRate } from "@/lib/insights";
import { RecurringPanel } from "@/components/recurring-panel";
import { ChartSkeleton } from "@/components/skeletons";

export function InsightsView({ transactions, loading }: { transactions: Txn[]; loading?: boolean }) {
  const forecast = useMemo(() => projectMonthEnd(transactions), [transactions]);
  const deltas = useMemo(() => monthOverMonth(transactions).filter((d) => d.deltaPct != null).slice(0, 5), [transactions]);
  const savings = useMemo(() => savingsRate(transactions), [transactions]);

  if (loading) {
    return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
      {Array.from({ length: 4 }).map((_, i) => <ChartSkeleton key={i} height={140} />)}
    </div>;
  }

  const thin = forecast.daysElapsed < 5;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h2 className="pc-h2">Insights</h2>
        <p style={{ color: "var(--pc-ink-2)", fontSize: "0.875rem", marginTop: 4 }}>Forecasts, trends and recurring charges from your spending.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
        {/* Projected month-end */}
        <div className="pc-card" style={{ padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <CalendarClock size={16} strokeWidth={2} color="var(--pc-accent)" aria-hidden="true" />
            <h3 className="pc-label">Projected this month</h3>
          </div>
          <p className="pc-h1 pc-tabular" style={{ fontSize: "1.75rem" }}>{inr(forecast.projected)}</p>
          <p style={{ fontSize: "0.8125rem", color: "var(--pc-ink-2)", marginTop: 6 }}>
            {inr(forecast.monthToDate)} spent · day {forecast.daysElapsed} of {forecast.daysInMonth}
            {thin && <span style={{ color: "var(--pc-ink-3)" }}> · early estimate</span>}
          </p>
        </div>

        {/* Savings rate */}
        <div className="pc-card" style={{ padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <PiggyBank size={16} strokeWidth={2} color="var(--pc-credit)" aria-hidden="true" />
            <h3 className="pc-label">Savings rate</h3>
          </div>
          <p className="pc-h1 pc-tabular" style={{ fontSize: "1.75rem", color: savings.rate >= 0 ? "var(--pc-credit)" : "var(--pc-danger)" }}>
            {Math.round(savings.rate * 100)}%
          </p>
          <p style={{ fontSize: "0.8125rem", color: "var(--pc-ink-2)", marginTop: 6 }}>
            {inr(savings.income)} in · {inr(savings.spend)} out
          </p>
        </div>
      </div>

      {/* Top movers */}
      <section aria-labelledby="movers-heading">
        <h3 id="movers-heading" className="pc-label" style={{ marginBottom: 12 }}>Top movers vs last month</h3>
        {deltas.length === 0 ? (
          <div className="pc-card" style={{ padding: 20 }}>
            <p style={{ color: "var(--pc-ink-3)", fontSize: "0.875rem" }}>Not enough history yet — movers appear once you have two months of data.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {deltas.map((d) => {
              const up = (d.deltaPct ?? 0) >= 0;
              return (
                <div key={d.categoryId} className="pc-card" style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: "1.125rem" }} aria-hidden="true">{d.emoji}</span>
                  <span style={{ fontWeight: 600, fontSize: "0.875rem", color: "var(--pc-ink)", flex: 1 }}>{d.label}</span>
                  <span className="pc-tabular" style={{ fontSize: "0.8125rem", color: "var(--pc-ink-2)" }}>{inr(d.lastMonth)} → {inr(d.thisMonth)}</span>
                  <span className="pc-badge" style={{ background: up ? "var(--pc-danger-bg)" : "var(--pc-success-bg)", color: up ? "var(--pc-danger)" : "var(--pc-credit)", display: "inline-flex", alignItems: "center", gap: 3 }}>
                    {up ? <TrendingUp size={11} strokeWidth={2.4} aria-hidden="true" /> : <TrendingDown size={11} strokeWidth={2.4} aria-hidden="true" />}
                    {up ? "+" : ""}{Math.round(d.deltaPct ?? 0)}%
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <RecurringPanel transactions={transactions} />
    </div>
  );
}
```

- [ ] **Step 3: Add the compact recurring panel to Overview.** In `overview-view.tsx`, add `import { RecurringPanel } from "@/components/recurring-panel";` and render `<RecurringPanel transactions={transactions} compact />` in the left column after the budget snapshot section (only when `!loading`).

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/recurring-panel.tsx frontend/components/insights-view.tsx frontend/components/overview-view.tsx
git commit -m "feat(frontend): Insights view — forecast, movers, savings, subscriptions"
```

---

### Task 16: Restyle charts/sync-upload to tokens + accent; centralize keyframes

**Files:**
- Modify: `frontend/components/spend-trend-chart.tsx`
- Modify: `frontend/components/top-categories-chart.tsx`
- Modify: `frontend/components/sync-upload.tsx`
- Modify: `frontend/components/cfo-chat.tsx`

**Interfaces:**
- Consumes: `toDayKey` from `@/lib/date` (trend chart); `isDemo`, `sampleChatReply` from `@/lib/sample-data` (chat).

- [ ] **Step 1: Trend chart date fix + accent.** In `spend-trend-chart.tsx`:
  - Import `toDayKey` from `@/lib/date`.
  - In `buildDailyPoints`, replace `const dateStr = d.toISOString().slice(0, 10);` with `const dateStr = toDayKey(d);` and replace `const date = txn.occurred_at.slice(0, 10);` with `const date = toDayKey(txn.occurred_at);`.
  - Change the line `stroke` from `var(--pc-ink)` to `var(--pc-accent)`, the gradient stops' `stopColor` from `#2E2A26` to `var(--pc-accent)` (keep opacities), and the hover dot `fill` to `var(--pc-accent)`.

- [ ] **Step 2: Top categories — accent on hover** stays category color; no change required beyond confirming tokens. (Bars already use `cat.color`.) Leave as-is.

- [ ] **Step 3: Sync-upload — drop local keyframes.** Remove the entire trailing `<style>{`@keyframes spin …`}</style>` block and change the spinning icon to use the global utility: replace the inline `style={{ animation: syncBusy ? "spin 1s linear infinite" : "none" }}` with `className={syncBusy ? "pc-spin" : undefined}`.

- [ ] **Step 4: CFO chat — demo reply + drop local keyframes.** In `cfo-chat.tsx`:
  - Import: `import { isDemo, sampleChatReply } from "@/lib/sample-data";`
  - At the start of `handleSubmit`'s try (before `fetch`), short-circuit in demo mode:
```tsx
      if (isDemo()) {
        await new Promise((r) => setTimeout(r, 400));
        setMessages((prev) => [...prev, { role: "cfo", text: sampleChatReply(q) }]);
        return;
      }
```
  - The bounce keyframes are now global (Task 8) — remove the trailing `<style>{`@keyframes bounce …`}</style>` block.

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/spend-trend-chart.tsx frontend/components/sync-upload.tsx frontend/components/cfo-chat.tsx
git commit -m "feat(frontend): accent charts, demo chat reply, centralized keyframes"
```

---

### Task 17: Backend static fixes (`api/main.py`)

**Files:**
- Modify: `frontend/api/main.py`

- [ ] **Step 1: Remove dead `except`.** In `cron_sync` (around lines 129-135), delete the unreachable second `except Exception as exc:` block so only one remains:
```python
    try:
        code, payload = _run_gmail_imap_sync()
        return JSONResponse(status_code=code, content=payload)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"cron sync failed: {exc}")
```

- [ ] **Step 2: De-duplicate the double email parse** in `_run_gmail_imap_sync`. The `parsed` count was computed by parsing all emails a second time. Derive the count from the pipeline result instead. Replace the body:
```python
    from pocketcfo.ingest.imap_gmail import fetch_icici
    emails = fetch_icici(user, pwd, since_days=days)
    result = Pipeline(gmail_fetch=lambda _q: emails).sync_gmail()
    payload = result.model_dump()
    payload["fetched"] = len(emails)
    payload["parsed"] = payload.get("inserted", 0) + payload.get("skipped", 0) + payload.get("needs_review", 0)
    return 200, payload
```
(Removes the unused `fetch_icici_transactions` import-and-parse. If `fetch_icici_transactions` is now unused in the module, leave its top-level import only if referenced elsewhere — it is not imported at module top here, it was a local import, so nothing else to clean.)

- [ ] **Step 3: Verify it parses**

Run (from repo root):
```bash
python -m py_compile frontend/api/main.py && echo OK
```
Expected: `OK` (no syntax errors). Note: cannot run the service — no creds.

- [ ] **Step 4: Commit**

```bash
git add frontend/api/main.py
git commit -m "fix(api): remove dead except, de-duplicate gmail email parse"
```

---

### Task 18: Full verification pass (build, lint, tests, browser)

**Files:** none (verification only)

- [ ] **Step 1: Unit tests**

Run (from `frontend/`): `npm test`
Expected: all `lib/` tests PASS.

- [ ] **Step 2: Lint + build**

Run: `npm run lint && npm run build`
Expected: both succeed, no type errors.

- [ ] **Step 3: Browser — demo mode (light).** Start `npm run dev`, open `http://localhost:3000/?demo=1`. Verify with agent-browser:
  - Overview populated: hero shows month + total; donut renders; trend chart day labels align with current dates; bento + top categories + budget snapshot + compact subscriptions all show.
  - Transactions: search by merchant and by amount filters; "Export CSV" downloads a file with the filtered rows.
  - Budgets: over/near/on-track sections render; setting a budget updates (demo: no persistence, but UI responds).
  - Insights: projected spend, savings rate, top movers, subscriptions list render.
  - Recategorize a transaction: category changes immediately with no full-page reload/scroll jump.

- [ ] **Step 4: Browser — dark mode.** Toggle the theme button; confirm the whole app switches to the dark canvas, accent stays vivid, cards/charts/text remain legible. Reload the page — theme persists with **no white flash**.

- [ ] **Step 5: Browser — responsive.** Narrow to mobile width: sidebar collapses to a drawer (hamburger), grids stack, no horizontal scroll.

- [ ] **Step 6: Console check.** No errors/warnings in the browser console (especially no React hydration warnings).

- [ ] **Step 7: Final commit (if any verification fixes were needed).** Otherwise nothing to commit. Report the branch state and a summary of commits.

---

## Self-Review

**Spec coverage:**
- §4 design tokens → Task 8. ✓
- §5.1 dark mode → Tasks 7, 9, 10, 8. ✓
- §5.2 recurring → Tasks 5, 15. ✓
- §5.3 search/filters/CSV → Tasks 4, 14. ✓
- §5.4 forecast & insights → Tasks 6, 15, 12 (nav). ✓
- §6 bugs: date (2,14,16), category meta (3), inr NaN (3), optimistic recat (12), hero period (13), keyframes (8,16), breakpoint (12), retry (12), backend (17). ✓
- §7 sample data → Task 11, wired in 12 + 16. ✓
- §8 testing → Tasks 1, 18. ✓

**Placeholder scan:** No TBD/TODO; the only stub (`insights-view` in Task 12) is explicitly created then replaced in Task 15. ✓

**Type consistency:** `Txn`/`CategoryTotal`/`BudgetStatus` reused from `@/lib/api`; `categoryMeta`/`inr` signatures consistent across tasks; `detectRecurring`/`projectMonthEnd`/`monthOverMonth`/`savingsRate` names match between Tasks 5/6 and consumer Task 15; `toDayKey`/`dayLabel` consistent between Task 2 and consumers 14/16. ✓

**Note on ordering:** Task 12 references `InsightsView` (real component in Task 15) — it creates a temporary stub so each task stays independently buildable; Task 15 replaces it. If executed out of order, the stub keeps the build green.
