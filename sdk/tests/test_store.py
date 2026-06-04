from datetime import datetime
from decimal import Decimal
from pocketcfo.models import Transaction
from pocketcfo.store import Store


def _txn(merchant, amount, cat):
    return Transaction(
        occurred_at=datetime(2026, 5, 1, 12, 0),
        amount=Decimal(str(amount)), direction="debit", merchant=merchant,
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
    assert store.spend_by_category()[0].category_id == "food"


def test_list_transactions_orders_by_date_desc(fake_supabase):
    from datetime import datetime
    store = Store(client=fake_supabase)
    older = _txn("OLD", 10, "food"); older.occurred_at = datetime(2026, 4, 1)
    newer = _txn("NEW", 20, "food"); newer.occurred_at = datetime(2026, 5, 1)
    store.insert_transactions([older, newer])
    rows = store.list_transactions()
    assert rows[0]["merchant"] == "NEW"
