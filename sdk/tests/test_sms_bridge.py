from pocketcfo.ingest.sms_bridge import ingest_sms
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


CARD = ("INR 486.00 spent using ICICI Bank Card XX2006 on 05-Jun-26 on BUNDL "
        "TECHNOLOG. Avl Limit: INR 1,86,610.88.")


def test_ingest_card_sms():
    store = MemStore()
    pipe = Pipeline(store=store, categorizer=StubCategorizer())
    res = ingest_sms(CARD, pipeline=pipe)
    assert isinstance(res, SyncResult)
    assert res.inserted == 1
    assert store.rows[0].merchant == "BUNDL TECHNOLOG"


def test_ingest_non_transaction_sms_noop():
    store = MemStore()
    pipe = Pipeline(store=store, categorizer=StubCategorizer())
    res = ingest_sms("Your OTP is 123456", pipeline=pipe)
    assert res.inserted == 0 and store.rows == []


def test_ingest_sms_dedups():
    store = MemStore()
    pipe = Pipeline(store=store, categorizer=StubCategorizer())
    ingest_sms(CARD, pipeline=pipe)
    again = ingest_sms(CARD, pipeline=pipe)
    assert again.inserted == 0 and again.skipped == 1
