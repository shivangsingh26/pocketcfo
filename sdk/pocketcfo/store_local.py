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
