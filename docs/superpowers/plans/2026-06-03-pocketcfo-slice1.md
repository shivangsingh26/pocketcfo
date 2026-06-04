# PocketCFO Slice 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the thinnest end-to-end PocketCFO vertical: ingest ICICI transaction emails + uploaded CSV/PDF statements, categorize each transaction with Claude, store in Supabase, and show it on a pastel bento dashboard with a basic CFO chat.

**Architecture:** A Python package `pocketcfo` (the SDK / agent engine, managed with `uv`) owns all logic: ingestion, parsing, categorization, storage, and chat. A Next.js frontend on Vercel exposes Python serverless functions that import the SDK and serves a bento dashboard that calls those endpoints.

**Tech Stack:** Python 3.12, `uv`, Pydantic, Supabase (Postgres + `supabase-py`), Anthropic SDK (Claude), `pdfplumber`, pytest; Next.js (App Router) + Tailwind + shadcn/ui + Vercel AI SDK on Vercel.

**Spec:** [docs/superpowers/specs/2026-06-03-pocketcfo-slice1-design.md](../specs/2026-06-03-pocketcfo-slice1-design.md)

---

## Framework-doc verification (do this when you reach frontend/integration tasks)

Training data for these is unreliable — verify live before writing the code in Tasks 5, 6, 8, 9, 10, 12:
- **Gmail MCP** — tool names/signatures via the available `mcp__claude_ai_Gmail__*` tools (Task 5).
- **Anthropic SDK** — invoke the `claude-api` skill; use structured output / tool use as documented (Tasks 6, 8).
- **Next.js App Router** — invoke `vercel-plugin:nextjs` (Task 9).
- **Vercel Python functions** — invoke `vercel-plugin:vercel-functions` + `vercel-plugin:vercel-services` (Task 10).
- **Vercel AI SDK chat UI** — invoke `vercel-plugin:ai-sdk` (Task 12).
- **shadcn/ui** — invoke `vercel-plugin:shadcn` (Task 9).
- **Supabase** — Marketplace provisioning via `vercel-plugin:marketplace` (Task 2 deploy tail).

---

## File Structure

```
pocketcfo/
├── sdk/
│   ├── pyproject.toml
│   ├── pocketcfo/
│   │   ├── __init__.py
│   │   ├── config.py            # env loading
│   │   ├── models.py            # Pydantic: RawTransaction, Transaction, Category, results
│   │   ├── store.py             # Supabase CRUD + dedup + aggregates
│   │   ├── parse/
│   │   │   ├── __init__.py
│   │   │   └── icici.py         # ICICI alert + statement-line parsing
│   │   ├── ingest/
│   │   │   ├── __init__.py
│   │   │   ├── gmail.py         # Gmail MCP fetch
│   │   │   └── statements.py    # CSV + PDF extraction
│   │   ├── agents/
│   │   │   ├── __init__.py
│   │   │   ├── categorizer.py   # Claude categorization
│   │   │   └── cfo.py           # NL Q&A over the store
│   │   ├── pipeline.py          # orchestration
│   │   └── schema.sql           # Supabase schema + seed
│   └── tests/
│       ├── conftest.py
│       ├── fixtures/            # sample emails, CSV, PDF
│       ├── test_models.py
│       ├── test_store.py
│       ├── test_parse_icici.py
│       ├── test_ingest_statements.py
│       ├── test_categorizer.py
│       ├── test_pipeline.py
│       └── test_cfo.py
└── frontend/
    ├── package.json
    ├── app/                     # Next.js App Router
    │   ├── layout.tsx
    │   ├── page.tsx             # dashboard
    │   └── globals.css          # design tokens
    ├── components/
    │   ├── hero-card.tsx
    │   ├── category-bento.tsx
    │   ├── transaction-list.tsx
    │   ├── cfo-chat.tsx
    │   └── sync-upload.tsx
    ├── lib/api.ts               # typed fetch wrappers
    └── api/                     # Vercel Python functions importing pocketcfo
        ├── sync.py
        ├── upload.py
        ├── transactions.py
        ├── summary.py
        └── chat.py
```

---

## Task 1: SDK scaffold, config, models

**Files:**
- Create: `sdk/pyproject.toml`
- Create: `sdk/pocketcfo/__init__.py`
- Create: `sdk/pocketcfo/config.py`
- Create: `sdk/pocketcfo/models.py`
- Test: `sdk/tests/test_models.py`

- [ ] **Step 1: Create `sdk/pyproject.toml`**

```toml
[project]
name = "pocketcfo"
version = "0.1.0"
description = "PocketCFO agent engine: ingest, categorize, and analyze personal finances."
requires-python = ">=3.12"
dependencies = [
    "pydantic>=2.7",
    "supabase>=2.5",
    "anthropic>=0.40",
    "pdfplumber>=0.11",
    "python-dotenv>=1.0",
]

[project.optional-dependencies]
dev = ["pytest>=8.0", "pytest-mock>=3.12"]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.pytest.ini_options]
pythonpath = ["."]
testpaths = ["tests"]
```

- [ ] **Step 2: Init env and install**

Run:
```bash
cd sdk && uv venv && uv pip install -e ".[dev]"
```
Expected: venv created, package installed editable.

- [ ] **Step 3: Write failing test for models**

`sdk/tests/test_models.py`:
```python
from datetime import datetime
from pocketcfo.models import RawTransaction, Transaction


def test_raw_transaction_dedup_key_is_stable():
    raw = RawTransaction(
        occurred_at=datetime(2026, 5, 1, 12, 0),
        amount=250.0,
        direction="debit",
        merchant="SWIGGY",
        account="ICICI-card",
        raw_text="...",
        source="gmail",
    )
    assert raw.dedup_key() == raw.dedup_key()
    assert len(raw.dedup_key()) == 40  # sha1 hex


def test_transaction_requires_category():
    txn = Transaction(
        occurred_at=datetime(2026, 5, 1, 12, 0),
        amount=250.0,
        direction="debit",
        merchant="SWIGGY",
        account="ICICI-card",
        raw_text="...",
        source="gmail",
        category_id="food",
        confidence=0.9,
    )
    assert txn.category_id == "food"
```

- [ ] **Step 4: Run test, verify it fails**

Run: `cd sdk && uv run pytest tests/test_models.py -v`
Expected: FAIL — `ModuleNotFoundError: pocketcfo.models`.

- [ ] **Step 5: Implement `sdk/pocketcfo/__init__.py` and `models.py`**

`sdk/pocketcfo/__init__.py`:
```python
__version__ = "0.1.0"
```

