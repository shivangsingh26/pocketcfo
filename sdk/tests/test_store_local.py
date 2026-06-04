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
