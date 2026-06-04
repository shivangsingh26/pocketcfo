from typing import Callable, Iterable, Literal
from .models import RawTransaction, SyncResult
from .store_factory import get_store
from .agents.categorizer import Categorizer
from .ingest.gmail import fetch_icici_transactions
from .ingest.statements import parse_csv, parse_pdf


class Pipeline:
    def __init__(
        self,
        store=None,
        categorizer=None,
        gmail_fetch: Callable[[str], Iterable[dict]] | None = None,
    ):
        self.store = store or get_store()
        if categorizer is None:
            rules = getattr(self.store, "get_rules", lambda: {})()
            categorizer = Categorizer(rules=rules)
        self.categorizer = categorizer
        self.gmail_fetch = gmail_fetch

    def _store_raws(self, raws: list[RawTransaction]) -> SyncResult:
        txns = [self.categorizer.categorize(r) for r in raws]
        needs_review = sum(1 for t in txns if t.confidence == 0.0)
        inserted, skipped = self.store.insert_transactions(txns)
        return SyncResult(inserted=inserted, skipped=skipped, needs_review=needs_review)

    def sync_gmail(self) -> SyncResult:
        if self.gmail_fetch is None:
            raise RuntimeError("Gmail not connected: no fetcher provided.")
        raws = fetch_icici_transactions(self.gmail_fetch)
        return self._store_raws(raws)

    def ingest_file(
        self,
        content: bytes | str,
        kind: Literal["csv", "pdf"],
        account: str = "ICICI-bank",
    ) -> SyncResult:
        if kind == "csv":
            raws = parse_csv(content if isinstance(content, str) else content.decode(), account)
        else:
            raws = parse_pdf(content if isinstance(content, bytes) else content.encode(), account)
        return self._store_raws(raws)
