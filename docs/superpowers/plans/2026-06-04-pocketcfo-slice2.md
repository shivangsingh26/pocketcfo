# PocketCFO Slice 2 Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement task-by-task. Checkbox (`- [ ]`) steps.

**Goal:** Agent-mediated Gmail ingestion + a credential-free LocalStore so the full pipe runs end-to-end with real Claude categorization.

**Architecture:** New `LocalStore` (SQLite) mirrors the Supabase `Store` interface; a `get_store()` factory picks store by env; `mcp_bridge.ingest_emails` feeds Gmail-MCP email dicts through the existing `fetch_icici_transactions` seam into the pipeline. The agent (Ingest Agent) supplies emails after a Gmail MCP search.

**Tech Stack:** Python 3.12, sqlite3 (stdlib), existing `pocketcfo` SDK, pytest.

**Spec:** docs/superpowers/specs/2026-06-04-pocketcfo-slice2-design.md

---

## Task S1: LocalStore (SQLite)

**Files:**
- Create: `sdk/pocketcfo/store_local.py`
- Test: `sdk/tests/test_store_local.py`

- [ ] **Step 1: Failing test** `sdk/tests/test_store_local.py`
```python
from datetime import datetime
from decimal import Decimal
from pocketcfo.models import Transaction
from pocketcfo.store_local import LocalStore


def _txn(merchant, amount, cat, day=1, direction="debit"):
    return Transaction(
        occurred_at=datetime(2026, 5, day, 12, 0), amount=Decimal(str(amount)),
        direction=direction, merchant=merchant, account="ICICI-card",
        raw_text="x", source="gmail", category_id=cat, confidence=0.8,
    )


def test_insert_dedups(tmp_path):
    store = LocalStore(db_path=str(tmp_path / "t.db"))
    t = _txn("SWIGGY", 250, "food")
    assert store.insert_transactions([t, t]) == (1, 1)


def test_spend_by_category_debits_only_with_meta(tmp_path):
    store = LocalStore(db_path=str(tmp_path / "t.db"))
    store.insert_transactions([
        _txn("SWIGGY", 250, "food"),
        _txn("UBER", 120, "transport", day=2),
        _txn("SALARY", 9999, "other", day=3, direction="credit"),
    ])
    totals = {c.category_id: c for c in store.spend_by_category()}
    assert totals["food"].total == Decimal("250")
    assert "transport" in totals and "other" not in totals  # credit excluded
    assert totals["food"].label == "Food" and totals["food"].emoji  # metadata joined
    assert store.spend_by_category()[0].category_id == "food"  # sorted desc


def test_list_transactions_newest_first(tmp_path):
    store = LocalStore(db_path=str(tmp_path / "t.db"))
    store.insert_transactions([_txn("OLD", 10, "food", day=1),
                               _txn("NEW", 20, "food", day=9)])
    assert store.list_transactions()[0]["merchant"] == "NEW"


def test_decimal_roundtrip(tmp_path):
    store = LocalStore(db_path=str(tmp_path / "t.db"))
    store.insert_transactions([_txn("X", "1234.56", "food")])
    assert store.spend_by_category()[0].total == Decimal("1234.56")
```

- [ ] **Step 2: Run, verify FAIL** `cd sdk && uv run pytest tests/test_store_local.py -v`

