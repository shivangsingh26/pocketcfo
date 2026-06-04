import os
import sqlite3
from collections import defaultdict
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from .models import Transaction, CategoryTotal, BudgetStatus, merchant_key_of

_SEED = [
    ("food", "Food", "🍔", "#FFD8C2"), ("travel", "Travel", "✈️", "#FCEFB4"),
    ("clothing", "Clothing", "👕", "#E3D5F1"), ("groceries", "Groceries", "🛒", "#CDEAD9"),
    ("bills", "Bills", "🧾", "#C7E0F4"), ("entertainment", "Entertainment", "🎬", "#F7D6E0"),
    ("health", "Health", "💊", "#D9EAD3"), ("transport", "Transport", "🚗", "#FCE3C3"),
    ("shopping", "Shopping", "🛍️", "#E0D7F5"), ("other", "Other", "❓", "#E4E0D8"),
]


class LocalStore:
    """SQLite-backed store, drop-in for the Supabase Store interface (dev/demo,
    zero credentials). Mirrors insert_transactions/list_transactions/
    spend_by_category semantics: debits-only totals, newest-first list, Decimal."""

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
        c.execute("create table if not exists merchant_rules ("
                  "merchant_key text primary key, category_id text not null)")
        c.execute("create table if not exists budgets ("
                  "category_id text primary key, monthly_limit text not null)")
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

    # --- Slice 3A: category-correction learning ---

    def upsert_rule(self, merchant_key: str, category_id: str) -> None:
        self.conn.execute(
            "insert into merchant_rules(merchant_key, category_id) values (?, ?) "
            "on conflict(merchant_key) do update set category_id=excluded.category_id",
            (merchant_key, category_id))
        self.conn.commit()

    def get_rules(self) -> dict[str, str]:
        return {r["merchant_key"]: r["category_id"]
                for r in self.conn.execute("select * from merchant_rules").fetchall()}

    def recategorize(self, transaction_id: int, category_id: str) -> dict:
        row = self.conn.execute(
            "select * from transactions where id=?", (transaction_id,)).fetchone()
        if row is None:
            raise KeyError(f"transaction {transaction_id} not found")
        mkey = merchant_key_of(row["merchant"])
        self.upsert_rule(mkey, category_id)
        updated = 0
        for r in self.conn.execute("select id, merchant from transactions").fetchall():
            if merchant_key_of(r["merchant"]) == mkey:
                self.conn.execute(
                    "update transactions set category_id=?, confidence=1.0 where id=?",
                    (category_id, r["id"]))
                updated += 1
        self.conn.commit()
        return {"transaction_id": transaction_id, "category_id": category_id,
                "merchant_key": mkey, "updated": updated}

    # --- Slice 3B: budgets ---

    def set_budget(self, category_id: str, monthly_limit) -> None:
        limit = Decimal(str(monthly_limit))
        if limit <= 0:
            raise ValueError("budget must be positive")
        self.conn.execute(
            "insert into budgets(category_id, monthly_limit) values (?, ?) "
            "on conflict(category_id) do update set monthly_limit=excluded.monthly_limit",
            (category_id, str(limit)))
        self.conn.commit()

    def _latest_month(self):
        row = self.conn.execute(
            "select max(occurred_at) as m from transactions where direction='debit'"
        ).fetchone()
        if not row or not row["m"]:
            return None
        dt = datetime.fromisoformat(row["m"])
        return dt.year, dt.month

    def budget_status(self, year: int | None = None, month: int | None = None) -> list[BudgetStatus]:
        budgets = self.conn.execute("select * from budgets").fetchall()
        if not budgets:
            return []
        if year is None or month is None:
            lm = self._latest_month()
            year, month = lm if lm else (datetime.now().year, datetime.now().month)
        cats = {r["id"]: r for r in self.conn.execute("select * from categories").fetchall()}
        spent: dict[str, Decimal] = defaultdict(Decimal)
        for r in self.conn.execute(
                "select category_id, amount, occurred_at from transactions where direction='debit'"):
            dt = datetime.fromisoformat(r["occurred_at"])
            if dt.year == year and dt.month == month:
                spent[r["category_id"]] += Decimal(r["amount"])
        out = []
        for b in budgets:
            cid = b["category_id"]
            limit = Decimal(b["monthly_limit"])
            sp = spent.get(cid, Decimal("0"))
            m = cats.get(cid)
            out.append(BudgetStatus(
                category_id=cid, label=(m["label"] if m else cid),
                emoji=(m["emoji"] if m else None), color=(m["color"] if m else None),
                spent=sp, limit=limit, pct=float(sp / limit) if limit > 0 else 0.0,
                over=sp > limit))
        return sorted(out, key=lambda s: s.pct, reverse=True)

