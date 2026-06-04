from pathlib import Path
from decimal import Decimal
from pocketcfo.pipeline import Pipeline
from pocketcfo.models import Transaction


class StubCategorizer:
    def categorize(self, raw):
        cat = "food" if raw.merchant and "SWIGGY" in raw.merchant else "other"
        return Transaction(**raw.model_dump(), category_id=cat, confidence=0.9)


class MemStore:
    def __init__(self): self.rows = []
    def insert_transactions(self, txns):
        existing = {r.dedup_key() for r in self.rows}
        new = [t for t in txns if t.dedup_key() not in existing]
        self.rows.extend(new)
        return len(new), len(txns) - len(new)


def test_csv_to_categorized_store():
    store = MemStore()
    pipe = Pipeline(store=store, categorizer=StubCategorizer())
    csv = (Path(__file__).parent / "fixtures" / "icici_statement.csv").read_text()
    result = pipe.ingest_file(csv, kind="csv")
    assert result.inserted == 3
    assert any(t.category_id == "food" for t in store.rows)
    # re-ingest is fully deduped
    again = pipe.ingest_file(csv, kind="csv")
    assert again.inserted == 0 and again.skipped == 3
