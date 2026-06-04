from typing import Callable, Iterable
from ..models import RawTransaction
from ..parse.icici import parse_alert

# A fetcher takes a Gmail search query and returns dicts with a "snippet" and/or "body".
EmailFetcher = Callable[[str], Iterable[dict]]

ICICI_QUERY = 'from:(icicibank.com OR icicibank.net) (debited OR credited OR "Credit Card")'


def fetch_icici_transactions(fetch_emails: EmailFetcher, query: str = ICICI_QUERY) -> list[RawTransaction]:
    out: list[RawTransaction] = []
    for msg in fetch_emails(query):
        text = msg.get("body") or msg.get("snippet") or ""
        raw = parse_alert(text)
        if raw is not None:
            out.append(raw)
    return out
