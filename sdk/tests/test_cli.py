import json
from pocketcfo.cli import run
from pocketcfo.pipeline import Pipeline
from pocketcfo.models import Transaction


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


EMAIL = {"snippet": "ICICI Bank Credit Card XX1 used for a transaction of INR 250.00 on Apr 02, 2026 at 05:13:38. Info: SWIGGY. The Available Credit Limit on your card is INR 1.00."}


def test_cli_run_ingests_json(tmp_path):
    p = tmp_path / "emails.json"
    p.write_text(json.dumps([EMAIL]))
    store = MemStore()
    pipe = Pipeline(store=store, categorizer=StubCategorizer())
    res = run(str(p), pipeline=pipe)
    assert res.inserted == 1
    assert store.rows[0].category_id == "food"


def test_cli_reingest_is_idempotent(tmp_path):
    p = tmp_path / "emails.json"
    p.write_text(json.dumps([EMAIL]))
    store = MemStore()
    pipe = Pipeline(store=store, categorizer=StubCategorizer())
    run(str(p), pipeline=pipe)
    again = run(str(p), pipeline=pipe)
    assert again.inserted == 0 and again.skipped == 1
