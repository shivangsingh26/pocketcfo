"""Command-line ingest entrypoint for repeatable Gmail-sourced sync.

The agent (Ingest Agent) searches ICICI alerts via the Gmail MCP, writes them to
a JSON file as a list of {"body"/"snippet": ...} dicts, then runs:

    pocketcfo-ingest emails.json

Ingestion is idempotent — dedup means re-running with overlapping emails only
adds genuinely new transactions."""
import json
import sys
from typing import Optional
from .ingest.mcp_bridge import ingest_emails
from .models import SyncResult


def run(path: Optional[str] = None, pipeline=None) -> SyncResult:
    raw = open(path).read() if path else sys.stdin.read()
    emails = json.loads(raw)
    return ingest_emails(emails, pipeline=pipeline)


def main() -> None:
    path = sys.argv[1] if len(sys.argv) > 1 else None
    result = run(path)
    print(
        f"inserted={result.inserted} skipped={result.skipped} "
        f"needs_review={result.needs_review}"
    )


if __name__ == "__main__":
    main()