`sdk/pocketcfo/models.py`:
```python
import hashlib
from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel

Direction = Literal["debit", "credit"]
Source = Literal["gmail", "csv", "pdf"]


class RawTransaction(BaseModel):
    occurred_at: datetime
    amount: float
    direction: Direction
    merchant: Optional[str] = None
    account: Optional[str] = None
    raw_text: str
    source: Source

    def dedup_key(self) -> str:
        basis = f"{self.occurred_at.isoformat()}|{self.amount:.2f}|{self.merchant or ''}|{self.account or ''}"
        return hashlib.sha1(basis.encode()).hexdigest()


class Transaction(RawTransaction):
    category_id: str
    confidence: float = 0.0


class Category(BaseModel):
    id: str
    label: str
    emoji: Optional[str] = None
    color: Optional[str] = None


class CategoryTotal(BaseModel):
    category_id: str
    label: str
    emoji: Optional[str] = None
    color: Optional[str] = None
    total: float


class SyncResult(BaseModel):
    inserted: int = 0
    skipped: int = 0
    needs_review: int = 0


class ChatAnswer(BaseModel):
    text: str
```

- [ ] **Step 6: Implement `config.py`**

`sdk/pocketcfo/config.py`:
```python
import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
    SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
    ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
    CLAUDE_MODEL = os.environ.get("CLAUDE_MODEL", "claude-haiku-4-5-20251001")

    @classmethod
    def require(cls, *names: str) -> None:
        missing = [n for n in names if not getattr(cls, n)]
        if missing:
            raise RuntimeError(f"Missing required config: {', '.join(missing)}")
```

- [ ] **Step 7: Run test, verify it passes**

Run: `cd sdk && uv run pytest tests/test_models.py -v`
Expected: PASS (2 passed).

- [ ] **Step 8: Commit**

```bash
git add sdk/pyproject.toml sdk/pocketcfo/__init__.py sdk/pocketcfo/config.py sdk/pocketcfo/models.py sdk/tests/test_models.py
git commit -m "feat(sdk): scaffold pocketcfo package with config and models"
```

---

## Task 2: Supabase schema + store layer

**Files:**
- Create: `sdk/pocketcfo/schema.sql`
- Create: `sdk/pocketcfo/store.py`
- Test: `sdk/tests/test_store.py`, `sdk/tests/conftest.py`

- [ ] **Step 1: Write `sdk/pocketcfo/schema.sql`**

```sql
create table if not exists categories (
  id    text primary key,
  label text not null,
  emoji text,
  color text
);

create table if not exists transactions (
  id          uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null,
  amount      numeric(14,2) not null,
  direction   text not null check (direction in ('debit','credit')),
  merchant    text,
  raw_text    text,
  source      text not null,
  account     text,
  category_id text references categories(id),
  confidence  numeric(3,2),
  dedup_key   text unique,
  created_at  timestamptz default now()
);
create index if not exists transactions_occurred_at_idx on transactions (occurred_at);
create index if not exists transactions_category_idx on transactions (category_id);

insert into categories (id, label, emoji, color) values
  ('food','Food','🍔','#FFD8C2'),
  ('travel','Travel','✈️','#FCEFB4'),
  ('clothing','Clothing','👕','#E3D5F1'),
  ('groceries','Groceries','🛒','#CDEAD9'),
  ('bills','Bills','🧾','#C7E0F4'),
  ('entertainment','Entertainment','🎬','#F7D6E0'),
  ('health','Health','💊','#D9EAD3'),
  ('transport','Transport','🚗','#FCE3C3'),
  ('shopping','Shopping','🛍️','#E0D7F5'),
  ('other','Other','❓','#E4E0D8')
on conflict (id) do nothing;
```

- [ ] **Step 2: Create `sdk/tests/conftest.py` with an in-memory fake store backend**

The store talks to Supabase via a thin client interface so tests can inject a fake. `conftest.py`:
```python
import pytest


class FakeTable:
    def __init__(self, rows):
        self.rows = rows
        self._op = None
        self._payload = None
        self._filters = []

    def insert(self, payload):
        self._op, self._payload = "insert", payload
        return self

    def select(self, *_cols):
        self._op = "select"
        return self

    def eq(self, col, val):
        self._filters.append((col, val))
        return self

    def execute(self):
        if self._op == "insert":
            self.rows.append(self._payload)
            return type("R", (), {"data": [self._payload]})
        data = [r for r in self.rows
                if all(r.get(c) == v for c, v in self._filters)]
        return type("R", (), {"data": data})


class FakeSupabase:
    def __init__(self):
        self.tables = {"transactions": [], "categories": []}

    def table(self, name):
        return FakeTable(self.tables[name])


@pytest.fixture
def fake_supabase():
    return FakeSupabase()
```

- [ ] **Step 3: Write failing test for store dedup + aggregate**

`sdk/tests/test_store.py`:
```python
from datetime import datetime
from pocketcfo.models import Transaction
from pocketcfo.store import Store


def _txn(merchant, amount, cat):
    return Transaction(
        occurred_at=datetime(2026, 5, 1, 12, 0),
        amount=amount, direction="debit", merchant=merchant,
        account="ICICI-card", raw_text="x", source="gmail",
        category_id=cat, confidence=0.8,
    )


def test_insert_skips_duplicates(fake_supabase):
    store = Store(client=fake_supabase)
    t = _txn("SWIGGY", 250, "food")
    assert store.insert_transactions([t, t]) == (1, 1)  # inserted, skipped


def test_spend_by_category(fake_supabase):
    store = Store(client=fake_supabase)
    store.insert_transactions([_txn("SWIGGY", 250, "food"),
                               _txn("UBER", 120, "transport")])
    totals = {c.category_id: c.total for c in store.spend_by_category()}
    assert totals["food"] == 250 and totals["transport"] == 120
```

- [ ] **Step 4: Run test, verify it fails**

Run: `cd sdk && uv run pytest tests/test_store.py -v`
Expected: FAIL — `ModuleNotFoundError: pocketcfo.store`.

- [ ] **Step 5: Implement `sdk/pocketcfo/store.py`**

```python
from collections import defaultdict
from typing import Optional
from .models import Transaction, CategoryTotal
from .config import Config


class Store:
    def __init__(self, client=None):
        if client is None:
            from supabase import create_client
            Config.require("SUPABASE_URL", "SUPABASE_KEY")
            client = create_client(Config.SUPABASE_URL, Config.SUPABASE_KEY)
        self.client = client

    def _existing_keys(self) -> set[str]:
        res = self.client.table("transactions").select("dedup_key").execute()
        return {r["dedup_key"] for r in (res.data or [])}

    def insert_transactions(self, txns: list[Transaction]) -> tuple[int, int]:
        existing = self._existing_keys()
        inserted = skipped = 0
        for t in txns:
            key = t.dedup_key()
            if key in existing:
                skipped += 1
                continue
            row = t.model_dump(mode="json")
            row["dedup_key"] = key
            self.client.table("transactions").insert(row).execute()
            existing.add(key)
            inserted += 1
        return inserted, skipped

    def list_transactions(self, limit: int = 50) -> list[dict]:
        res = self.client.table("transactions").select("*").execute()
        rows = sorted(res.data or [], key=lambda r: r["occurred_at"], reverse=True)
        return rows[:limit]

    def spend_by_category(self) -> list[CategoryTotal]:
        res = self.client.table("transactions").select("*").execute()
        cats = {c["id"]: c for c in (self.client.table("categories").select("*").execute().data or [])}
        totals: dict[str, float] = defaultdict(float)
        for r in (res.data or []):
            if r.get("direction") == "debit":
                totals[r["category_id"]] += float(r["amount"])
        out = []
        for cid, total in totals.items():
            meta = cats.get(cid, {})
            out.append(CategoryTotal(category_id=cid, label=meta.get("label", cid),
                                     emoji=meta.get("emoji"), color=meta.get("color"),
                                     total=total))
        return sorted(out, key=lambda c: c.total, reverse=True)
```

