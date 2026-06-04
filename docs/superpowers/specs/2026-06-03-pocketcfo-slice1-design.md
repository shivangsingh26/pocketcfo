# PocketCFO — Slice 1 Design Spec

**Date:** 2026-06-03
**Status:** Draft for review
**Slice:** 1 of 4 (vertical skeleton — proves the full pipe end-to-end)

---

## 1. Purpose

PocketCFO is a personal, single-user wealth-management system: ingest all
transactions, bucket them into spend categories (food, travel, clothing, …),
surface where money leaks, and let the user manage everything through one
bento-style dashboard with a conversational "CFO". No third-party app, no
manual bookkeeping.

Slice 1 builds the **thinnest end-to-end vertical** that proves every layer
works together. Later slices widen coverage (more banks, budgets, net worth,
reports). This spec covers **only Slice 1**.

### In scope (Slice 1)
- Monorepo with two subrepos: `sdk/` (Python) and `frontend/` (Next.js).
- Supabase Postgres schema for transactions and categories.
- **Ingest** ICICI bank + card transaction-alert emails via the Gmail MCP.
- **Upload** path: user uploads CSV and PDF statements; system parses them.
- **Categorizer** agent: assigns each transaction a spend category via Claude.
- **Bento dashboard**: pastel, scannable, glass hero card (net spend), category
  tiles, recent transactions list.
- **Basic CFO chat**: ask questions about your spend; agent answers from the DB.

### Out of scope (later slices)
- Other banks/cards beyond ICICI alert formats (Slice 2).
- Category-correction learning loop (Slice 2).
- Budgets, overspend nudges, Cron scheduling (Slice 3).
- Savings / net-worth tracking, Drive report export, Calendar reminders (Slice 4).
- Multi-user / auth beyond a single owner.

---

## 2. Architecture

```
                         ┌──────────────────────────────┐
   Gmail (ICICI alerts) ─▶  Ingest (Gmail MCP)           │
   CSV / PDF upload ──────▶  Statement parser            │  sdk/  (Python, uv)
                         │                                │
                         │  Categorizer agent (Claude)    │
                         └───────────────┬────────────────┘
                                         ▼
                          Supabase Postgres (transactions, categories)
                                         ▲
                         ┌───────────────┴────────────────┐
                         │  Insights / chat query layer    │  sdk/
                         └───────────────┬────────────────┘
                                         │ HTTP (JSON)
                         ┌───────────────▼────────────────┐
                         │  Next.js frontend (Vercel)      │
                         │  • Python serverless funcs that │
                         │    import the SDK               │
                         │  • Bento dashboard + CFO chat   │
                         └─────────────────────────────────┘
```

**Why Python SDK as a backend service:** a JS frontend cannot import a Python
package. The SDK is the agent engine; the frontend's Python serverless
functions import it and expose JSON endpoints the React UI calls. Frontend
"uses the SDK" by depending on these endpoints.

---

## 3. Components

### 3.1 `sdk/` — Python package (`uv`, `pyproject.toml`)

Package name: `pocketcfo`. Modules, each with one clear responsibility:

| Module | Responsibility | Depends on |
|--------|----------------|------------|
| `pocketcfo.config` | Load env (Supabase URL/key, Anthropic key) | env vars |
| `pocketcfo.models` | Pydantic models: `RawTransaction`, `Transaction`, `Category` | — |
| `pocketcfo.store` | Supabase client; CRUD for transactions & categories | Supabase |
| `pocketcfo.ingest.gmail` | Fetch ICICI alert emails, return `RawTransaction[]` | Gmail MCP |
| `pocketcfo.ingest.statements` | Parse CSV + PDF statements → `RawTransaction[]` | pdfplumber, csv |
| `pocketcfo.parse.icici` | Regex/templates: ICICI alert/statement → amount, merchant, date, direction | — |
| `pocketcfo.agents.categorizer` | Claude call: `RawTransaction` → category + confidence | Anthropic SDK |
| `pocketcfo.agents.cfo` | Answer NL questions using DB query tools | Anthropic SDK, store |
| `pocketcfo.pipeline` | Orchestrate: ingest → parse → categorize → store (dedup) | all above |

**Interfaces (stable contracts):**
- `pipeline.sync_gmail() -> SyncResult` — pull new ICICI alerts, store categorized txns.
- `pipeline.ingest_file(path, kind) -> SyncResult` — parse uploaded CSV/PDF, store.
- `agents.cfo.ask(question: str) -> ChatAnswer` — NL Q&A over the data.
- `store.list_transactions(filters) -> list[Transaction]`
- `store.spend_by_category(period) -> list[CategoryTotal]`

### 3.2 Supabase schema

```sql
-- categories: fixed seed set for Slice 1
create table categories (
  id          text primary key,          -- 'food','travel','clothing',...
  label       text not null,
  emoji       text,
  color       text                        -- pastel hex for the tile
);

create table transactions (
  id            uuid primary key default gen_random_uuid(),
  occurred_at   timestamptz not null,
  amount        numeric(14,2) not null,   -- positive number
  direction     text not null check (direction in ('debit','credit')),
  merchant      text,
  raw_text      text,                     -- original alert/statement line
  source        text not null,            -- 'gmail' | 'csv' | 'pdf'
  account       text,                     -- 'ICICI-bank' | 'ICICI-card'
  category_id   text references categories(id),
  confidence    numeric(3,2),             -- categorizer confidence 0..1
  dedup_key     text unique,              -- hash(date+amount+merchant+account)
  created_at    timestamptz default now()
);
create index on transactions (occurred_at);
create index on transactions (category_id);
```

