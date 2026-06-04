from collections import defaultdict
from datetime import datetime
from decimal import Decimal
from .models import Transaction, CategoryTotal, BudgetStatus, merchant_key_of
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

    # --- Slice 3A: category-correction learning (parity with LocalStore) ---

    def upsert_rule(self, merchant_key: str, category_id: str) -> None:
        self.client.table("merchant_rules").upsert(
            {"merchant_key": merchant_key, "category_id": category_id}).execute()

    def get_rules(self) -> dict[str, str]:
        res = self.client.table("merchant_rules").select("*").execute()
        return {r["merchant_key"]: r["category_id"] for r in (res.data or [])}

    def recategorize(self, transaction_id, category_id: str) -> dict:
        rows = self.client.table("transactions").select("*").execute().data or []
        target = next((r for r in rows if r["id"] == transaction_id), None)
        if target is None:
            raise KeyError(f"transaction {transaction_id} not found")
        mkey = merchant_key_of(target.get("merchant"))
        self.upsert_rule(mkey, category_id)
        updated = 0
        for r in rows:
            if merchant_key_of(r.get("merchant")) == mkey:
                self.client.table("transactions").update(
                    {"category_id": category_id, "confidence": 1.0}
                ).eq("id", r["id"]).execute()
                updated += 1
        return {"transaction_id": transaction_id, "category_id": category_id,
                "merchant_key": mkey, "updated": updated}

    # --- Slice 3B: budgets (parity with LocalStore) ---

    def set_budget(self, category_id: str, monthly_limit) -> None:
        limit = Decimal(str(monthly_limit))
        if limit <= 0:
            raise ValueError("budget must be positive")
        self.client.table("budgets").upsert(
            {"category_id": category_id, "monthly_limit": str(limit)}).execute()

    def budget_status(self, year: int | None = None, month: int | None = None) -> list[BudgetStatus]:
        budgets = self.client.table("budgets").select("*").execute().data or []
        if not budgets:
            return []
        rows = self.client.table("transactions").select("*").execute().data or []
        debits = [r for r in rows if r.get("direction") == "debit"]
        if year is None or month is None:
            dates = [datetime.fromisoformat(str(r["occurred_at"])) for r in debits]
            latest = max(dates) if dates else datetime.now()
            year, month = latest.year, latest.month
        cats = {c["id"]: c for c in (self.client.table("categories").select("*").execute().data or [])}
        spent: dict[str, Decimal] = defaultdict(Decimal)
        for r in debits:
            dt = datetime.fromisoformat(str(r["occurred_at"]))
            if dt.year == year and dt.month == month:
                spent[r["category_id"]] += Decimal(str(r["amount"]))
        out = []
        for b in budgets:
            cid = b["category_id"]
            limit = Decimal(str(b["monthly_limit"]))
            sp = spent.get(cid, Decimal("0"))
            meta = cats.get(cid, {})
            out.append(BudgetStatus(
                category_id=cid, label=meta.get("label", cid), emoji=meta.get("emoji"),
                color=meta.get("color"), spent=sp, limit=limit,
                pct=float(sp / limit) if limit > 0 else 0.0, over=sp > limit))
        return sorted(out, key=lambda s: s.pct, reverse=True)