- [ ] **Step 6: Run tests, verify pass**

Run: `cd sdk && uv run pytest tests/test_store.py -v`
Expected: PASS (2 passed).

- [ ] **Step 7: Commit**

```bash
git add sdk/pocketcfo/schema.sql sdk/pocketcfo/store.py sdk/tests/conftest.py sdk/tests/test_store.py
git commit -m "feat(sdk): supabase schema and store with dedup + category aggregates"
```

---

## Task 3: ICICI parser (alert emails + statement lines)

**Files:**
- Create: `sdk/pocketcfo/parse/__init__.py`
- Create: `sdk/pocketcfo/parse/icici.py`
- Test: `sdk/tests/test_parse_icici.py`

- [ ] **Step 1: Write failing tests with real-shaped ICICI alert text**

`sdk/tests/test_parse_icici.py`:
```python
from pocketcfo.parse.icici import parse_alert

DEBIT_CARD_ALERT = (
    "Dear Customer, Your ICICI Bank Credit Card XX1234 has been used for "
    "INR 2,499.00 on 02-May-26 at SWIGGY BANGALORE. "
    "Available limit: INR 1,20,000.00."
)
DEBIT_ACCT_ALERT = (
    "Dear Customer, INR 850.50 has been debited from your ICICI Bank Account "
    "XX5678 on 03-May-26. Info: UPI/UBER INDIA. Available balance: INR 40,000.00."
)
CREDIT_ALERT = (
    "Dear Customer, your ICICI Bank Account XX5678 has been credited with "
    "INR 50,000.00 on 01-May-26. Info: SALARY."
)


def test_parse_card_debit():
    raw = parse_alert(DEBIT_CARD_ALERT)
    assert raw is not None
    assert raw.amount == 2499.00
    assert raw.direction == "debit"
    assert raw.account == "ICICI-card"
    assert "SWIGGY" in raw.merchant
    assert raw.occurred_at.day == 2 and raw.occurred_at.month == 5


def test_parse_account_debit():
    raw = parse_alert(DEBIT_ACCT_ALERT)
    assert raw.amount == 850.50
    assert raw.direction == "debit"
    assert raw.account == "ICICI-bank"
    assert "UBER" in raw.merchant


def test_parse_credit():
    raw = parse_alert(CREDIT_ALERT)
    assert raw.direction == "credit"
    assert raw.amount == 50000.00


def test_unparseable_returns_none():
    assert parse_alert("Newsletter: 5 tips to save money") is None
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd sdk && uv run pytest tests/test_parse_icici.py -v`
Expected: FAIL — `ModuleNotFoundError: pocketcfo.parse.icici`.

- [ ] **Step 3: Implement parser**

`sdk/pocketcfo/parse/__init__.py`: (empty)

`sdk/pocketcfo/parse/icici.py`:
```python
import re
from datetime import datetime
from typing import Optional
from ..models import RawTransaction

_AMOUNT = r"INR\s*([\d,]+\.\d{2})"
_DATE = r"(\d{2}-[A-Za-z]{3}-\d{2})"


def _num(s: str) -> float:
    return float(s.replace(",", ""))


def _date(s: str) -> datetime:
    return datetime.strptime(s, "%d-%b-%y")


def parse_alert(text: str) -> Optional[RawTransaction]:
    t = " ".join(text.split())
    amt = re.search(_AMOUNT, t)
    dt = re.search(_DATE, t)
    if not amt or not dt:
        return None

    low = t.lower()
    is_card = "credit card" in low or "debit card" in low
    is_credit = "credited" in low
    direction = "credit" if is_credit else "debit"
    account = "ICICI-card" if is_card else "ICICI-bank"

    merchant = None
    m = re.search(r"\bat\s+([A-Z0-9 ]+?)(?:\.|\s+Available)", t)
    if m:
        merchant = m.group(1).strip()
    else:
        info = re.search(r"Info:\s*([A-Za-z0-9/ ]+?)(?:\.|\s+Available|$)", t)
        if info:
            merchant = info.group(1).strip()

    return RawTransaction(
        occurred_at=_date(dt.group(1)),
        amount=_num(amt.group(1)),
        direction=direction,
        merchant=merchant,
        account=account,
        raw_text=text,
        source="gmail",
    )
```

- [ ] **Step 4: Run tests, verify pass**

Run: `cd sdk && uv run pytest tests/test_parse_icici.py -v`
Expected: PASS (4 passed). If a real ICICI email differs, add it as a fixture and extend the regexes — unmatched input must still return `None`, never crash.

- [ ] **Step 5: Commit**

```bash
git add sdk/pocketcfo/parse/ sdk/tests/test_parse_icici.py
git commit -m "feat(sdk): ICICI alert parser for card/account debit and credit"
```

---

## Task 4: Statement ingestion (CSV + PDF)

**Files:**
- Create: `sdk/pocketcfo/ingest/__init__.py`
- Create: `sdk/pocketcfo/ingest/statements.py`
- Create: `sdk/tests/fixtures/icici_statement.csv`
- Test: `sdk/tests/test_ingest_statements.py`

- [ ] **Step 1: Create CSV fixture `sdk/tests/fixtures/icici_statement.csv`**

```csv
Date,Description,Withdrawals,Deposits
02-May-26,SWIGGY BANGALORE,2499.00,
03-May-26,UPI/UBER INDIA,850.50,
01-May-26,SALARY,,50000.00
```

- [ ] **Step 2: Write failing test**

`sdk/tests/test_ingest_statements.py`:
```python
from pathlib import Path
from pocketcfo.ingest.statements import parse_csv

FIX = Path(__file__).parent / "fixtures" / "icici_statement.csv"


def test_parse_csv_directions_and_amounts():
    rows = parse_csv(FIX.read_text(), account="ICICI-bank")
    by_merchant = {r.merchant: r for r in rows}
    assert by_merchant["SWIGGY BANGALORE"].direction == "debit"
    assert by_merchant["SWIGGY BANGALORE"].amount == 2499.00
    assert by_merchant["SALARY"].direction == "credit"
    assert by_merchant["SALARY"].amount == 50000.00
    assert all(r.source == "csv" for r in rows)
```

