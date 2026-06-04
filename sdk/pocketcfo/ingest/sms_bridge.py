from ..parse.icici_sms import parse_sms
from ..pipeline import Pipeline
from ..models import SyncResult


def ingest_sms(text: str, pipeline: Pipeline | None = None) -> SyncResult:
    """Ingest a single forwarded transaction SMS through the pipeline. Returns an
    empty SyncResult if the text isn't a parseable transaction (OTP, promo, etc.).
    Dedup makes duplicate forwards harmless."""
    raw = parse_sms(text)
    if raw is None:
        return SyncResult()
    pipe = pipeline or Pipeline()
    return pipe._store_raws([raw])
