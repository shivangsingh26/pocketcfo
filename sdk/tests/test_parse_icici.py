from decimal import Decimal
from pocketcfo.parse.icici import parse_alert

DEBIT_CARD_ALERT = (
    "Dear Customer, Your ICICI Bank Credit Card XX1234 has been used for "
    "INR 2,499.00 on 02-May-26 at SWIGGY BANGALORE. "
    "Available limit: INR 1,20,000.00."
)
DEBIT_ACCT_ALERT = (
    "Dear Customer, INR 850.50 has been debited from your ICICI Bank Account "
    "XX5678 on 03-May-26. Info: UPI/UBER INDIA. Available balance: INR 40,000.00."
)
CREDIT_ALERT = (
    "Dear Customer, your ICICI Bank Account XX5678 has been credited with "
    "INR 50,000.00 on 01-May-26. Info: SALARY."
)


def test_parse_card_debit():
    raw = parse_alert(DEBIT_CARD_ALERT)
    assert raw is not None
    assert raw.amount == Decimal("2499.00")
    assert raw.direction == "debit"
    assert raw.account == "ICICI-card"
    assert "SWIGGY" in raw.merchant
    assert raw.occurred_at.day == 2 and raw.occurred_at.month == 5


def test_parse_account_debit():
    raw = parse_alert(DEBIT_ACCT_ALERT)
    assert raw.amount == Decimal("850.50")
    assert raw.direction == "debit"
    assert raw.account == "ICICI-bank"
    assert "UBER" in raw.merchant


def test_parse_credit():
    raw = parse_alert(CREDIT_ALERT)
    assert raw.direction == "credit"
    assert raw.amount == Decimal("50000.00")


def test_unparseable_returns_none():
    assert parse_alert("Newsletter: 5 tips to save money") is None


# --- Real live ICICI credit-card alert format (Mon DD, YYYY + Info: merchant) ---
REAL_CARD_ALERT = (
    "Dear Customer, Your ICICI Bank Credit Card XX2006 has been used for a "
    "transaction of INR 13500.00 on Apr 10, 2026 at 05:53:41. Info: SHREE "
    "GANPATI PLAZA. The Available Credit Limit on your card is INR 3,69982.21."
)
REAL_CARD_SPECIAL = (
    "Dear Customer, Your ICICI Bank Credit Card XX2006 has been used for a "
    "transaction of INR 2513.00 on Apr 02, 2026 at 05:13:38. Info: RAZ*ixigo. "
    "The Available Credit Limit on your card is INR 4,13640.24."
)
REAL_PAYMENT = (
    "Dear Customer, We have received payment of INR 77840.26 on your ICICI Bank "
    "Credit Card account 4501 XXXX XXXX 2006 on 30-Mar-2026."
)
REAL_USD = (
    "Dear Customer, Your ICICI Bank Credit Card XX2006 has been used for a "
    "transaction of USD 23.60 on Apr 08, 2026 at 04:33:28. Info: CLAUDE.AI "
    "SUBSCRIPTION. The Available Credit Limit on your card is INR 3,90000.00."
)


def test_real_card_alert_amount_date_merchant():
    raw = parse_alert(REAL_CARD_ALERT)
    assert raw is not None
    assert raw.amount == Decimal("13500.00")
    assert raw.direction == "debit"
    assert raw.account == "ICICI-card"
    assert raw.merchant == "SHREE GANPATI PLAZA"
    assert raw.occurred_at.month == 4 and raw.occurred_at.day == 10 and raw.occurred_at.year == 2026


def test_real_merchant_keeps_special_chars():
    raw = parse_alert(REAL_CARD_SPECIAL)
    assert raw.merchant == "RAZ*ixigo"
    assert raw.amount == Decimal("2513.00")


def test_real_payment_received_is_credit():
    raw = parse_alert(REAL_PAYMENT)
    assert raw is not None
    assert raw.direction == "credit"
    assert raw.amount == Decimal("77840.26")


def test_foreign_currency_skipped():
    assert parse_alert(REAL_USD) is None


def test_card_alert_captures_time():
    raw = parse_alert(REAL_CARD_ALERT)  # "...on Apr 10, 2026 at 05:53:41..."
    assert (raw.occurred_at.hour, raw.occurred_at.minute, raw.occurred_at.second) == (5, 53, 41)