- [ ] **Step 3: Run test, verify it fails**

Run: `cd sdk && uv run pytest tests/test_ingest_statements.py -v`
Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 4: Implement `sdk/pocketcfo/ingest/statements.py`**

`sdk/pocketcfo/ingest/__init__.py`: (empty)

```python
import csv
import io
from datetime import datetime
from typing import Literal
from ..models import RawTransaction


def _date(s: str) -> datetime:
    return datetime.strptime(s.strip(), "%d-%b-%y")


def _num(s: str) -> float:
    return float(s.replace(",", "").strip())


def parse_csv(text: str, account: str = "ICICI-bank") -> list[RawTransaction]:
    out: list[RawTransaction] = []
    reader = csv.DictReader(io.StringIO(text))
    for row in reader:
        desc = (row.get("Description") or "").strip()
        wd = (row.get("Withdrawals") or "").strip()
        dep = (row.get("Deposits") or "").strip()
        if wd:
            amount, direction = _num(wd), "debit"
        elif dep:
            amount, direction = _num(dep), "credit"
        else:
            continue
        out.append(RawTransaction(
            occurred_at=_date(row["Date"]), amount=amount, direction=direction,
            merchant=desc, account=account, raw_text=str(row), source="csv",
        ))
    return out


def parse_pdf(data: bytes, account: str = "ICICI-bank") -> list[RawTransaction]:
    import pdfplumber
    out: list[RawTransaction] = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        rows: list[list[str]] = []
        for page in pdf.pages:
            for table in page.extract_tables() or []:
                rows.extend(table)
    if not rows:
        raise ValueError("No extractable text in PDF (scanned image? OCR is out of scope).")
    # Reuse CSV logic by reconstructing a CSV from the detected header row.
    header = rows[0]
    body = rows[1:]
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(header)
    w.writerows(body)
    return [r.model_copy(update={"source": "pdf", "raw_text": "pdf"}) for r in parse_csv(buf.getvalue(), account)]
```

- [ ] **Step 5: Run test, verify pass**

Run: `cd sdk && uv run pytest tests/test_ingest_statements.py -v`
Expected: PASS (1 passed). (PDF path is covered later by the e2e smoke; its table-shape assumption is documented and raises a typed error on scanned PDFs per spec §5.)

- [ ] **Step 6: Commit**

```bash
git add sdk/pocketcfo/ingest/ sdk/tests/fixtures/icici_statement.csv sdk/tests/test_ingest_statements.py
git commit -m "feat(sdk): CSV and PDF statement ingestion"
```

---

## Task 5: Gmail ingestion via MCP

**Files:**
- Create: `sdk/pocketcfo/ingest/gmail.py`
- Test: `sdk/tests/test_ingest_gmail.py`

> **Verify first:** the Gmail MCP tool surface (`mcp__claude_ai_Gmail__*`). The SDK must not call MCP tools directly (it runs server-side, not inside the agent loop). Instead, `gmail.py` accepts an injected `fetch_emails` callable. In the deployed app, the calling layer supplies a function that performs the Gmail search (via the MCP-backed agent or the Gmail REST API with an OAuth token). This keeps the SDK testable and transport-agnostic.

- [ ] **Step 1: Write failing test with an injected fetcher**

`sdk/tests/test_ingest_gmail.py`:
```python
from pocketcfo.ingest.gmail import fetch_icici_transactions

SAMPLE = [
    {"snippet": "Your ICICI Bank Credit Card XX1234 has been used for INR 2,499.00 on 02-May-26 at SWIGGY BANGALORE. Available limit: INR 1,20,000.00."},
    {"snippet": "Newsletter: budgeting tips"},
]


def test_fetch_filters_and_parses():
    def fake_fetch(query):
        assert "icici" in query.lower()
        return SAMPLE
    txns = fetch_icici_transactions(fetch_emails=fake_fetch)
    assert len(txns) == 1
    assert txns[0].amount == 2499.00
    assert txns[0].source == "gmail"
```

- [ ] **Step 2: Run test, verify fails**

Run: `cd sdk && uv run pytest tests/test_ingest_gmail.py -v`
Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 3: Implement `sdk/pocketcfo/ingest/gmail.py`**

```python
from typing import Callable, Iterable
from ..models import RawTransaction
from ..parse.icici import parse_alert

# A fetcher takes a Gmail search query and returns dicts with a "snippet" (and/or "body").
EmailFetcher = Callable[[str], Iterable[dict]]

ICICI_QUERY = 'from:(icicibank.com OR icicibank.net) (debited OR credited OR "Credit Card")'


def fetch_icici_transactions(fetch_emails: EmailFetcher, query: str = ICICI_QUERY) -> list[RawTransaction]:
    out: list[RawTransaction] = []
    for msg in fetch_emails(query):
        text = msg.get("body") or msg.get("snippet") or ""
        raw = parse_alert(text)
        if raw is not None:
            out.append(raw)
    return out
```

- [ ] **Step 4: Run test, verify pass**

Run: `cd sdk && uv run pytest tests/test_ingest_gmail.py -v`
Expected: PASS (1 passed).

- [ ] **Step 5: Commit**

```bash
git add sdk/pocketcfo/ingest/gmail.py sdk/tests/test_ingest_gmail.py
git commit -m "feat(sdk): Gmail ICICI transaction ingestion with injectable fetcher"
```

---

## Task 6: Categorizer agent (Claude)

**Files:**
- Create: `sdk/pocketcfo/agents/__init__.py`
- Create: `sdk/pocketcfo/agents/categorizer.py`
- Test: `sdk/tests/test_categorizer.py`

> **Verify first:** invoke the `claude-api` skill for the current Anthropic SDK message/tool-use API and a current model id. Use structured output (a single tool the model must call) so parsing is reliable. Enable prompt caching on the static category-list/system prompt.

- [ ] **Step 1: Write failing test with a mocked Anthropic client**

`sdk/tests/test_categorizer.py`:
```python
from datetime import datetime
from pocketcfo.models import RawTransaction
from pocketcfo.agents.categorizer import Categorizer


class FakeAnthropic:
    def __init__(self, category_id, confidence):
        self._cat, self._conf = category_id, confidence
        self.messages = self

    def create(self, **kwargs):
        tool_use = type("B", (), {"type": "tool_use",
                                  "input": {"category_id": self._cat, "confidence": self._conf}})
        return type("M", (), {"content": [tool_use]})


def _raw(merchant):
    return RawTransaction(occurred_at=datetime(2026, 5, 1), amount=250, direction="debit",
                          merchant=merchant, account="ICICI-card", raw_text="x", source="gmail")


def test_categorize_returns_transaction_with_category():
    cat = Categorizer(client=FakeAnthropic("food", 0.95))
    txn = cat.categorize(_raw("SWIGGY"))
    assert txn.category_id == "food"
    assert txn.confidence == 0.95


def test_categorize_falls_back_to_other_on_error():
    class Boom(FakeAnthropic):
        def create(self, **kwargs):
            raise RuntimeError("api down")
    cat = Categorizer(client=Boom("food", 0.9))
    txn = cat.categorize(_raw("???"))
    assert txn.category_id == "other"
    assert txn.confidence == 0.0
```