Seed categories (Slice 1): food, travel, clothing, groceries, bills,
entertainment, health, transport, shopping, other. Each with emoji + pastel
color matching the bento palette.

**Dedup:** `dedup_key = sha1(occurred_at|amount|merchant|account)`. Gmail and
statement imports of the same transaction collapse to one row.

### 3.3 `frontend/` — Next.js on Vercel

- **App Router**, Tailwind + shadcn/ui, Vercel AI SDK for the chat stream.
- **Design:** Bento grid dashboard, glass hero card. Pastel candy tiles on warm
  cream (`#F4F1EA` bg). Palette tokens defined in spec §6.
- **Python serverless functions** (Vercel Python runtime) under `frontend/api/`
  import `pocketcfo` and expose:
  - `POST /api/sync` → `pipeline.sync_gmail()`
  - `POST /api/upload` (multipart) → `pipeline.ingest_file()`
  - `GET  /api/transactions` → `store.list_transactions()`
  - `GET  /api/summary?period=` → `store.spend_by_category()`
  - `POST /api/chat` → streams `agents.cfo.ask()`
- **Pages/sections:**
  - Hero (glass): total spend this period + delta.
  - Category bento tiles: per-category total, emoji, pastel color, % of spend.
  - Recent transactions list (merchant, amount, category chip, source badge).
  - CFO chat panel: ask "where did my money go in May?".
  - Sync button + Upload (drag CSV/PDF) control.

---

## 4. Data flow (happy path)

1. User clicks **Sync** → `/api/sync` → `pipeline.sync_gmail()`.
2. Ingest pulls ICICI alert emails since last sync (Gmail MCP, query by sender/subject).
3. `parse.icici` extracts amount/merchant/date/direction → `RawTransaction[]`.
4. Categorizer (Claude) assigns each a category + confidence.
5. `store` writes rows, skipping existing `dedup_key`s.
6. Dashboard refetches `/api/summary` + `/api/transactions` → bento updates.
7. Upload path: same from step 3 using `parse.icici` statement templates.
8. Chat: `/api/chat` → CFO agent queries the store, answers in natural language.

---

## 5. Error handling

- **Gmail MCP auth not connected:** `/api/sync` returns a clear "connect Gmail"
  state; UI shows a connect prompt rather than failing silently.
- **Unparseable alert/statement line:** stored as `RawTransaction` with
  `category_id = 'other'`, `confidence = 0`, full `raw_text` kept for review.
  Never drop data silently — surface a "needs review" count.
- **Categorizer/Claude failure:** transaction still stored uncategorized
  (`other`, confidence 0); a retry can re-categorize later.
- **Duplicate import:** dedup_key uniqueness prevents double-counting; pipeline
  reports inserted vs skipped counts.
- **PDF with no extractable text (scanned image):** return a typed error telling
  the user that statement isn't machine-readable (OCR is out of scope for Slice 1).
- **Secrets:** Supabase service key + Anthropic key live only in Vercel env /
  local `.env`, never in the repo or client bundle.

---

## 6. Visual design tokens (Bento + glass)

```
bg            #F4F1EA   warm cream
ink           #2E2A26   primary text
tile.food         #FFD8C2  peach
tile.travel       #FCEFB4  butter
tile.clothing     #E3D5F1  lilac
tile.groceries    #CDEAD9  mint
tile.bills        #C7E0F4  sky
tile.entertainment#F7D6E0  blush
tile.health       #D9EAD3  sage
tile.transport    #FCE3C3  apricot
tile.shopping     #E0D7F5  periwinkle
tile.other        #E4E0D8  stone
hero          glass: rgba(255,255,255,.45) + blur over pastel gradient
radius        14–20px   font  Inter (UI), tabular nums for money
```

Constraint: light but not blinding — mid-pastel saturation, never pure white
surfaces; cream/off-white base to reduce eye strain.

---

## 7. Testing strategy

- **SDK unit tests (pytest):**
  - `parse.icici`: fixture emails + statement lines → expected fields (table-driven).
  - `store`: dedup_key collapses duplicates; CRUD round-trips (against a test
    Supabase schema or a local Postgres).
  - `pipeline`: ingest→categorize→store with a stubbed categorizer (no live LLM).
  - Categorizer: contract test with a mocked Anthropic client (assert prompt +
    parse of structured output), plus a small live smoke test gated by env key.
- **Frontend:** component render tests for bento tiles + hero; API route tests
  with the SDK mocked.
- **End-to-end smoke:** seeded fixture transactions → dashboard renders correct
  category totals; chat answers a known question correctly.

---

## 8. Open questions / assumptions

- Assumes Gmail MCP can be authorized for the user's account at runtime.
- Assumes ICICI alert email formats are stable enough for template parsing;
  parser is built defensively (unmatched → `other` + needs-review).
- Currency fixed to INR for Slice 1.
- Single user; no auth gate in Slice 1 (the deployment is private to the owner).
  Auth is added before any multi-user or public exposure.

---

## 9. Deliverable definition (Slice 1 "done")

1. `sdk/` installs via `uv`, `pytest` green.
2. Supabase schema migrated; categories seeded.
3. `sync_gmail()` ingests + categorizes ICICI alerts into Supabase.
4. CSV and PDF upload parse into the same pipeline.
5. Frontend bento dashboard shows live category totals + recent txns.
6. CFO chat answers a spend question from real data.
7. Runs locally end-to-end; deployable to Vercel (deploy itself can be Slice-1 tail or Slice-2 head).
