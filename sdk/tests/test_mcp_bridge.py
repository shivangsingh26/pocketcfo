from pocketcfo.ingest.mcp_bridge import ingest_emails
from pocketcfo.pipeline import Pipeline
from pocketcfo.models import Transaction, SyncResult


class StubCategorizer:
    def categorize(self, raw):
        return Transaction(**raw.model_dump(), category_id="food", confidence=0.9)


class MemStore:
    def __init__(self): self.rows = []
    def insert_transactions(self, txns):
        existing = {r.dedup_key() for r in self.rows}
        new = [t for t in txns if t.dedup_key() not in existing]
        self.rows.extend(new)
        return len(new), len(txns) - len(new)


EMAIL = {"snippet": "ICICI Bank Credit Card XX1 used for INR 250.00 on 02-May-26 at SWIGGY. Available limit: INR 1.00."}
JUNK = {"snippet": "Newsletter: budgeting tips"}


def test_ingest_emails_parses_and_stores():
    store = MemStore()
    pipe = Pipeline(store=store, categorizer=StubCategorizer())
    result = ingest_emails([EMAIL, JUNK], pipeline=pipe)
    assert isinstance(result, SyncResult)
    assert result.inserted == 1
    assert store.rows[0].category_id == "food"


def test_ingest_emails_dedups_on_reingest():
    store = MemStore()
    pipe = Pipeline(store=store, categorizer=StubCategorizer())
    ingest_emails([EMAIL], pipeline=pipe)
    again = ingest_emails([EMAIL], pipeline=pipe)
    assert again.inserted == 0 and again.skipped == 1
