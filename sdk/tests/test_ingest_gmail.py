from pocketcfo.ingest.gmail import fetch_icici_transactions

SAMPLE = [
    {"snippet": "Your ICICI Bank Credit Card XX1234 has been used for INR 2,499.00 on 02-May-26 at SWIGGY BANGALORE. Available limit: INR 1,20,000.00."},
    {"snippet": "Newsletter: budgeting tips"},
]


def test_fetch_filters_and_parses():
    def fake_fetch(query):
        assert "icici" in query.lower()
        return SAMPLE
    txns = fetch_icici_transactions(fetch_emails=fake_fetch)
    assert len(txns) == 1
    assert txns[0].amount == 2499.00
    assert txns[0].source == "gmail"


def test_prefers_body_over_snippet():
    body_text = "ICICI Bank Account XX5678 has been credited with INR 100.00 on 01-May-26. Info: REFUND."

    # snippet alone is non-parseable; a successful parse proves body was used
    def fake_fetch(query):
        return [{"snippet": "truncated newsletter", "body": body_text}]

    txns = fetch_icici_transactions(fetch_emails=fake_fetch)
    assert len(txns) == 1
    assert txns[0].direction == "credit"
