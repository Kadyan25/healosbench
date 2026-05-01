# Healosbench

LLM eval harness for structured clinical extraction. Takes a doctor–patient transcript, runs it through three prompt strategies, and scores the output field-by-field against a human-annotated gold standard.

---

## What's in here

```
apps/server     Hono API on :8787 — runs evals, stores results, streams SSE
apps/web        Next.js dashboard on :3002 — runs list, run detail, compare view
packages/llm    Anthropic SDK wrapper — tool use, retry loop, prompt caching
packages/db     Postgres + Drizzle — runs, case results, attempts, metrics
packages/shared Zod schemas and TypeScript types shared between server and web
packages/env    Validated env loading
data/
  transcripts/  50 synthetic clinical transcripts
  gold/         50 matching ground-truth extractions
  schema.json   JSON schema all extractions must conform to
results/        Full JSON dumps from the three strategy runs (committed)
```

---

## Setup

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.3
- Postgres running locally (Docker is fine)
- An Anthropic API key

### 1. Install

```bash
bun install
```

### 2. Create the database

```bash
# create a database called healosbench in your local Postgres
psql -U postgres -c "CREATE DATABASE healosbench;"
```

### 3. Configure env

```bash
cp apps/server/.env.example apps/server/.env
```

Then edit `apps/server/.env`:

```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/healosbench
ANTHROPIC_API_KEY=sk-ant-...
BETTER_AUTH_SECRET=any-random-string-32-chars-or-longer
BETTER_AUTH_URL=http://localhost:8787
CORS_ORIGIN=http://localhost:3002
```

`BETTER_AUTH_SECRET` just needs to be ≥ 32 characters — it's validated at startup even if you're only running evals.

### 4. Push the schema

```bash
bun run db:push
```

---

## Running evals

### CLI (no dashboard needed)

```bash
bun run eval -- --strategy=zero_shot
bun run eval -- --strategy=few_shot
bun run eval -- --strategy=cot
```

Optional flags:
- `--model=claude-haiku-4-5-20251001` (default)
- `--limit=5` (run on first N cases only, useful for testing)
- `--force` (re-run even if cached results exist)

Prints a per-field F1 table, hallucination rate, schema fail rate, cost, and wall time. Full JSON dump saved to `results/<run-id>.json`.

### Dev server + dashboard

```bash
bun run dev
```

Server: http://localhost:8787  
Dashboard: http://localhost:3002

Pages:
- `/runs` — all runs
- `/runs/<id>` — case-level scores, LLM trace, hallucination flags
- `/compare?a=<id>&b=<id>` — per-field delta between two runs

---

## Strategies

| Strategy  | Description |
|-----------|-------------|
| zero_shot | Terse system prompt — just the schema and "extract" |
| few_shot  | System prompt + 2 hand-written transcript→JSON examples in a cached block |
| cot       | Zero-shot prompt but user message asks for a `<scratchpad>` before the tool call |

All three use Anthropic tool use (`tool_choice: { type: "tool" }`) — no `JSON.parse` of raw model text anywhere.

---

## Results

All three strategies on 50 cases with `claude-haiku-4-5-20251001`. Full JSON in `results/`.

| Strategy  | overall F1 | cost    |
|-----------|------------|---------|
| zero_shot | 0.7307     | $0.1400 |
| few_shot  | 0.7626     | $0.1955 |
| cot       | 0.7351     | $0.1419 |
| **total** |            | **$0.477** |

See `NOTES.md` for per-field breakdown and analysis.

---

## Running tests

```bash
bun test --cwd apps/server
```

17 tests covering: schema-retry path, fuzzy med matching, set-F1, hallucination positive/negative, resumability, idempotency, rate-limit backoff, prompt-hash stability.
