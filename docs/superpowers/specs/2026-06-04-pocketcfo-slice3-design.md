# PocketCFO — Slice 3 Design Spec

**Date:** 2026-06-04
**Status:** Approved (focus: both, sequenced — 3A then 3B)
**Slice:** 3 of 4

---

## 1. Purpose

Make categorization self-correcting (3A) and give the user budget control with
overspend nudges (3B) — directly serving the "understand and avoid spending"
goal. Both stores (`LocalStore` dev, Supabase `Store` prod) keep interface
parity; the API + dashboard expose the new capabilities.

---

## 3A. Category-correction learning

**Idea:** the user re-tags a transaction in the dashboard. The system (a) updates
that transaction, (b) remembers a `merchant → category` rule, and (c) re-applies
the rule to all existing transactions of that merchant. The categorizer consults
rules before calling Claude, so future imports of the same merchant auto-tag
(confidence 1.0, no LLM call).

**Merchant key:** `merchant.strip().upper()` (exact normalized match). Different
raw strings ("BLINKIT" vs "BLINK COMMERCE PVT LTD") stay distinct rules.

**Storage (both stores + schema.sql):**
- Table `merchant_rules(merchant_key text primary key, category_id text not null)`.
- Methods:
  - `upsert_rule(merchant_key, category_id)`
  - `get_rules() -> dict[str, str]`
  - `recategorize(transaction_id, category_id) -> dict` — set that txn's category
    (confidence 1.0), upsert the rule from its merchant, and bulk-update every
    txn with the same merchant_key to the new category. Returns counts.

**Categorizer change:** `Categorizer(rules: dict | None)`. In `categorize`, if the
txn's `merchant_key` is in `rules`, return that category with confidence 1.0 and
skip the LLM. Pipeline passes `store.get_rules()` into the categorizer.

**API:** `POST /api/recategorize {transaction_id, category_id}` →
`store.recategorize(...)` → returns updated counts.

**UI:** each transaction row's category chip becomes a `<select>` of the 10
categories; changing it POSTs to `/api/recategorize` then refreshes the dashboard
(tiles + list update; the rule now sticks for future syncs).

---

## 3B. Budgets + overspend nudges

**Idea:** per-category monthly budget; dashboard shows progress; a nudge banner
flags categories at/over limit.

**Storage (both stores + schema.sql):**
- Table `budgets(category_id text primary key, monthly_limit text)` (Decimal as
  text in SQLite, numeric in Supabase).
- Methods:
  - `set_budget(category_id, monthly_limit)`
  - `budget_status(year, month) -> list[BudgetStatus]` — for the given month,
    per budgeted category: `spent` (debits in that month), `limit`, `pct`,
    `over` (bool). Default month = the most recent month present in the data
    (so the demo, whose data is Mar–Apr, shows meaningful numbers).

**Model:** `BudgetStatus(category_id, label, emoji, color, spent: Decimal,
limit: Decimal, pct: float, over: bool)`.

**Coach (nudges):** rule-based — any category with `pct >= 0.8` yields a nudge
string ("Dining is at 92% of its ₹5,000 budget"); `over` → stronger wording. The
CFO agent gains a `budget_status` tool so chat can answer budget questions too.

**API:** `GET /api/budgets?year=&month=` → `{statuses: [...], nudges: [...]}`;
`POST /api/budgets {category_id, monthly_limit}`.

**UI:** a "Budgets" section — per budgeted category a pastel progress bar (fill =
pct, red tint when over), an inline input to set/edit the limit, and a nudge
banner listing at-risk categories.

---

## 4. Error handling
- `recategorize` with unknown `transaction_id` → 404-style error; unknown
  `category_id` (not one of the 10) → 400. No silent writes.
- `set_budget` with non-positive limit → rejected.
- `budget_status` with no budgets set → empty list, no nudges (UI shows "set a
  budget to start").
- Decimal-as-text round-trips preserved (as in Slice 2).

## 5. Testing
- LocalStore: rule upsert/get; recategorize updates the txn + all same-merchant
  txns + creates rule; categorizer skips LLM when rule matches (confidence 1.0);
  set_budget + budget_status math (spent/limit/pct/over) for a given month;
  most-recent-month default.
- Supabase `Store`: same methods via `FakeSupabase` (parity).
- Pipeline: passes rules into categorizer; a ruled merchant needs no LLM.
- API/UI: recategorize round-trip; budget set + status; nudge generation.
- Full prior suite stays green.

## 6. Done
1. Both stores implement merchant_rules + budgets with parity; schema.sql updated.
2. Correcting a category in the UI updates past txns and sticks for future syncs.
3. Budgets settable in the UI; progress bars + nudges render; CFO can answer
   budget questions.