- [ ] **Step 2: Run test, verify fails**

Run: `cd sdk && uv run pytest tests/test_categorizer.py -v`
Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 3: Implement `sdk/pocketcfo/agents/categorizer.py`**

`sdk/pocketcfo/agents/__init__.py`: (empty)

```python
from ..models import RawTransaction, Transaction
from ..config import Config

CATEGORY_IDS = ["food", "travel", "clothing", "groceries", "bills",
                "entertainment", "health", "transport", "shopping", "other"]

_TOOL = {
    "name": "assign_category",
    "description": "Assign one spend category to a transaction.",
    "input_schema": {
        "type": "object",
        "properties": {
            "category_id": {"type": "string", "enum": CATEGORY_IDS},
            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        },
        "required": ["category_id", "confidence"],
    },
}
_SYSTEM = ("You categorize personal-finance transactions for an Indian user. "
           "Given a merchant and amount, call assign_category with the best "
           f"category from: {', '.join(CATEGORY_IDS)}. Use 'other' if unsure.")


class Categorizer:
    def __init__(self, client=None):
        if client is None:
            import anthropic
            Config.require("ANTHROPIC_API_KEY")
            client = anthropic.Anthropic(api_key=Config.ANTHROPIC_API_KEY)
        self.client = client

    def categorize(self, raw: RawTransaction) -> Transaction:
        try:
            msg = self.client.messages.create(
                model=Config.CLAUDE_MODEL,
                max_tokens=128,
                system=_SYSTEM,
                tools=[_TOOL],
                tool_choice={"type": "tool", "name": "assign_category"},
                messages=[{"role": "user",
                           "content": f"Merchant: {raw.merchant}\nAmount: INR {raw.amount}\nDirection: {raw.direction}"}],
            )
            block = next(b for b in msg.content if getattr(b, "type", None) == "tool_use")
            cat = block.input["category_id"]
            conf = float(block.input["confidence"])
        except Exception:
            cat, conf = "other", 0.0
        return Transaction(**raw.model_dump(), category_id=cat, confidence=conf)
```

- [ ] **Step 4: Run tests, verify pass**

Run: `cd sdk && uv run pytest tests/test_categorizer.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add sdk/pocketcfo/agents/ sdk/tests/test_categorizer.py
git commit -m "feat(sdk): Claude categorizer agent with structured output and safe fallback"
```

---

## Task 7: Pipeline orchestration

**Files:**
- Create: `sdk/pocketcfo/pipeline.py`
- Test: `sdk/tests/test_pipeline.py`

- [ ] **Step 1: Write failing test**

`sdk/tests/test_pipeline.py`:
```python
from datetime import datetime
from pocketcfo.models import RawTransaction, Transaction, SyncResult
from pocketcfo.pipeline import Pipeline


class StubCategorizer:
    def categorize(self, raw):
        return Transaction(**raw.model_dump(), category_id="food", confidence=0.9)


class RecordingStore:
    def __init__(self): self.saved = []
    def insert_transactions(self, txns):
        self.saved.extend(txns)
        return len(txns), 0


def _raw(m):
    return RawTransaction(occurred_at=datetime(2026, 5, 1), amount=100, direction="debit",
                          merchant=m, account="ICICI-card", raw_text="x", source="gmail")


def test_sync_gmail_categorizes_and_stores():
    store = RecordingStore()
    pipe = Pipeline(store=store, categorizer=StubCategorizer(),
                    gmail_fetch=lambda q: [{"snippet": "ICICI Bank Credit Card XX1 used for INR 100.00 on 01-May-26 at SWIGGY. Available limit: INR 1.00."}])
    result = pipe.sync_gmail()
    assert isinstance(result, SyncResult)
    assert result.inserted == 1
    assert store.saved[0].category_id == "food"
```

- [ ] **Step 2: Run test, verify fails**

Run: `cd sdk && uv run pytest tests/test_pipeline.py -v`
Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 3: Implement `sdk/pocketcfo/pipeline.py`**

```python
from typing import Callable, Iterable, Literal
from .models import RawTransaction, SyncResult
from .store import Store
from .agents.categorizer import Categorizer
from .ingest.gmail import fetch_icici_transactions
from .ingest.statements import parse_csv, parse_pdf


class Pipeline:
    def __init__(self, store=None, categorizer=None, gmail_fetch: Callable[[str], Iterable[dict]] | None = None):
        self.store = store or Store()
        self.categorizer = categorizer or Categorizer()
        self.gmail_fetch = gmail_fetch

    def _store_raws(self, raws: list[RawTransaction]) -> SyncResult:
        txns = [self.categorizer.categorize(r) for r in raws]
        needs_review = sum(1 for t in txns if t.confidence == 0.0)
        inserted, skipped = self.store.insert_transactions(txns)
        return SyncResult(inserted=inserted, skipped=skipped, needs_review=needs_review)

    def sync_gmail(self) -> SyncResult:
        if self.gmail_fetch is None:
            raise RuntimeError("Gmail not connected: no fetcher provided.")
        raws = fetch_icici_transactions(self.gmail_fetch)
        return self._store_raws(raws)

    def ingest_file(self, content: bytes | str, kind: Literal["csv", "pdf"], account: str = "ICICI-bank") -> SyncResult:
        if kind == "csv":
            raws = parse_csv(content if isinstance(content, str) else content.decode(), account)
        else:
            raws = parse_pdf(content if isinstance(content, bytes) else content.encode(), account)
        return self._store_raws(raws)
```

- [ ] **Step 4: Run tests, verify pass**

Run: `cd sdk && uv run pytest tests/test_pipeline.py -v`
Expected: PASS (1 passed).

- [ ] **Step 5: Commit**

```bash
git add sdk/pocketcfo/pipeline.py sdk/tests/test_pipeline.py
git commit -m "feat(sdk): pipeline orchestrating ingest -> categorize -> store"
```

---

## Task 8: CFO chat agent

**Files:**
- Create: `sdk/pocketcfo/agents/cfo.py`
- Test: `sdk/tests/test_cfo.py`

> **Verify first:** `claude-api` skill for tool-use loop. The CFO agent gets read-only tools backed by the store (`spend_by_category`, `list_transactions`). For Slice 1 keep it single-turn with tool results fed back once.

- [ ] **Step 1: Write failing test (mocked client, store-backed tools)**

