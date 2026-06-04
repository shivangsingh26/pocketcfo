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
from typing import Annotated

from fastapi import FastAPI, HTTPException, UploadFile, File, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from pocketcfo.store import Store
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
        totals = [c.model_dump() for c in Store().spend_by_category()]
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
        rows = Store().list_transactions(limit=50)
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


@app.post("/chat")
async def chat(body: ChatRequest):
    """Ask PocketCFO a natural-language question about your spending."""
    try:
        answer = CFO().ask(body.question)
        return JSONResponse(content=answer.model_dump())
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
