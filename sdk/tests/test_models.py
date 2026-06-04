from datetime import datetime
from decimal import Decimal
import pytest
from pydantic import ValidationError
from pocketcfo.models import RawTransaction, Transaction, Category, CategoryTotal, SyncResult, ChatAnswer
from pocketcfo.config import Config


def test_raw_transaction_dedup_key_is_stable():
    raw = RawTransaction(
        occurred_at=datetime(2026, 5, 1, 12, 0),
        amount=Decimal("250.00"),
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
        amount=Decimal("250.00"),
        direction="debit",
        merchant="SWIGGY",
        account="ICICI-card",
        raw_text="...",
        source="gmail",
        category_id="food",
        confidence=0.9,
    )
    assert txn.category_id == "food"


def test_dedup_key_differs_when_fields_differ():
    base = dict(occurred_at=datetime(2026, 5, 1, 12, 0), amount=Decimal("250.00"),
                direction="debit", merchant="SWIGGY", account="ICICI-card",
                raw_text="x", source="gmail")
    a = RawTransaction(**base)
    b = RawTransaction(**{**base, "amount": Decimal("251.00")})
    c = RawTransaction(**{**base, "merchant": "UBER"})
    assert len({a.dedup_key(), b.dedup_key(), c.dedup_key()}) == 3


def test_transaction_missing_category_raises():
    with pytest.raises(ValidationError):
        Transaction(occurred_at=datetime(2026, 5, 1), amount=Decimal("1.00"),
                    direction="debit", raw_text="x", source="gmail")  # no category_id


def test_syncresult_defaults_zero():
    r = SyncResult()
    assert (r.inserted, r.skipped, r.needs_review) == (0, 0, 0)


def test_config_require_raises_for_missing(monkeypatch):
    monkeypatch.setattr(Config, "ANTHROPIC_API_KEY", "")
    with pytest.raises(RuntimeError):
        Config.require("ANTHROPIC_API_KEY")