- [ ] **Step 3: Implement** `sdk/pocketcfo/store_local.py`
```python
import os
import sqlite3
from collections import defaultdict
from decimal import Decimal
from pathlib import Path
from .models import Transaction, CategoryTotal

_SEED = [
    ("food", "Food", "🍔", "#FFD8C2"), ("travel", "Travel", "✈️", "#FCEFB4"),
    ("clothing", "Clothing", "👕", "#E3D5F1"), ("groceries", "Groceries", "🛒", "#CDEAD9"),
    ("bills", "Bills", "🧾", "#C7E0F4"), ("entertainment", "Entertainment", "🎬", "#F7D6E0"),
    ("health", "Health", "💊", "#D9EAD3"), ("transport", "Transport", "🚗", "#FCE3C3"),
    ("shopping", "Shopping", "🛍️", "#E0D7F5"), ("other", "Other", "❓", "#E4E0D8"),
]


class LocalStore:
    def __init__(self, db_path: str | None = None):
        path = db_path or os.environ.get(
            "POCKETCFO_DB", str(Path.home() / ".pocketcfo" / "pocketcfo.db"))
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(path)
        self.conn.row_factory = sqlite3.Row
        self._init_schema()

    def _init_schema(self) -> None:
        c = self.conn
        c.execute("create table if not exists categories ("
                  "id text primary key, label text not null, emoji text, color text)")
        c.execute("create table if not exists transactions ("
                  "id integer primary key autoincrement, occurred_at text not null,"
                  "amount text not null, direction text not null, merchant text,"
                  "raw_text text, source text not null, account text,"
                  "category_id text, confidence real, dedup_key text unique)")
        c.execute("create index if not exists txn_occurred on transactions(occurred_at)")
        for row in _SEED:
            c.execute("insert or ignore into categories(id,label,emoji,color) values (?,?,?,?)", row)
        c.commit()

    def insert_transactions(self, txns: list[Transaction]) -> tuple[int, int]:
        inserted = skipped = 0
        for t in txns:
            key = t.dedup_key()
            cur = self.conn.execute(
                "insert or ignore into transactions"
                "(occurred_at,amount,direction,merchant,raw_text,source,account,"
                "category_id,confidence,dedup_key) values (?,?,?,?,?,?,?,?,?,?)",
                (t.occurred_at.isoformat(), str(t.amount), t.direction, t.merchant,
                 t.raw_text, t.source, t.account, t.category_id, t.confidence, key))
            if cur.rowcount:
                inserted += 1
            else:
                skipped += 1
        self.conn.commit()
        return inserted, skipped

    def list_transactions(self, limit: int = 50) -> list[dict]:
        rows = self.conn.execute(
            "select * from transactions order by occurred_at desc limit ?", (limit,)
        ).fetchall()
        return [dict(r) for r in rows]

    def spend_by_category(self) -> list[CategoryTotal]:
        cats = {r["id"]: r for r in self.conn.execute("select * from categories").fetchall()}
        totals: dict[str, Decimal] = defaultdict(Decimal)
        for r in self.conn.execute(
                "select category_id, amount from transactions where direction='debit'"):
            totals[r["category_id"]] += Decimal(r["amount"])
        out = []
        for cid, total in totals.items():
            m = cats.get(cid)
            out.append(CategoryTotal(
                category_id=cid, label=(m["label"] if m else cid),
                emoji=(m["emoji"] if m else None), color=(m["color"] if m else None),
                total=total))
        return sorted(out, key=lambda c: c.total, reverse=True)
```

- [ ] **Step 4: Run, verify PASS** `cd sdk && uv run pytest tests/test_store_local.py -v` then full suite `cd sdk && uv run pytest -v`.

---

## Task S2: Store factory

**Files:**
- Create: `sdk/pocketcfo/store_factory.py`
- Modify: `sdk/pocketcfo/pipeline.py` (default store → `get_store()`), `sdk/pocketcfo/agents/cfo.py` (default store → `get_store()`)
- Test: `sdk/tests/test_store_factory.py`

- [ ] **Step 1: Failing test** `sdk/tests/test_store_factory.py`
```python
from pocketcfo.store_factory import get_store
from pocketcfo.store_local import LocalStore


def test_defaults_to_local_without_supabase(monkeypatch, tmp_path):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_KEY", raising=False)
    monkeypatch.setenv("POCKETCFO_DB", str(tmp_path / "t.db"))
    assert isinstance(get_store(), LocalStore)


def test_uses_supabase_when_env_set(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://x.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "key")
    created = {}
    import pocketcfo.store_factory as f
    monkeypatch.setattr(f, "Store", lambda: created.setdefault("supabase", object()))
    get_store()
    assert "supabase" in created
```

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Implement** `sdk/pocketcfo/store_factory.py`
```python
import os
from .store import Store
from .store_local import LocalStore


def get_store():
    """Pick the store by environment: Supabase if configured, else local SQLite."""
    if os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_KEY"):
        return Store()
    return LocalStore()
```
Then change `pipeline.py` `__init__`: `self.store = store or get_store()` (import `from .store_factory import get_store`; remove the direct `Store` default). Change `cfo.py` `__init__`: `self.store = store or get_store()` (import inside as needed to avoid cycles). Do NOT change injected-store behavior — tests still pass stubs.

