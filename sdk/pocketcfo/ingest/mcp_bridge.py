from .gmail import fetch_icici_transactions
from ..pipeline import Pipeline
from ..models import SyncResult


def ingest_emails(emails: list[dict], pipeline: Pipeline | None = None) -> SyncResult:
    """Ingest Gmail-MCP email dicts (each with 'snippet' and/or 'body') through
    the pipeline. The agent supplies `emails` after a Gmail MCP search — keeping
    the MCP dependency out of the SDK."""
    pipe = pipeline or Pipeline()
    raws = fetch_icici_transactions(fetch_emails=lambda _q: emails)
    return pipe._store_raws(raws)
