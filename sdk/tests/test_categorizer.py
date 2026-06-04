from datetime import datetime
from decimal import Decimal
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
    return RawTransaction(occurred_at=datetime(2026, 5, 1), amount=Decimal("250"), direction="debit",
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


def test_categorize_preserves_raw_fields():
    cat = Categorizer(client=FakeAnthropic("transport", 0.7))
    txn = cat.categorize(_raw("UBER"))
    assert txn.merchant == "UBER"
    assert txn.amount == Decimal("250")
    assert txn.source == "gmail"