- [ ] **Step 4: Run full suite** `cd sdk && uv run pytest -v` — all green (Slice 1 pipeline/cfo tests still pass because they inject stores).

---

## Task S3: MCP→pipeline bridge

**Files:**
- Create: `sdk/pocketcfo/ingest/mcp_bridge.py`
- Test: `sdk/tests/test_mcp_bridge.py`

- [ ] **Step 1: Failing test** `sdk/tests/test_mcp_bridge.py`
```python
from pocketcfo.ingest.mcp_bridge import ingest_emails
from pocketcfo.pipeline import Pipeline
from pocketcfo.models import Transaction, SyncResult


class StubCategorizer:
    def categorize(self, raw):
        return Transaction(**raw.model_dump(), category_id="food", confidence=0.9)


class MemStore:
    def __init__(self): self.rows = []
    def insert_transactions(self, txns):
        existing = {r.dedup_key() for r in self.rows}
        new = [t for t in txns if t.dedup_key() not in existing]
        self.rows.extend(new)
        return len(new), len(txns) - len(new)


EMAIL = {"snippet": "ICICI Bank Credit Card XX1 used for INR 250.00 on 02-May-26 at SWIGGY. Available limit: INR 1.00."}
JUNK = {"snippet": "Newsletter: budgeting tips"}


def test_ingest_emails_parses_and_stores():
    store = MemStore()
    pipe = Pipeline(store=store, categorizer=StubCategorizer())
    result = ingest_emails([EMAIL, JUNK], pipeline=pipe)
    assert isinstance(result, SyncResult)
    assert result.inserted == 1
    assert store.rows[0].category_id == "food"


def test_ingest_emails_dedups_on_reingest():
    store = MemStore()
    pipe = Pipeline(store=store, categorizer=StubCategorizer())
    ingest_emails([EMAIL], pipeline=pipe)
    again = ingest_emails([EMAIL], pipeline=pipe)
    assert again.inserted == 0 and again.skipped == 1
```

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Implement** `sdk/pocketcfo/ingest/mcp_bridge.py`
```python
from .gmail import fetch_icici_transactions
from ..pipeline import Pipeline
from ..models import SyncResult


def ingest_emails(emails: list[dict], pipeline: Pipeline | None = None) -> SyncResult:
    """Ingest Gmail-MCP email dicts (each with 'snippet' and/or 'body') through
    the pipeline. The agent supplies `emails` after a Gmail MCP search."""
    pipe = pipeline or Pipeline()
    raws = fetch_icici_transactions(fetch_emails=lambda _q: emails)
    return pipe._store_raws(raws)
```
Note: `_store_raws` is reused. If a public method is preferred, add `Pipeline.store_raws = _store_raws` alias — but reuse is fine for Slice 2.

- [ ] **Step 4: Run full suite** `cd sdk && uv run pytest -v` — all green.

---

## Task S4: Live Gmail run (agent-executed, needs user creds)

This task is executed by the controller agent, not a subagent. Requires: Gmail MCP authenticated (user consent) + `ANTHROPIC_API_KEY` set.

- [ ] **Step 1:** Authenticate Gmail MCP (trigger connect; user approves Google consent).
- [ ] **Step 2:** Search ICICI alert emails via the Gmail MCP (query: from icicibank, debited/credited/Credit Card). Collect into `[{"body": ...}, ...]` dicts.
- [ ] **Step 3:** With `ANTHROPIC_API_KEY` in env and no Supabase env (so LocalStore is used), run a short Python script: `ingest_emails(emails)` → print the `SyncResult`.
- [ ] **Step 4:** Run `CFO().ask("where did my money go?")` against the LocalStore and show the answer. Confirm the demo: real emails → real categorization → stored → queried.
- [ ] **Step 5:** Report counts + the CFO answer to the user.

---

## Self-Review notes
- Spec coverage: LocalStore (S1), factory + Pipeline/CFO wiring (S2), bridge (S3), live demo (S4).
- Interface parity: `LocalStore` methods + semantics (debits-only sum, newest-first, Decimal) match the Supabase `Store` so `get_store()` is transparent to `Pipeline`/`CFO`/API.
- Slice 1 tests keep passing because pipeline/cfo tests inject stores; only the *default* store changed.
