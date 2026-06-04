import csv
import io
from datetime import datetime
from decimal import Decimal
from typing import Literal
from ..models import RawTransaction


def _date(s: str) -> datetime:
    return datetime.strptime(s.strip(), "%d-%b-%y")


def _num(s: str) -> Decimal:
    return Decimal(s.replace(",", "").strip())


def parse_csv(text: str, account: str = "ICICI-bank") -> list[RawTransaction]:
    out: list[RawTransaction] = []
    reader = csv.DictReader(io.StringIO(text))
    for row in reader:
        desc = (row.get("Description") or "").strip()
        wd = (row.get("Withdrawals") or "").strip()
        dep = (row.get("Deposits") or "").strip()
        if wd:
            amount, direction = _num(wd), "debit"
        elif dep:
            amount, direction = _num(dep), "credit"
        else:
            continue
        out.append(RawTransaction(
            occurred_at=_date(row["Date"]), amount=amount, direction=direction,
            merchant=desc, account=account, raw_text=str(row), source="csv",
        ))
    return out


def parse_pdf(data: bytes, account: str = "ICICI-bank") -> list[RawTransaction]:
    import pdfplumber
    rows: list[list[str]] = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for page in pdf.pages:
            for table in page.extract_tables() or []:
                rows.extend(table)
    if not rows:
        raise ValueError("No extractable text in PDF (scanned image? OCR is out of scope).")
    header = rows[0]
    normalized = {(h or "").strip() for h in header}
    required = {"Date", "Description"}
    if not required.issubset(normalized) or not ({"Withdrawals", "Deposits"} & normalized):
        raise ValueError(
            f"Unrecognized statement table header: {header!r}. "
            "Expected ICICI columns Date, Description, Withdrawals/Deposits."
        )
    body = rows[1:]
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(header)
    w.writerows(body)
    return [r.model_copy(update={"source": "pdf"}) for r in parse_csv(buf.getvalue(), account)]
