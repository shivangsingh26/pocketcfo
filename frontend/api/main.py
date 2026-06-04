"""
PocketCFO Python API — FastAPI application served as a Vercel Service.

This module is the single entrypoint for the Python service defined in the root
vercel.json under experimentalServices.  All five API routes live here.

Colocation approach:
  Root vercel.json uses experimentalServices (Vercel Services beta):
    - frontend service: entrypoint "frontend", routePrefix "/"  (Next.js App Router)
    - api service: entrypoint "frontend/api/main.py", routePrefix "/api"

  FastAPI is used because the vercel-services reference project (fastapi-vite)
  confirms FastAPI/ASGI is the supported Python handler pattern for Services.
  The legacy BaseHTTPRequestHandler convention is the old single-file builder and
  is NOT compatible with experimentalServices.

Environment variables required at runtime (set in Vercel dashboard / .env.local):
  SUPABASE_URL          — Supabase project URL
  SUPABASE_SERVICE_KEY  — Supabase service-role key
  ANTHROPIC_API_KEY     — Anthropic API key for Claude

TODO (Gmail OAuth wiring):
  /api/sync currently returns HTTP 409 with {"error": "...", "needs_gmail_auth": true}
  because Pipeline() is constructed with no gmail_fetch callable.  Once Gmail
  OAuth is implemented, pass a real fetcher:
    Pipeline(gmail_fetch=make_gmail_fetcher(access_token)).sync_gmail()
  See pocketcfo/ingest/gmail.py for the expected fetcher signature.
"""

import json
import io
import os
from typing import Annotated

from fastapi import FastAPI, HTTPException, UploadFile, File, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from pocketcfo.store_factory import get_store
from pocketcfo.pipeline import Pipeline
from pocketcfo.agents.cfo import CFO

app = FastAPI(title="PocketCFO API")


# ---------------------------------------------------------------------------
# JSON encoder helper — handles Decimal and datetime from SDK models
# ---------------------------------------------------------------------------

def _json_default(obj):
    """Fallback encoder: converts Decimal / datetime to str."""
    return str(obj)


def _jsonable(data) -> str:
    return json.loads(json.dumps(data, default=_json_default))


# ---------------------------------------------------------------------------
# GET /summary
# Routes to /api/summary via routePrefix strip in vercel.json
# ---------------------------------------------------------------------------

@app.get("/summary")
async def summary():
    """Return total spend grouped by category."""
    try:
        totals = [c.model_dump() for c in get_store().spend_by_category()]
        return JSONResponse(content=_jsonable({"categories": totals}))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# GET /transactions
# ---------------------------------------------------------------------------

@app.get("/transactions")
async def transactions():
    """Return the 50 most recent transactions."""
    try:
        rows = get_store().list_transactions(limit=50)
        return JSONResponse(content=_jsonable({"transactions": rows}))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# POST /sync
# ---------------------------------------------------------------------------

@app.post("/sync")
async def sync():
    """
    Trigger a Gmail sync.

    Slice 1 status: Gmail OAuth is NOT wired yet.  Pipeline() is constructed
    without a gmail_fetch callable so sync_gmail() raises RuntimeError
    ("Gmail not connected: no fetcher provided.").  This is caught and returned
    as HTTP 409 with needs_gmail_auth=true so the frontend can redirect to the
    OAuth flow when it is ready.

    TODO: replace the no-fetcher Pipeline() call with:
        from pocketcfo.ingest.gmail import make_fetcher  # future helper
        Pipeline(gmail_fetch=make_fetcher(oauth_token)).sync_gmail()
    """
    try:
        # No fetcher provided — sync_gmail() will raise RuntimeError.
        result = Pipeline().sync_gmail()
        return JSONResponse(content=result.model_dump())
    except RuntimeError as exc:
        return JSONResponse(
            status_code=409,
            content={"error": str(exc), "needs_gmail_auth": True},
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# POST /upload  (multipart, field: file)
# ---------------------------------------------------------------------------

@app.post("/upload")
async def upload(file: Annotated[UploadFile, File()]):
    """
    Ingest a bank statement file.

    Accepts:
      - .pdf  → parsed as PDF (pdfplumber)
      - .csv  → parsed as CSV

    Returns SyncResult counts (inserted, skipped, needs_review).
    """
    filename = file.filename or ""
    if filename.lower().endswith(".pdf"):
        kind = "pdf"
    elif filename.lower().endswith(".csv"):
        kind = "csv"
    else:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Send a .pdf or .csv bank statement.",
        )
    try:
        content: bytes = await file.read()
        result = Pipeline().ingest_file(content, kind=kind)
        return JSONResponse(content=result.model_dump())
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# POST /chat  (JSON: {"question": "..."})
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    question: str


