"""Server-side Gmail reader via IMAP + App Password (no Google Cloud OAuth).

Used by the Vercel Cron sync to pull ICICI credit-card alert emails on a
schedule. The message-text extraction is separated from IMAP I/O so it can be
unit-tested without a live mailbox."""
import email
import imaplib
import re
from datetime import datetime, timedelta, timezone


def _strip_html(html: str) -> str:
    return re.sub(r"<[^>]+>", " ", html)


def extract_text(raw: bytes) -> str:
    """Extract a flat text body from a raw RFC822 email (prefers text/plain,
    falls back to stripped HTML)."""
    msg = email.message_from_bytes(raw)
    plain, html = [], []
    if msg.is_multipart():
        for part in msg.walk():
            ctype = part.get_content_type()
            payload = part.get_payload(decode=True)
            if not payload:
                continue
            text = payload.decode(part.get_content_charset() or "utf-8", "ignore")
            if ctype == "text/plain":
                plain.append(text)
            elif ctype == "text/html":
                html.append(_strip_html(text))
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            text = payload.decode(msg.get_content_charset() or "utf-8", "ignore")
            if msg.get_content_type() == "text/html":
                text = _strip_html(text)
            plain.append(text)
    parts = plain or html
    return " ".join(" ".join(p.split()) for p in parts)


def fetch_icici(user: str, password: str, since_days: int = 10,
                host: str = "imap.gmail.com", limit: int = 80) -> list[dict]:
    """Connect to Gmail over IMAP, find recent ICICI emails, and return
    [{"body": <text>}] dicts ready for fetch_icici_transactions()."""
    since = (datetime.now(timezone.utc) - timedelta(days=since_days)).strftime("%d-%b-%Y")
    out: list[dict] = []
    M = imaplib.IMAP4_SSL(host)
    try:
        M.login(user, password)
        M.select("INBOX")
        # IMAP FROM matches a substring of the From header, so this catches
        # credit_cards@icicibank.com and services@custcomm.icicibank.com alike.
        typ, data = M.search(None, f'(FROM "icicibank.com" SINCE {since})')
        ids = data[0].split() if data and data[0] else []
        for msg_id in ids[-limit:]:
            typ, msgdata = M.fetch(msg_id, "(RFC822)")
            if not msgdata or not msgdata[0]:
                continue
            raw = msgdata[0][1]
            out.append({"body": extract_text(raw)})
    finally:
        try:
            M.logout()
        except Exception:
            pass
    return out