`sdk/tests/test_cfo.py`:
```python
from pocketcfo.models import CategoryTotal, ChatAnswer
from pocketcfo.agents.cfo import CFO


class StubStore:
    def spend_by_category(self):
        return [CategoryTotal(category_id="travel", label="Travel", total=14100.0)]
    def list_transactions(self, limit=50):
        return []


class FakeAnthropic:
    """First call asks for the tool; second call returns prose."""
    def __init__(self):
        self.calls = 0
        self.messages = self
    def create(self, **kwargs):
        self.calls += 1
        if self.calls == 1:
            tu = type("B", (), {"type": "tool_use", "id": "t1",
                                "name": "spend_by_category", "input": {}})
            return type("M", (), {"content": [tu], "stop_reason": "tool_use"})
        txt = type("B", (), {"type": "text", "text": "You spent ₹14,100 on Travel."})
        return type("M", (), {"content": [txt], "stop_reason": "end_turn"})


def test_ask_uses_tool_and_returns_answer():
    cfo = CFO(store=StubStore(), client=FakeAnthropic())
    ans = cfo.ask("where did my money go?")
    assert isinstance(ans, ChatAnswer)
    assert "14,100" in ans.text
```

- [ ] **Step 2: Run test, verify fails**

Run: `cd sdk && uv run pytest tests/test_cfo.py -v`
Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 3: Implement `sdk/pocketcfo/agents/cfo.py`**

```python
import json
from .config import Config
from .models import ChatAnswer

_TOOLS = [
    {"name": "spend_by_category", "description": "Totals spent per category.",
     "input_schema": {"type": "object", "properties": {}}},
    {"name": "list_transactions", "description": "Recent transactions.",
     "input_schema": {"type": "object",
                      "properties": {"limit": {"type": "integer"}}}},
]
_SYSTEM = ("You are PocketCFO, a concise personal finance assistant. "
           "Use the tools to answer questions about the user's spending. "
           "Amounts are INR. Be brief and specific.")


class CFO:
    def __init__(self, store=None, client=None):
        from .store import Store
        self.store = store or Store()
        if client is None:
            import anthropic
            Config.require("ANTHROPIC_API_KEY")
            client = anthropic.Anthropic(api_key=Config.ANTHROPIC_API_KEY)
        self.client = client

    def _run_tool(self, name, args):
        if name == "spend_by_category":
            return [c.model_dump() for c in self.store.spend_by_category()]
        if name == "list_transactions":
            return self.store.list_transactions(limit=args.get("limit", 20))
        return {"error": f"unknown tool {name}"}

    def ask(self, question: str) -> ChatAnswer:
        messages = [{"role": "user", "content": question}]
        for _ in range(4):  # bounded tool loop
            msg = self.client.messages.create(
                model=Config.CLAUDE_MODEL, max_tokens=512,
                system=_SYSTEM, tools=_TOOLS, messages=messages,
            )
            if getattr(msg, "stop_reason", None) != "tool_use":
                text = "".join(b.text for b in msg.content if getattr(b, "type", None) == "text")
                return ChatAnswer(text=text)
            messages.append({"role": "assistant", "content": msg.content})
            results = []
            for b in msg.content:
                if getattr(b, "type", None) == "tool_use":
                    out = self._run_tool(b.name, b.input or {})
                    results.append({"type": "tool_result", "tool_use_id": b.id,
                                    "content": json.dumps(out, default=str)})
            messages.append({"role": "user", "content": results})
        return ChatAnswer(text="Sorry, I couldn't complete that.")
```

- [ ] **Step 4: Run tests, verify pass**

Run: `cd sdk && uv run pytest tests/test_cfo.py -v`
Expected: PASS (1 passed).

- [ ] **Step 5: Full SDK suite + commit**

Run: `cd sdk && uv run pytest -v`
Expected: all green.
```bash
git add sdk/pocketcfo/agents/cfo.py sdk/tests/test_cfo.py
git commit -m "feat(sdk): CFO chat agent with store-backed tool loop"
```

---

## Task 9: Frontend scaffold + design tokens

**Files:**
- Create: `frontend/` (Next.js app), `frontend/app/globals.css`, `frontend/app/layout.tsx`, `frontend/app/page.tsx`

> **Verify first:** invoke `vercel-plugin:nextjs` and `vercel-plugin:shadcn` for current scaffold + theming commands. Use the `ui-ux-pro-max:ui-ux-pro-max` skill (action: build, style: bento grid) for component structure.

- [ ] **Step 1: Scaffold the app**

Run (confirm exact flags against the nextjs skill):
```bash
cd frontend || (cd .. && npx create-next-app@latest frontend --ts --tailwind --app --eslint --no-src-dir)
```
Expected: Next.js App Router project created with Tailwind.

- [ ] **Step 2: Init shadcn/ui**

Per the shadcn skill (verify command):
```bash
cd frontend && npx shadcn@latest init
npx shadcn@latest add card button input scroll-area
```

- [ ] **Step 3: Add design tokens to `frontend/app/globals.css`**

Append:
```css
:root {
  --pc-bg: #F4F1EA;          /* warm cream */
  --pc-ink: #2E2A26;
  --pc-food: #FFD8C2; --pc-travel: #FCEFB4; --pc-clothing: #E3D5F1;
  --pc-groceries: #CDEAD9; --pc-bills: #C7E0F4; --pc-entertainment: #F7D6E0;
  --pc-health: #D9EAD3; --pc-transport: #FCE3C3; --pc-shopping: #E0D7F5;
  --pc-other: #E4E0D8;
  --pc-radius: 18px;
}
body { background: var(--pc-bg); color: var(--pc-ink); }
.pc-glass {
  background: rgba(255,255,255,.45);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255,255,255,.6);
  box-shadow: 0 8px 24px rgba(80,80,140,.16);
}
.pc-tabular { font-variant-numeric: tabular-nums; }
```

- [ ] **Step 4: Verify dev server renders**

Run: `cd frontend && npm run dev`
Expected: app boots at http://localhost:3000 with cream background. (The `vercel-plugin:agent-browser-verify` skill auto-runs a visual gut-check.)

- [ ] **Step 5: Commit**

```bash
git add frontend
git commit -m "feat(frontend): Next.js + Tailwind + shadcn scaffold with PocketCFO pastel tokens"
```

---

## Task 10: Python serverless API functions (frontend/api)

**Files:**
- Create: `frontend/api/summary.py`, `transactions.py`, `sync.py`, `upload.py`, `chat.py`
- Create: `frontend/requirements.txt` (points at the local SDK), `frontend/vercel.json`

> **Verify first:** invoke `vercel-plugin:vercel-functions` and `vercel-plugin:vercel-services` for the current Python function signature and how to colocate Python functions with a Next.js app (services config). The SDK is installed from the sibling `sdk/` dir.

- [ ] **Step 1: `frontend/requirements.txt`**

```
../sdk
```

- [ ] **Step 2: Implement read endpoints**

`frontend/api/summary.py`:
```python
from http.server import BaseHTTPRequestHandler
import json
from pocketcfo.store import Store


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        totals = [c.model_dump() for c in Store().spend_by_category()]
        body = json.dumps({"categories": totals}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)
```