class RecategorizeRequest(BaseModel):
    transaction_id: int | str
    category_id: str


class BudgetRequest(BaseModel):
    category_id: str
    monthly_limit: float


_CATEGORY_IDS = {
    "food", "travel", "clothing", "groceries", "bills",
    "entertainment", "health", "transport", "shopping", "other",
}


def _nudges(statuses) -> list[str]:
    out = []
    for s in statuses:
        pct = int(round(s["pct"] * 100))
        amt = f"INR {float(s['limit']):,.0f}"
        if s["over"]:
            out.append(f"⚠️ {s['emoji']} {s['label']} is OVER budget — {pct}% of {amt}.")
        elif s["pct"] >= 0.8:
            out.append(f"🔔 {s['emoji']} {s['label']} is at {pct}% of its {amt} budget.")
    return out


@app.post("/recategorize")
async def recategorize(body: RecategorizeRequest):
    if body.category_id not in _CATEGORY_IDS:
        raise HTTPException(status_code=400, detail=f"unknown category {body.category_id}")
    try:
        result = get_store().recategorize(body.transaction_id, body.category_id)
        return JSONResponse(content=_jsonable(result))
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@app.get("/budgets")
async def budgets(year: int | None = None, month: int | None = None):
    statuses = [b.model_dump() for b in get_store().budget_status(year, month)]
    statuses = _jsonable({"v": statuses})["v"]
    return JSONResponse(content={"statuses": statuses, "nudges": _nudges(statuses)})


@app.post("/budgets")
async def set_budget(body: BudgetRequest):
    if body.category_id not in _CATEGORY_IDS:
        raise HTTPException(status_code=400, detail=f"unknown category {body.category_id}")
    try:
        get_store().set_budget(body.category_id, body.monthly_limit)
        return JSONResponse(content={"ok": True})
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/ingest-sms")
async def ingest_sms_endpoint(request: Request):
    """Webhook for an Android SMS-forwarder app. Lenient about field names; the
    forwarder POSTs the SMS text (JSON or form). Guarded by INGEST_SECRET when set
    (via ?token= or X-Ingest-Secret header) so the public URL can't be spammed."""
    secret = os.environ.get("INGEST_SECRET")
    if secret:
        provided = request.query_params.get("token") or request.headers.get("x-ingest-secret")
        if provided != secret:
            raise HTTPException(status_code=401, detail="invalid token")

    body: dict = {}
    try:
        body = await request.json()
    except Exception:
        try:
            body = dict(await request.form())
        except Exception:
            body = {}
    text = (body.get("text") or body.get("message") or body.get("body")
            or body.get("content") or body.get("msg") or "")
    if not isinstance(text, str) or not text.strip():
        raise HTTPException(status_code=400, detail="no SMS text found in request")

    from pocketcfo.ingest.sms_bridge import ingest_sms
    result = ingest_sms(text)
    return JSONResponse(content=result.model_dump())


@app.post("/chat")
async def chat(body: ChatRequest):
    """Ask PocketCFO a natural-language question about your spending."""
    try:
        answer = CFO().ask(body.question)
        return JSONResponse(content=answer.model_dump())
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
