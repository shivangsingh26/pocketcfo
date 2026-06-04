# PocketCFO

A personal wealth and expense tracker. PocketCFO ingests ICICI Bank alert emails and CSV/PDF statements, categorises your spend with Claude, and presents everything in a bento dashboard with a CFO-style chat interface.

This repository covers **Slice 1** of a 4-slice plan:

- Spec: [`docs/superpowers/specs/2026-06-03-pocketcfo-slice1-design.md`](docs/superpowers/specs/2026-06-03-pocketcfo-slice1-design.md)
- Plan: [`docs/superpowers/plans/2026-06-03-pocketcfo-slice1.md`](docs/superpowers/plans/2026-06-03-pocketcfo-slice1.md)

---

## Repo Layout

```
pocketcfo/
├── sdk/                  # Python package (uv) — parsing, categorisation, pipeline
│   ├── pocketcfo/        # Source: models, pipeline, ingest, agents, store, schema.sql
│   └── tests/            # 28 pytest tests (fully offline, no credentials needed)
├── frontend/             # Next.js 15 app + FastAPI Python service
│   ├── app/              # Next.js App Router pages and components
│   └── api/              # FastAPI service (mounted at /api by Vercel Services)
├── vercel.json           # experimentalServices config (frontend + api)
├── .env.example          # Template for required environment variables
└── docs/                 # Specs and implementation plans
```

The deployment uses [Vercel experimentalServices](https://vercel.com/docs/deployments/overview): the Next.js frontend is built and served at `/`, and the FastAPI service is built and served at `/api`. Both share one domain and one set of environment variables.

---

## SDK Setup

Requires [uv](https://github.com/astral-sh/uv).

```bash
cd sdk
uv venv
uv pip install -e ".[dev]"
uv run pytest
```

Expected output: **28 passed**.

---

## Frontend Setup

Requires Node.js 20+.

```bash
cd frontend
npm install
npm run build   # production build
npm run dev     # development server on http://localhost:3000
```

---

## Environment Variables

Copy `.env.example` to `.env` for local development (never commit `.env`):

```bash
cp .env.example .env
# then fill in the values
```

| Variable              | Description                                              |
|-----------------------|----------------------------------------------------------|
| `SUPABASE_URL`        | Your Supabase project URL (`https://<ref>.supabase.co`) |
| `SUPABASE_SERVICE_KEY`| Service role key (bypasses RLS — keep secret)           |
| `ANTHROPIC_API_KEY`   | Anthropic API key for Claude-powered categorisation     |
| `CLAUDE_MODEL`        | Claude model slug (default: `claude-haiku-4-5-20251001`)|

For **Vercel deployments**, add the same variables in the Vercel dashboard under:
Project → Settings → Environment Variables.

---

## Supabase Setup

1. Create a new project at [supabase.com](https://supabase.com).
2. In the SQL editor, run the contents of `sdk/pocketcfo/schema.sql`. This creates the `transactions` and `categories` tables and seeds the 10 default categories.
3. Copy the project URL and service role key (Project → Settings → API) into your `.env` and the Vercel dashboard.

---

## Deploy to Vercel

### One-time project configuration

1. Import the repository in the [Vercel dashboard](https://vercel.com/new).
2. Under **Build & Deployment → Framework Preset**, select **Services**.
3. Add all four environment variables (see table above).

### Deploy

```bash
vercel --prod
```

### Local development (both services together)

```bash
vercel dev
```

This runs the Next.js frontend and the FastAPI service concurrently with shared routing, matching the production layout.

---

## Known Slice 1 Limitations

- **Gmail sync is not wired yet.** `POST /api/sync` returns HTTP 409 with the message `"connect Gmail coming soon"`. Use CSV or PDF upload via the dashboard instead.
- **Single-user, no authentication.** All data is stored in one account; multi-user support is planned for a later slice.
- **ICICI Bank formats only.** CSV/PDF parsing targets ICICI Bank statement layouts. Other bank formats will not parse correctly.

---

## Roadmap

| Slice | Theme | Highlights |
|-------|-------|------------|
| **2** | More banks + learning | HDFC/Axis CSV parsers; category-correction feedback loop; confidence improves over time |
| **3** | Budgets + nudges + cron | Monthly budget targets; overspend notifications; Vercel Cron job for daily email digest |
| **4** | Net worth + reports | Google Drive PDF reports; Google Calendar bill reminders; investment account linking |