`frontend/api/transactions.py`:
```python
from http.server import BaseHTTPRequestHandler
import json
from pocketcfo.store import Store


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        rows = Store().list_transactions(limit=50)
        body = json.dumps({"transactions": rows}, default=str).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)
```

- [ ] **Step 3: Implement sync/upload/chat endpoints**

`frontend/api/sync.py` — builds a Gmail fetcher from an OAuth token in env/request and runs the pipeline:
```python
from http.server import BaseHTTPRequestHandler
import json
from pocketcfo.pipeline import Pipeline
from pocketcfo.config import Config


def gmail_fetcher(query: str):
    # Verify against Gmail REST docs when wiring real auth. Returns [{"snippet"/"body": ...}].
    # Slice 1: uses a server-side OAuth token (Config) to call Gmail search+get.
    from pocketcfo.ingest.gmail_rest import search  # implemented when wiring real auth
    return search(query, token=Config.__dict__.get("GMAIL_TOKEN", ""))


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            result = Pipeline(gmail_fetch=gmail_fetcher).sync_gmail()
            payload, code = result.model_dump(), 200
        except RuntimeError as e:
            payload, code = {"error": str(e), "needs_gmail_auth": True}, 409
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode())
```

`frontend/api/upload.py` — accepts multipart CSV/PDF:
```python
from http.server import BaseHTTPRequestHandler
import json, cgi
from pocketcfo.pipeline import Pipeline


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        form = cgi.FieldStorage(fp=self.rfile, headers=self.headers,
                                environ={"REQUEST_METHOD": "POST"})
        item = form["file"]
        kind = "pdf" if item.filename.lower().endswith(".pdf") else "csv"
        content = item.file.read()
        result = Pipeline().ingest_file(content, kind=kind)
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(result.model_dump()).encode())
```

`frontend/api/chat.py`:
```python
from http.server import BaseHTTPRequestHandler
import json
from pocketcfo.agents.cfo import CFO


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length) or b"{}")
        ans = CFO().ask(body.get("question", ""))
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(ans.model_dump()).encode())
```

- [ ] **Step 4: `frontend/vercel.json`** — confirm shape against vercel-functions skill (Python runtime + rewrites for `/api/*`).

- [ ] **Step 5: Smoke test locally**

Run: `cd frontend && vercel dev` (verify command via vercel-cli skill)
Test: `curl localhost:3000/api/summary` returns `{"categories": [...]}`.

- [ ] **Step 6: Commit**

```bash
git add frontend/api frontend/requirements.txt frontend/vercel.json
git commit -m "feat(frontend): Python serverless endpoints wrapping the SDK"
```

---

## Task 11: Bento dashboard UI

**Files:**
- Create: `frontend/lib/api.ts`, `frontend/components/hero-card.tsx`, `category-bento.tsx`, `transaction-list.tsx`
- Modify: `frontend/app/page.tsx`

> **Verify first:** `vercel-plugin:react-best-practices` will auto-review after editing multiple TSX files. Follow `ui-ux-pro-max` bento-grid guidance.

- [ ] **Step 1: `frontend/lib/api.ts`** — typed fetch wrappers

```ts
export type CategoryTotal = { category_id: string; label: string; emoji?: string; color?: string; total: number };
export type Txn = { id: string; occurred_at: string; amount: number; direction: string; merchant?: string; category_id: string; source: string };

export async function getSummary(): Promise<CategoryTotal[]> {
  const r = await fetch("/api/summary"); return (await r.json()).categories;
}
export async function getTransactions(): Promise<Txn[]> {
  const r = await fetch("/api/transactions"); return (await r.json()).transactions;
}
```

- [ ] **Step 2: `components/hero-card.tsx`** — glass total-spend card

```tsx
export function HeroCard({ total }: { total: number }) {
  return (
    <div className="pc-glass pc-tabular" style={{ borderRadius: "var(--pc-radius)", padding: 24 }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>Spent this period</div>
      <div style={{ fontSize: 34, fontWeight: 800 }}>
        ₹{total.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `components/category-bento.tsx`** — pastel tiles

```tsx
import type { CategoryTotal } from "@/lib/api";
export function CategoryBento({ cats }: { cats: CategoryTotal[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 12 }}>
      {cats.map((c) => (
        <div key={c.category_id} className="pc-tabular"
             style={{ background: c.color ?? "var(--pc-other)", borderRadius: 14, padding: 14 }}>
          <div style={{ fontSize: 13 }}>{c.emoji} {c.label}</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>
            ₹{c.total.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: `components/transaction-list.tsx`**

```tsx
import type { Txn } from "@/lib/api";
export function TransactionList({ txns }: { txns: Txn[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {txns.map((t) => (
        <div key={t.id} className="pc-tabular"
             style={{ display: "flex", justifyContent: "space-between", background: "#fff",
                      borderRadius: 12, padding: "10px 14px" }}>
          <span>{t.merchant ?? "—"}</span>
          <span style={{ color: t.direction === "credit" ? "#3a8f6b" : "var(--pc-ink)" }}>
            {t.direction === "credit" ? "+" : "−"}₹{t.amount.toLocaleString("en-IN")}
          </span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Wire `app/page.tsx`** (Server Component fetching data)

```tsx
import { getSummary, getTransactions } from "@/lib/api";
import { HeroCard } from "@/components/hero-card";
import { CategoryBento } from "@/components/category-bento";
import { TransactionList } from "@/components/transaction-list";
import { CFOChat } from "@/components/cfo-chat";
import { SyncUpload } from "@/components/sync-upload";

export default async function Page() {
  const [cats, txns] = await Promise.all([getSummary(), getTransactions()]);
  const total = cats.reduce((s, c) => s + c.total, 0);
  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24, display: "grid", gap: 20 }}>
      <h1 style={{ fontWeight: 800 }}>PocketCFO</h1>
      <SyncUpload />
      <HeroCard total={total} />
      <CategoryBento cats={cats} />
      <section style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20 }}>
        <TransactionList txns={txns} />
        <CFOChat />
      </section>
    </main>
  );
}
```

- [ ] **Step 6: Verify visually**

Run: `cd frontend && npm run dev` — confirm hero, tiles, and transactions render with seeded data. Use `vercel-plugin:agent-browser` to screenshot.

- [ ] **Step 7: Commit**

```bash
git add frontend/lib frontend/components/hero-card.tsx frontend/components/category-bento.tsx frontend/components/transaction-list.tsx frontend/app/page.tsx
git commit -m "feat(frontend): bento dashboard with glass hero, category tiles, txn list"
```

---

## Task 12: CFO chat panel + sync/upload controls

**Files:**
- Create: `frontend/components/cfo-chat.tsx`, `frontend/components/sync-upload.tsx`

> **Verify first:** invoke `vercel-plugin:ai-sdk` and `vercel-plugin:ai-elements` for the current chat-UI hook. Slice 1 chat endpoint is non-streaming JSON (`/api/chat`); if you adopt the AI SDK streaming protocol, update `api/chat.py` to match the SDK's expected stream format.

- [ ] **Step 1: `components/cfo-chat.tsx`** (client component)

```tsx
"use client";
import { useState } from "react";

