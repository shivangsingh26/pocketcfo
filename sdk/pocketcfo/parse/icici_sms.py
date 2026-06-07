import re
from datetime import datetime
from typing import Optional
from ..models import RawTransaction
from .icici import _parse_date, _num

# SMS amounts use either "INR" or "Rs"/"Rs."
_AMOUNT = r"(?:INR|Rs\.?)\s*([\d,]+\.\d{2})"


def _merchant(text: str) -> Optional[str]:
    # Card spend: "... on <date> on MERCHANT. Avl ..."
    m = re.search(r"\bon\s+\d{2}-[A-Za-z]{3}-\d{2}\s+on\s+(.+?)\s*(?:\.|$)", text)
    if m:
        return m.group(1).strip()
    # Account debit: "... debited for Rs X on <date>; MERCHANT credited."
    m = re.search(r";\s*(.+?)\s+credited\b", text)
    if m:
        return m.group(1).strip()
    # Account credit: "... credited with Rs X ... from NAME. UPI:..."
    m = re.search(r"\bfrom\s+(.+?)(?:\.|\s+UPI|$)", text)
    if m:
        return m.group(1).strip()
    return None


def parse_sms(text: str, occurred_at: Optional[datetime] = None) -> Optional[RawTransaction]:
    """Parse one ICICI transaction SMS into a RawTransaction, or None if it isn't
    a parseable INR/Rs transaction (e.g. an OTP or promo). `occurred_at` (the SMS
    receipt time) is used when provided — SMS bodies carry no time of their own."""
    t = " ".join(text.split())
    amt = re.search(_AMOUNT, t)
    when = occurred_at or _parse_date(t)
    if not amt or when is None:
        return None

    low = t.lower()
    is_card = "card" in low
    # "spent"/"debited" => money out; otherwise "credited" => money in.
    if "spent" in low or "debited" in low:
        direction = "debit"
    elif "credited" in low:
        direction = "credit"
    else:
        direction = "debit"

    ref_m = re.search(r"UPI:?\s*(\d{6,})", t)

    return RawTransaction(
        occurred_at=when,
        amount=_num(amt.group(1)),
        direction=direction,
        merchant=_merchant(t),
        account="ICICI-card" if is_card else "ICICI-bank",
        raw_text=text,
        source="sms",
        ref=ref_m.group(1) if ref_m else None,
    )
