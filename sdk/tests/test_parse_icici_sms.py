from decimal import Decimal
from pocketcfo.parse.icici_sms import parse_sms

CARD = ("INR 486.00 spent using ICICI Bank Card XX2006 on 05-Jun-26 on BUNDL "
        "TECHNOLOG. Avl Limit: INR 1,86,610.88. If not you, call 1800 2662/SMS "
        "BLOCK 2006 to 9215676766")
DEBIT = ("ICICI Bank Acct XX402 debited for Rs 370.00 on 04-Jun-26; VIJETHA "
         "SUPER M credited. UPI:615579715049. Call 18002662 for dispute. SMS "
         "BLOCK 402 to 9215676766")
CREDIT = ("Dear Customer, Acct XX402 is credited with Rs 566.00 on 04-Jun-26 "
          "from Mr Sambhav Jain. UPI:615598591311-ICICI Bank.")


def test_card_spend():
    r = parse_sms(CARD)
    assert r is not None
    assert r.amount == Decimal("486.00")
    assert r.direction == "debit"
    assert r.account == "ICICI-card"
    assert r.merchant == "BUNDL TECHNOLOG"
    assert r.occurred_at.day == 5 and r.occurred_at.month == 6
    assert r.source == "sms"


def test_account_debit_rs_and_merchant():
    r = parse_sms(DEBIT)
    assert r.amount == Decimal("370.00")
    assert r.direction == "debit"
    assert r.account == "ICICI-bank"
    assert r.merchant == "VIJETHA SUPER M"


def test_account_credit_payer():
    r = parse_sms(CREDIT)
    assert r.amount == Decimal("566.00")
    assert r.direction == "credit"
    assert r.account == "ICICI-bank"
    assert r.merchant == "Mr Sambhav Jain"


def test_non_transaction_sms_returns_none():
    assert parse_sms("Your ICICI Bank OTP is 123456. Do not share it.") is None
