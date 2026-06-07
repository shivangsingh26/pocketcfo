from datetime import datetime
from ..parse.icici_sms import parse_sms
from ..pipeline import Pipeline
from ..models import SyncResult


def ingest_sms(text: str, occurred_at: datetime | None = None,
               pipeline: Pipeline | None = None) -> SyncResult:
    """Ingest a single forwarded transaction SMS through the pipeline. `occurred_at`
    is the SMS receipt time (SMS bodies carry no time). Returns an empty SyncResult
    if the text isn't a parseable transaction (OTP, promo, etc.). Dedup makes
    duplicate forwards harmless."""
    raw = parse_sms(text, occurred_at=occurred_at)
    if raw is None:
        return SyncResult()
    pipe = pipeline or Pipeline()
    return pipe._store_raws([raw])
