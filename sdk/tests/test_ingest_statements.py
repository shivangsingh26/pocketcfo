from pathlib import Path
from decimal import Decimal
from pocketcfo.ingest.statements import parse_csv

FIX = Path(__file__).parent / "fixtures" / "icici_statement.csv"


def test_parse_csv_directions_and_amounts():
    rows = parse_csv(FIX.read_text(), account="ICICI-bank")
    by_merchant = {r.merchant: r for r in rows}
    assert by_merchant["SWIGGY BANGALORE"].direction == "debit"
    assert by_merchant["SWIGGY BANGALORE"].amount == Decimal("2499.00")
    assert by_merchant["SALARY"].direction == "credit"
    assert by_merchant["SALARY"].amount == Decimal("50000.00")
    assert all(r.source == "csv" for r in rows)


import pytest
from pocketcfo.ingest import statements


class _FakePage:
    def __init__(self, tables): self._tables = tables
    def extract_tables(self): return self._tables


class _FakePDF:
    def __init__(self, pages): self.pages = pages
    def __enter__(self): return self
    def __exit__(self, *a): return False


def _patch_pdf(monkeypatch, tables):
    import pdfplumber
    monkeypatch.setattr(pdfplumber, "open", lambda *_a, **_k: _FakePDF([_FakePage(tables)]))


def test_parse_pdf_happy(monkeypatch):
    _patch_pdf(monkeypatch, [[
        ["Date", "Description", "Withdrawals", "Deposits"],
        ["02-May-26", "SWIGGY BANGALORE", "2499.00", ""],
        ["01-May-26", "SALARY", "", "50000.00"],
    ]])
    rows = statements.parse_pdf(b"fake")
    assert len(rows) == 2
    assert all(r.source == "pdf" for r in rows)
    assert rows[0].raw_text != "pdf"  # provenance preserved


def test_parse_pdf_no_text_raises(monkeypatch):
    _patch_pdf(monkeypatch, [])
    with pytest.raises(ValueError, match="No extractable text"):
        statements.parse_pdf(b"fake")


def test_parse_pdf_bad_header_raises(monkeypatch):
    _patch_pdf(monkeypatch, [[["Foo", "Bar"], ["x", "y"]]])
    with pytest.raises(ValueError, match="Unrecognized statement table header"):
        statements.parse_pdf(b"fake")