export function CFOChat() {
  const [q, setQ] = useState("");
  const [msgs, setMsgs] = useState<{ role: string; text: string }[]>([]);
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!q.trim()) return;
    const question = q;
    setMsgs((m) => [...m, { role: "user", text: question }]);
    setQ(""); setBusy(true);
    const r = await fetch("/api/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    const { text } = await r.json();
    setMsgs((m) => [...m, { role: "cfo", text }]);
    setBusy(false);
  }

  return (
    <div className="pc-glass" style={{ borderRadius: "var(--pc-radius)", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontWeight: 700 }}>Ask your CFO</div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, minHeight: 160 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                                 background: m.role === "user" ? "#E0D7F5" : "#fff",
                                 borderRadius: 12, padding: "8px 12px", maxWidth: "85%" }}>
            {m.text}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)}
               onKeyDown={(e) => e.key === "Enter" && send()}
               placeholder="Where did my money go in May?"
               style={{ flex: 1, borderRadius: 12, border: "1px solid #ddd", padding: "8px 12px" }} />
        <button onClick={send} disabled={busy}
                style={{ borderRadius: 12, padding: "8px 16px", background: "#B39DDB", color: "#fff" }}>
          {busy ? "…" : "Ask"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `components/sync-upload.tsx`** (client component)

```tsx
"use client";
import { useState } from "react";

export function SyncUpload() {
  const [status, setStatus] = useState("");

  async function sync() {
    setStatus("Syncing Gmail…");
    const r = await fetch("/api/sync", { method: "POST" });
    if (r.status === 409) { setStatus("Connect Gmail to sync."); return; }
    const res = await r.json();
    setStatus(`Synced: ${res.inserted} new, ${res.skipped} dup, ${res.needs_review} to review.`);
  }

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setStatus(`Uploading ${file.name}…`);
    const fd = new FormData(); fd.append("file", file);
    const r = await fetch("/api/upload", { method: "POST", body: fd });
    const res = await r.json();
    setStatus(`Imported: ${res.inserted} new, ${res.skipped} dup.`);
  }

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <button onClick={sync} style={{ borderRadius: 12, padding: "8px 16px", background: "#CDEAD9" }}>Sync Gmail</button>
      <label style={{ borderRadius: 12, padding: "8px 16px", background: "#C7E0F4", cursor: "pointer" }}>
        Upload CSV/PDF
        <input type="file" accept=".csv,.pdf" onChange={upload} style={{ display: "none" }} />
      </label>
      <span style={{ fontSize: 13, opacity: 0.75 }}>{status}</span>
    </div>
  );
}
```

- [ ] **Step 3: Verify chat + upload end to end**

Run dev server, upload `icici_statement.csv`, confirm tiles update and chat answers "where did my money go?". Screenshot via agent-browser.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/cfo-chat.tsx frontend/components/sync-upload.tsx
git commit -m "feat(frontend): CFO chat panel and sync/upload controls"
```

---

## Task 13: End-to-end smoke + deploy prep

**Files:**
- Create: `sdk/tests/test_e2e_smoke.py`
- Create: `README.md`, `.gitignore`, `.env.example`

- [ ] **Step 1: E2E smoke test (fixture data, fake store + stub categorizer)**

`sdk/tests/test_e2e_smoke.py`:
```python
from pathlib import Path
from pocketcfo.pipeline import Pipeline
from pocketcfo.models import Transaction


class StubCategorizer:
    def categorize(self, raw):
        cat = "food" if raw.merchant and "SWIGGY" in raw.merchant else "other"
        return Transaction(**raw.model_dump(), category_id=cat, confidence=0.9)


class MemStore:
    def __init__(self): self.rows = []
    def insert_transactions(self, txns):
        new = [t for t in txns if t.dedup_key() not in {r.dedup_key() for r in self.rows}]
        self.rows.extend(new); return len(new), len(txns) - len(new)


def test_csv_to_categorized_store():
    store = MemStore()
    pipe = Pipeline(store=store, categorizer=StubCategorizer())
    csv = (Path(__file__).parent / "fixtures" / "icici_statement.csv").read_text()
    result = pipe.ingest_file(csv, kind="csv")
    assert result.inserted == 3
    assert any(t.category_id == "food" for t in store.rows)
    # re-ingest is fully deduped
    again = pipe.ingest_file(csv, kind="csv")
    assert again.inserted == 0 and again.skipped == 3
```

- [ ] **Step 2: Run full suite**

Run: `cd sdk && uv run pytest -v`
Expected: all tests pass.

- [ ] **Step 3: Add `.gitignore`, `.env.example`, `README.md`**

`.gitignore`:
```
.superpowers/
sdk/.venv/
__pycache__/
frontend/node_modules/
frontend/.next/
.env
*.env.local
```

`.env.example`:
```
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
ANTHROPIC_API_KEY=
CLAUDE_MODEL=claude-haiku-4-5-20251001
```

`README.md`: project overview, setup (`uv` for sdk, `npm` for frontend), how to run schema.sql on Supabase, env vars, local dev commands.

- [ ] **Step 4: Provision Supabase + apply schema**

Use `vercel-plugin:marketplace` to provision Supabase; run `sdk/pocketcfo/schema.sql` in the Supabase SQL editor; set env vars locally and in Vercel via `vercel-plugin:env`.

- [ ] **Step 5: Deploy preview**

Use the `vercel-plugin:deploy` skill for a preview deploy; verify `/api/summary` responds and the dashboard renders.

- [ ] **Step 6: Commit**

```bash
git add sdk/tests/test_e2e_smoke.py .gitignore .env.example README.md
git commit -m "test: e2e smoke + project docs and deploy prep"
```

---

## Self-Review notes

- **Spec coverage:** §1 scope → Tasks 1–13. ICICI ingest (T3,T5), CSV+PDF (T4), categorizer (T6), Supabase schema/store (T2), bento+glass dashboard (T9,T11), CFO chat (T8,T12), error/needs-review (T6,T7,T10 sync 409). §6 design tokens → T9. §7 testing → tests in every SDK task + T13. §9 done-definition → covered across T2,T5,T7,T11,T12,T13.
- **Volatile-API tasks (5,6,8,9,10,12)** carry explicit "verify against live docs / invoke skill" steps because framework training data is unreliable. `gmail_rest.search` and the AI-SDK streaming variant are the two integration points to wire against live docs during execution.
- **Type consistency:** `RawTransaction`/`Transaction`/`SyncResult`/`CategoryTotal`/`ChatAnswer` defined in T1; `Store.insert_transactions -> (inserted, skipped)` used consistently in T2/T7/T13; `Pipeline.sync_gmail`/`ingest_file` signatures match T7 and the T10 endpoints.
