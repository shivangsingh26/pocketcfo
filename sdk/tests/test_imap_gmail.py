from email.message import EmailMessage
from pocketcfo.ingest.imap_gmail import extract_text


def test_extract_text_plain():
    m = EmailMessage()
    m["From"] = "credit_cards@icicibank.com"
    m["Subject"] = "Transaction alert"
    m.set_content("Your ICICI Bank Credit Card XX2006 has been used for a "
                  "transaction of INR 486.00 on Apr 10, 2026 at 05:53:41. "
                  "Info: SHREE GANPATI PLAZA.")
    text = extract_text(m.as_bytes())
    assert "INR 486.00" in text
    assert "SHREE GANPATI PLAZA" in text


def test_extract_text_html_fallback():
    m = EmailMessage()
    m["From"] = "credit_cards@icicibank.com"
    m.add_header("Content-Type", "text/html")
    m.set_payload("<html><body><p>INR 250.00 spent at <b>SWIGGY</b></p></body></html>")
    text = extract_text(m.as_bytes())
    assert "INR 250.00" in text and "SWIGGY" in text
    assert "<" not in text  # tags stripped
