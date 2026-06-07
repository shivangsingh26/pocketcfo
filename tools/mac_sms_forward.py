#!/usr/bin/env python3
"""PocketCFO Mac SMS forwarder.

Reads new bank SMS from the macOS Messages database (populated via iPhone →
Mac "Text Message Forwarding") and POSTs each to the PocketCFO ingest webhook.
Runs every ~minute via launchd. Stdlib only.

Why this exists: iOS "Message" automations don't reliably fire on bank
short-code SMS. The Mac mirrors those same SMS into Messages, where we can read
them deterministically.

Setup:
  1. iPhone → Settings → Messages → Text Message Forwarding → enable this Mac.
  2. Grant Full Disk Access to the python that runs this (System Settings →
     Privacy & Security → Full Disk Access → add /usr/bin/python3).
  3. Load the launchd job (see tools/com.pocketcfo.smsforward.plist).
"""
from __future__ import annotations  # allow `str | None` on older system python

import json
import os
import pathlib
import re
import sqlite3
import sys
import urllib.request
from datetime import datetime, timezone

# Messages stores time as nanoseconds since 2001-01-01 UTC (Apple epoch).
_APPLE_EPOCH = 978307200


def _apple_to_iso(date_val) -> str | None:
    if not date_val:
        return None
    secs = date_val / 1e9 if date_val > 1e12 else float(date_val)
    return datetime.fromtimestamp(secs + _APPLE_EPOCH, tz=timezone.utc).isoformat()

DB = os.path.expanduser("~/Library/Messages/chat.db")
STATE = os.path.expanduser("~/.pocketcfo/sms_last_rowid")
WEBHOOK = ("https://pocketcfo-gilt.vercel.app/api/ingest-sms"
           "?token=1b3c8577481a0ffc093608cbd5558e71")
KEYWORD = "ICICI"  # only forward messages mentioning the bank


def _read_watermark() -> int:
    try:
        return int(open(STATE).read().strip())
    except Exception:
        return -1  # -1 => uninitialized (first run)


def _save_watermark(rowid: int) -> None:
    pathlib.Path(STATE).parent.mkdir(parents=True, exist_ok=True)
    open(STATE, "w").write(str(rowid))


def _decode_attributed_body(blob) -> str:
    """Best-effort plain-text extraction from a message's attributedBody blob
    (used when the `text` column is NULL on some macOS versions)."""
    if not blob:
        return ""
    raw = bytes(blob).decode("utf-8", "ignore")
    m = re.search(r"NSString\x01\x94\x84\x01\+(.*?)\x86", raw, re.S)
    return (m.group(1) if m else "").strip()


def _post(text: str, occurred_at: str | None = None) -> str:
    payload = {"text": text}
    if occurred_at:
        payload["occurred_at"] = occurred_at
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        WEBHOOK, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return f"{r.status}"
    except Exception as exc:  # noqa: BLE001
        return f"error {exc}"


def main() -> None:
    if not os.path.exists(DB):
        print("Messages DB not found — is Text Message Forwarding enabled?", file=sys.stderr)
        return
    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)

    # One-time backfill: `python mac_sms_forward.py backfill` forwards the most
    # recent received ICICI messages already in Messages (dedup makes it safe),
    # then sets the watermark. Use this to catch txns missed before setup.
    if len(sys.argv) > 1 and sys.argv[1] == "backfill":
        rows = con.execute(
            "select ROWID, text, attributedBody, date from message "
            "where is_from_me = 0 order by ROWID desc limit 60"
        ).fetchall()
        newest = _read_watermark()
        sent = 0
        for rowid, text, abody, mdate in rows:
            newest = max(newest, rowid)
            body = text or _decode_attributed_body(abody)
            if body and KEYWORD.lower() in body.lower():
                print(f"backfill ROWID {rowid} -> {_post(body, _apple_to_iso(mdate))}")
                sent += 1
        _save_watermark(newest)
        print(f"backfill done: forwarded {sent} ICICI message(s)")
        return

    last = _read_watermark()
    if last < 0:
        # First run: don't backfill the whole history — start from newest.
        maxid = con.execute("select coalesce(max(ROWID),0) from message").fetchone()[0]
        _save_watermark(maxid)
        print(f"initialized watermark at ROWID {maxid}; will forward new messages only")
        return

    rows = con.execute(
        "select ROWID, text, attributedBody, date from message "
        "where ROWID > ? and is_from_me = 0 order by ROWID", (last,)
    ).fetchall()

    newest = last
    sent = 0
    for rowid, text, abody, mdate in rows:
        newest = max(newest, rowid)
        body = text or _decode_attributed_body(abody)
        if body and KEYWORD.lower() in body.lower():
            status = _post(body, _apple_to_iso(mdate))
            sent += 1
            print(f"forwarded ROWID {rowid} -> {status}")
    if newest > last:
        _save_watermark(newest)
    if sent:
        print(f"done: forwarded {sent} ICICI message(s)")


if __name__ == "__main__":
    main()
