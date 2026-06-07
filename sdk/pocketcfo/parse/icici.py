import re
from datetime import datetime
from decimal import Decimal
from typing import Optional
from ..models import RawTransaction

_AMOUNT = r"INR\s*([\d,]+\.\d{2})"
# Real-world ICICI date shapes (checked in this order):
#   dd-Mon-YYYY: 30-Mar-2026  (payment-received emails)
#   dd-Mon-yy:   02-May-26    (synthetic statements / older alerts)
#   Mon DD, YYYY: Apr 10, 2026 (live credit-card transaction alerts)
_DATE_DMY4 = (r"\b(\d{2}-[A-Za-z]{3}-\d{4})\b", "%d-%b-%Y")
_DATE_DMY2 = (r"\b(\d{2}-[A-Za-z]{3}-\d{2})(?!\d)", "%d-%b-%y")
_DATE_MDY = (r"\b([A-Z][a-z]{2} \d{1,2}, \d{4})\b", "%b %d, %Y")
_DATE_FORMATS = [_DATE_DMY4, _DATE_DMY2, _DATE_MDY]


def _num(s: str) -> Decimal:
    return Decimal(s.replace(",", ""))


def _parse_date(text: str) -> Optional[datetime]:
    for pattern, fmt in _DATE_FORMATS:
        m = re.search(pattern, text)
        if m:
            return datetime.strptime(m.group(1), fmt)
    return None


def _parse_merchant(text: str) -> Optional[str]:
    # Live alerts put the merchant after "Info:"; the "at <time>" is a timestamp.
    info = re.search(r"Info:\s*(.+?)(?:\.\s|$)", text)
    if info:
        return info.group(1).strip()
    # Synthetic / card-swipe alerts: "...at MERCHANT. Available..."
    m = re.search(r"\bat\s+([A-Z0-9 ]+?)(?:\.|\s+Available)", text)
    if m:
        return m.group(1).strip()
    return None


def parse_alert(text: str) -> Optional[RawTransaction]:
    """Parse one ICICI alert (email body/snippet or statement line) into a
    RawTransaction, or None if it isn't a parseable INR transaction.
    Foreign-currency (e.g. USD) alerts return None — no conversion in scope."""
    t = " ".join(text.split())

    # Foreign-currency transactions (e.g. "transaction of USD 23.60") are out of
    # scope: the first INR figure in such alerts is the credit limit, not the
    # spend, so skip them rather than mis-record the limit as an amount.
    fx = re.search(r"transaction of\s+([A-Z]{3})\b", t)
    if fx and fx.group(1) != "INR":
        return None

    amt = re.search(_AMOUNT, t)
    occurred = _parse_date(t)
    if not amt or occurred is None:
        return None

    # Card alerts carry a precise time ("... at 05:53:41"); fold it into
    # occurred_at so same-day, same-amount txns stay distinct and ordered.
    tm = re.search(r"\bat\s+(\d{1,2}):(\d{2}):(\d{2})\b", t)
    if tm:
        occurred = occurred.replace(hour=int(tm.group(1)), minute=int(tm.group(2)),
                                    second=int(tm.group(3)))

    low = t.lower()
    is_card = "credit card" in low or "debit card" in low
    is_credit = (
        "credited" in low
        or "received payment" in low
        or "payment of" in low
    )
    direction = "credit" if is_credit else "debit"
    account = "ICICI-card" if is_card else "ICICI-bank"

    return RawTransaction(
        occurred_at=occurred,
        amount=_num(amt.group(1)),
        direction=direction,
        merchant=_parse_merchant(t),
        account=account,
        raw_text=text,
        source="gmail",
    )
