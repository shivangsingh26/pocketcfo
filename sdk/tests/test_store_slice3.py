from datetime import datetime
from decimal import Decimal
import pytest
from pocketcfo.models import Transaction
from pocketcfo.store_local import LocalStore


def _txn(merchant, amount, cat, day=1, direction="debit"):
    return Transaction(
        occurred_at=datetime(2026, 5, day, 12, 0), amount=Decimal(str(amount)),
        direction=direction, merchant=merchant, account="ICICI-card",
        raw_text="x", source="gmail", category_id=cat, confidence=0.8)


def test_recategorize_updates_all_same_merchant_and_creates_rule(tmp_path):
    s = LocalStore(db_path=str(tmp_path / "t.db"))
    s.insert_transactions([
        _txn("SWIGGY", 100, "shopping", 1),
        _txn("SWIGGY", 200, "shopping", 2),
        _txn("UBER", 50, "transport", 3),
    ])
    swiggy = [r for r in s.list_transactions() if r["merchant"] == "SWIGGY"][0]
    res = s.recategorize(swiggy["id"], "food")
    assert res["updated"] == 2
    assert s.get_rules()["SWIGGY"] == "food"
    cats = {r["merchant"]: r["category_id"] for r in s.list_transactions()}
    assert cats["SWIGGY"] == "food" and cats["UBER"] == "transport"


def test_recategorize_unknown_txn_raises(tmp_path):
    s = LocalStore(db_path=str(tmp_path / "t.db"))
    with pytest.raises(KeyError):
        s.recategorize(999, "food")


def test_set_budget_and_status(tmp_path):
    s = LocalStore(db_path=str(tmp_path / "t.db"))
    s.insert_transactions([_txn("SWIGGY", 4000, "food", 5), _txn("ZOMATO", 1200, "food", 6)])
    s.set_budget("food", 5000)
    st = s.budget_status(2026, 5)
    assert len(st) == 1
    assert st[0].spent == Decimal("5200") and st[0].limit == Decimal("5000")
    assert st[0].over is True and st[0].pct > 1.0


def test_budget_status_defaults_latest_month(tmp_path):
    s = LocalStore(db_path=str(tmp_path / "t.db"))
    s.insert_transactions([_txn("X", 100, "food", 5)])
    s.set_budget("food", 1000)
    assert s.budget_status()[0].spent == Decimal("100")


def test_set_budget_rejects_nonpositive(tmp_path):
    s = LocalStore(db_path=str(tmp_path / "t.db"))
    with pytest.raises(ValueError):
        s.set_budget("food", 0)
