from datetime import datetime
from decimal import Decimal
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
    return RawTransaction(occurred_at=datetime(2026, 5, 1), amount=Decimal("100"), direction="debit",
                          merchant=m, account="ICICI-card", raw_text="x", source="gmail")


def test_sync_gmail_categorizes_and_stores():
    store = RecordingStore()
    pipe = Pipeline(store=store, categorizer=StubCategorizer(),
                    gmail_fetch=lambda q: [{"snippet": "ICICI Bank Credit Card XX1 used for INR 100.00 on 01-May-26 at SWIGGY. Available limit: INR 1.00."}])
    result = pipe.sync_gmail()
    assert isinstance(result, SyncResult)
    assert result.inserted == 1
    assert store.saved[0].category_id == "food"


def test_sync_gmail_without_fetcher_raises():
    import pytest
    pipe = Pipeline(store=RecordingStore(), categorizer=StubCategorizer())
    with pytest.raises(RuntimeError, match="Gmail not connected"):
        pipe.sync_gmail()


def test_ingest_file_csv_counts_needs_review():
    class ZeroConfCategorizer:
        def categorize(self, raw):
            return Transaction(**raw.model_dump(), category_id="other", confidence=0.0)
    store = RecordingStore()
    pipe = Pipeline(store=store, categorizer=ZeroConfCategorizer())
    csv = "Date,Description,Withdrawals,Deposits\n02-May-26,SWIGGY,100.00,\n"
    result = pipe.ingest_file(csv, kind="csv")
    assert result.inserted == 1
    assert result.needs_review == 1
