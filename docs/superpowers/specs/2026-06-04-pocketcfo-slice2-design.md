# PocketCFO — Slice 2 Design Spec

**Date:** 2026-06-04
**Status:** Approved
**Slice:** 2 of 4 — real Gmail ingestion (agent-mediated) + local store

---

## 1. Purpose

Slice 1 proved the pipe with CSV/PDF upload. Slice 2 turns on **Gmail-sourced
ingestion** and makes the system demoable end-to-end with **zero cloud setup**.

Key constraint (decided during brainstorming): the **Gmail MCP runs in the
Claude agent session, not in the deployed FastAPI app**. The SDK runs
server-side and cannot call MCP tools. Therefore Slice 2 ingestion is
**agent-mediated**: the agent (acting as the Ingest Agent) searches ICICI alert
emails via the Gmail MCP and feeds them through the SDK's existing
`fetch_icici_transactions(fetch_emails)` seam. Deployed unattended auto-sync
(Google OAuth + Gmail REST inside the app) remains deferred to a later slice.

### In scope
- `LocalStore` — SQLite-backed store implementing the same interface as the
  Supabase `Store`, so the full ingest→categorize→store→query flow runs with no
  credentials.
- Store factory — selects `LocalStore` (default/dev) or Supabase `Store`
  (when `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` are set) by environment.
- `mcp_bridge` — takes Gmail-MCP email dicts and runs them through the pipeline.
- Live demo: agent authenticates Gmail MCP, pulls ICICI alerts, ingests with the
  **real Claude categorizer** (`ANTHROPIC_API_KEY` provided by the user).

### Out of scope
- Google OAuth / Gmail REST inside the deployed app (later slice).
- More bank parsers, budgets, net worth (later slices).
- Migrating local SQLite data into Supabase.

---

## 2. Components

| Module | Responsibility | Interface (must match Supabase `Store`) |
|--------|----------------|------------------------------------------|
| `pocketcfo.store_local.LocalStore` | SQLite persistence | `insert_transactions(txns)->(inserted,skipped)`, `list_transactions(limit=50)->list[dict]`, `spend_by_category()->list[CategoryTotal]` |
| `pocketcfo.store_factory.get_store()` | Pick store by env | returns a store instance |
| `pocketcfo.ingest.mcp_bridge.ingest_emails(emails, pipeline=None)` | Email dicts → pipeline | returns `SyncResult` |

### 2.1 `LocalStore` (SQLite)
- File path from `POCKETCFO_DB` env (default `~/.pocketcfo/pocketcfo.db`).
- On init: create `categories` + `transactions` tables (mirror `schema.sql`
  types; SQLite affinity), seed the 10 categories if absent.
- `insert_transactions`: dedup on `dedup_key` (UNIQUE); use
  `INSERT OR IGNORE`; count inserted vs skipped via `rowcount`/pre-check.
- Money stored as TEXT (Decimal string) to avoid float drift; read back as
  `Decimal`. `spend_by_category` sums debits only, returns `CategoryTotal`
  joined with category metadata, sorted by total desc — identical semantics to
  the Supabase store.

### 2.2 Store factory
- `get_store()`: if `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are both set →
  Supabase `Store()`, else `LocalStore()`.
- `Pipeline` and `CFO` default their store to `get_store()` instead of `Store()`
  so dev runs pick LocalStore automatically. Injected stores still override.

### 2.3 `mcp_bridge`
- `ingest_emails(emails: list[dict], pipeline: Pipeline | None = None) -> SyncResult`
- Reuses `fetch_icici_transactions(lambda _q: emails)` to parse, then
  `pipeline._store_raws(...)` (or a public pipeline method) to categorize+store.
- `pipeline` defaults to `Pipeline()` (real categorizer + factory store).
- Pure function of its inputs — the agent supplies `emails` after a Gmail MCP
  search; no MCP dependency inside the SDK.

---

## 3. Data flow (live demo)

```
Agent: mcp Gmail authenticate → search 'ICICI debited/credited/Credit Card'
     → list of {snippet/body} dicts
        │
ingest_emails(emails)  →  fetch_icici_transactions → RawTransaction[]
        │
Pipeline → Categorizer (real Claude, ANTHROPIC_API_KEY) → Transaction[]
        │
get_store() → LocalStore (SQLite)   [no Supabase creds needed]
        │
spend_by_category / list_transactions  → (visible via SDK; app reads when wired)
```

---

## 4. Error handling
- `LocalStore` creates its parent dir; on locked/corrupt DB raises a clear error.
- Gmail MCP not authenticated → the agent reports it and prompts the user to
  connect; nothing is fabricated.
- Categorizer failure → existing fallback ("other", confidence 0) — unchanged.
- Empty Gmail result → `SyncResult(0,0,0)`; the agent says "no new ICICI alerts".

---

## 5. Testing
- `LocalStore` unit tests (pytest, temp DB via `tmp_path`): dedup collapses
  duplicates; `spend_by_category` sums debits only with correct metadata + sort;
  `list_transactions` newest-first; Decimal round-trips through TEXT.
- Store factory: returns LocalStore with no Supabase env; returns Supabase store
  when both vars set (patched/monkeypatched — no live connection).
- `mcp_bridge`: with a stub categorizer + LocalStore (tmp), a sample ICICI email
  dict produces 1 inserted, correct category; re-ingest fully deduped.
- Full existing suite stays green.

---

## 6. Deliverable definition ("done")
1. `LocalStore` passes tests; same interface as Supabase `Store`.
2. `get_store()` selects correctly by env; `Pipeline`/`CFO` use it by default.
3. `mcp_bridge.ingest_emails` ingests email dicts end-to-end into LocalStore.
4. Live: agent authenticates Gmail MCP, pulls real ICICI alerts, ingests with
   real Claude categorization into LocalStore, and can answer a CFO question
   from that data.
