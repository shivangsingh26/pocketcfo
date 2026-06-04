from collections import defaultdict
from decimal import Decimal
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
        """Total spent per category. Debits only; credits (income) are excluded."""
        res = self.client.table("transactions").select("*").execute()
        cats = {c["id"]: c for c in (self.client.table("categories").select("*").execute().data or [])}
        totals: dict[str, Decimal] = defaultdict(Decimal)
        for r in (res.data or []):
            if r.get("direction") == "debit":
                totals[r["category_id"]] += Decimal(str(r["amount"]))
        out = []
        for cid, total in totals.items():
            meta = cats.get(cid, {})
            out.append(CategoryTotal(category_id=cid, label=meta.get("label", cid),
                                     emoji=meta.get("emoji"), color=meta.get("color"),
                                     total=total))
        return sorted(out, key=lambda c: c.total, reverse=True)
