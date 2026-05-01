# CLAUDE.md — HEALOSBENCH

You are working on a take-home assessment: an LLM eval harness for structured clinical extraction. The full brief lives in `README.md` at the repo root — **read it before you start any phase**. This file is the working agreement between you and the developer.

---

## Operating mode

- **Long autonomous sessions, one phase at a time.** Each phase below is self-contained. Do the whole phase, then stop.
- **Run tests and the eval only at the end of each phase**, not between files. Mid-phase, only run `tsc --noEmit` or the equivalent type-check if you suspect a type error.
- The developer reviews after each phase. Don't start the next phase without being asked.
- When you finish a phase, end with a short summary: what you built, what you skipped, what you're unsure about, and the exact commands you ran to verify.

## Discovery before doing — non-negotiable

At the start of **every** session, before writing any code:

1. Read `README.md` (the brief) and this file end-to-end.
2. `ls` the repo and read every existing `package.json`, `tsconfig.json`, `turbo.json`, and any `.env.example`.
3. Read the existing source in `apps/server/src`, `apps/web`, `packages/db`, `packages/env`. Note what's stubbed, what's real, what routes/schemas already exist.
4. Read 3 transcripts from `data/transcripts/` and their matching files in `data/gold/`, plus `data/schema.json` in full.
5. Check `package.json` scripts for the test runner already configured. Use whatever's there — do not add a new test framework.
6. Only then, start the phase.

If anything in the existing code contradicts a decision in this file, **stop and ask** rather than guessing.

---

## Hard requirements — these are pass/fail for the assessment

If you violate any of these, the submission fails. Re-read this list at the start of every phase.

1. **Tool use or strict JSON mode for extraction.** Never `JSON.parse` raw model text. The Anthropic SDK's tool-use input is the only acceptable path.
2. **Retry-with-error-feedback loop**, capped at 3 attempts. Validation errors from the schema are sent back to the model as a user message. Every attempt is logged to the DB.
3. **Prompt caching** with `cache_control: { type: "ephemeral" }` on the system prompt and few-shot block. Verify by surfacing `cache_read_input_tokens` in the run summary and dashboard.
4. **Concurrency control** — semaphore of 5 with backoff on 429. Never `Promise.all` over all cases. Document the 429 strategy in `NOTES.md`.
5. **Resumable runs.** Killing the server mid-run and resuming must continue from the last completed case with no double LLM calls. There must be a test for this.
6. **Per-field metrics matched to field type.** Exact, numeric-tolerant, fuzzy, set-F1 — used appropriately. A single "fuzzy match everything" implementation fails the requirement.
7. **Hallucination detection** with a documented method, even a simple one (substring/fuzzy-substring grounding check).
8. **Compare view** with per-field deltas and a clear winner per field. This is the most important UI screen.
9. **At least 8 tests** covering: schema-retry, fuzzy med match, set-F1, hallucination positive + negative, resumability, idempotency, rate-limit backoff (mock the SDK), prompt-hash stability.
10. **API key never reaches the browser.** Web app talks only to Hono. Only Hono talks to Anthropic.
11. **Don't modify `data/gold/*.json` or `data/schema.json`.** You may add transcripts.
12. **Synthetic data only.** No real PHI in fixtures.

---

## Tech decisions (locked)

- **Runtime / package manager**: Bun + Bun workspaces + Turborepo (already in repo).
- **LLM**: Anthropic SDK, model `claude-haiku-4-5-20251001`.
- **Fuzzy string matching**: `fastest-levenshtein` for the raw distance primitive. Build a small `tokenSetRatio(a, b)` helper on top of it: lowercase, strip punctuation, tokenize on whitespace, compute ratio over sorted token intersections/differences. Threshold 0.85 unless a metric specifies otherwise.
- **Optional**: `double-metaphone` for medication name matching as a secondary signal (only if you have time and the simple fuzzy fails on real cases).
- **Validation**: Zod schemas in `packages/shared` mirroring `data/schema.json`. Use `zod-to-json-schema` to derive the Anthropic tool input schema from the same Zod source — single source of truth.
- **DB**: Postgres + Drizzle (already in `packages/db`). Extend the schema; do not start over.
- **Web**: Next 16 client-only (already scaffolded in `apps/web`). Tailwind defaults are fine. Do not over-design.
- **Test runner**: whatever's already in `package.json` scripts. Do not introduce a new one.
- **Postgres**: developer runs Postgres locally via Docker. Read `DATABASE_URL` from env; never hardcode.

---

## Repository conventions

- **Path discipline**: server-only code in `apps/server`, browser-safe types in `packages/shared`, LLM logic in `packages/llm`. Never import from `apps/server` into `apps/web` or vice versa — go through `packages/shared`.
- **No new top-level packages** without checking `turbo.json` and the root `package.json` workspaces config first.
- **Env vars**: load through `packages/env` (Zod-validated). Adding a new env var means adding it to the env schema, not just `process.env.X`.
- **Exports**: every package has a clean `index.ts` barrel. No deep imports across package boundaries.
- **Comments**: only where the *why* isn't obvious. No restating what the code does.
- **Logging**: use whatever logger the server already has. If none, `console.log` with a structured prefix is fine — don't pull in pino mid-project.

---

## Phases

Each phase is one autonomous session. Do all of it, then stop and summarize.

### Phase 0 — Recon (developer does this; you confirm)

Before your first session, the developer has run `bun install`, started Postgres, and confirmed `bun run dev` boots both apps. Your first action in Phase 1 is to verify this still works (`bun run dev`, kill it, proceed) so you fail fast if the environment broke.

### Phase 1 — Foundations

- Create `packages/shared` with: Zod schemas mirroring `data/schema.json` (extraction output), DTOs (`Run`, `CaseResult`, `Attempt`, `Metrics`, `RunSummary`, `Strategy = 'zero_shot' | 'few_shot' | 'cot'`), and exported TS types. Wire it into the workspace.
- Extend `packages/db` schema with: `runs`, `case_results`, `attempts`, `metrics_per_field`. Columns on `runs`: id, strategy, model, prompt_hash, status (`pending|running|done|failed|paused`), input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, started_at, finished_at, error. Columns on `case_results`: id, run_id, transcript_id, status, prediction (jsonb), gold (jsonb), scores (jsonb), hallucination_count, schema_failed (bool). `attempts`: case_result_id, attempt_no, request (jsonb), response (jsonb), validation_errors (jsonb), tokens (jsonb).
- Add a unique index on `case_results (strategy_hash, transcript_id)` where `strategy_hash` is a derived column or composite — this is what idempotency keys against. Pick whichever shape is cleaner with Drizzle and document it.
- Generate and apply the migration. Verify with `psql` that the tables exist.
- Build `apps/server/src/services/dataset.service.ts`: `listCases()`, `getCase(id)`. Validates each gold file against the Zod schema on load and throws loudly if any are malformed (don't modify them — surface the error).
- **Phase exit**: `bun run db:push` succeeds, `bun run dev` still boots, types compile across all packages.

### Phase 2 — `packages/llm`

- New workspace package. Single public entrypoint: `extract(transcript: string, strategy: Strategy, opts?: { signal?: AbortSignal }) => Promise<ExtractResult>`.
- `ExtractResult` includes: the validated extraction (or null on terminal failure), all attempts with their request/response/validation_errors, token counts including cache stats, the prompt hash used, and total wall time.
- **Strategies as modules**: `strategies/zero_shot.ts`, `strategies/few_shot.ts`, `strategies/cot.ts`. Each exports `{ id, system, userTemplate, examples? }`. They must be **meaningfully different**:
  - `zero_shot`: terse system prompt, just the schema and "extract".
  - `few_shot`: 2–3 hand-written transcript→JSON exemplars in the cached block.
  - `cot`: same as zero-shot's system, but the user message asks the model to think step-by-step in a `<scratchpad>` before calling the tool. (The tool call is still the only structured output.)
- Anthropic call uses `tool_choice: { type: "tool", name: "extract_clinical_data" }`. The tool's `input_schema` is derived from the Zod extraction schema via `zod-to-json-schema`.
- **Caching**: `system` and the `examples` block (when present) get `cache_control: { type: "ephemeral" }`. Surface `cache_read_input_tokens` and `cache_creation_input_tokens` from the response.
- **Retry loop**: validate the tool input with Zod. On fail, append `{ role: "user", content: "Your previous output failed validation: <errors>. Please correct and call the tool again." }` and retry. Cap at 3 attempts. Persist every attempt.
- **Prompt hash**: SHA-256 of the canonicalized JSON `{ id, system, examples ?? null, userTemplate }`. Stable across runs. Exported as `getPromptHash(strategy)`.
- **Cost calc**: per-token pricing constants for Haiku 4.5, exposed as `estimateCost({ input, output, cache_read, cache_write })`. Use the official Anthropic pricing — pull from their docs, don't make it up.
- **Phase exit**: a one-shot script `bun run packages/llm/scripts/smoke.ts` calls `extract` once on a sample transcript and prints the result. It works.

### Phase 3 — Evaluator

- `packages/llm/src/metrics/` (or `apps/server/src/services/metrics/` — pick one and be consistent), pure functions, easily unit-testable:
  - `chiefComplaint.ts` — token-set ratio after normalization. Returns `[0, 1]`.
  - `vitals.ts` — per-subfield exact with tolerance: `temp_f` ±0.2, `hr` ±2, `spo2` ±1. `bp` parsed as `systolic/diastolic` then exact. Average across present subfields. Nulls in gold mean "not extractable" — predictions of null match.
  - `medications.ts` — set F1. Match predicate: name token-set-ratio ≥ 0.85 AND normalized dose equal AND normalized frequency equal. Build a small synonym map for frequency: `BID↔twice daily↔q12h`, `TID↔three times daily↔q8h`, `QD↔once daily↔daily`, `QID↔four times daily↔q6h`, `PRN↔as needed`. Dose normalization: lowercase, strip whitespace between number and unit, normalize `mcg↔µg`.
  - `diagnoses.ts` — set F1 by description token-set ratio. ICD-10 match adds a 0.1 bonus (capped at 1.0).
  - `plan.ts` — set F1 over plan items, token-set ratio ≥ 0.80 (slightly looser; plan items are paraphrased more).
  - `followUp.ts` — exact on `interval_days`, fuzzy on `reason`. Return composite `[0, 1]`.
- `apps/server/src/services/evaluate.service.ts` — orchestrates: takes `(prediction, gold, transcript)`, runs all metrics, runs the grounding check, returns per-field scores + hallucination flags + schema_failed flag.
- **Grounding check**: for every scalar value in the prediction, normalize it (lowercase, strip punctuation) and check whether it appears as a substring or has a fuzzy substring match (≥0.85 against any token window of comparable length) in the normalized transcript. Anything not grounded → hallucination flag with `{ field_path, value, reason }`.
- **Phase exit**: tests for at least the medication matcher, set-F1, and grounding (positive + negative) all pass.

### Phase 4 — Runner

- `apps/server/src/services/runner.service.ts`. Public surface: `startRun({ strategy, model, dataset_filter?, force? })`, `resumeRun(id)`, `getRun(id)`, an SSE event emitter.
- **Concurrency**: hand-rolled `Semaphore` class with `acquire()`/`release()`. Limit 5. Don't pull a library.
- **429 handling**: catch the SDK's rate-limit error, exponential backoff with jitter, respect `retry-after` header if present. Document the exact strategy in `NOTES.md` later.
- **Resume**: on `startRun`, write the run row + one `case_results` row per case with `status='pending'`. Workers pick `pending` cases. On `resumeRun`, just rerun the same loop — already-`done` cases are skipped.
- **Idempotency**: before any LLM call, check if a `case_results` row exists for `(strategy, model, prompt_hash, transcript_id)` with `status='done'`. If yes and `force` is false, copy the result instead of re-calling.
- **SSE**: `GET /api/v1/runs/:id/events` emits `case_completed` (with case id + scores) and `run_completed`. Use Hono's streaming response.
- **Routes**: `POST /api/v1/runs`, `GET /api/v1/runs`, `GET /api/v1/runs/:id` (includes case_results + aggregate scores), `POST /api/v1/runs/:id/resume`, the SSE endpoint.
- **Phase exit**: hit `POST /api/v1/runs` with curl, watch SSE, kill server mid-run, restart, hit resume, watch it complete. Manual smoke + the resumability test pass.

### Phase 5 — CLI

- `apps/server/src/cli/eval.ts`, wired to `bun run eval` in the root `package.json`.
- Args: `--strategy`, `--model` (default Haiku), `--limit` (for dev), `--force`.
- Calls the runner directly (no HTTP). Prints a progress line per case, then a final summary table: per-field aggregate F1, hallucination rate, schema-fail rate, total cost, wall time.
- Writes `results/<run_id>.json` with the full run dump.
- **Phase exit**: `bun run eval -- --strategy=zero_shot --limit=3` runs end-to-end and prints the table.

### Phase 6 — Dashboard

Three pages. Tailwind defaults. Functional over pretty, but the compare view gets real polish.

- **`/runs`** — table of all runs from `GET /api/v1/runs`. Columns: started_at, strategy, model, status, aggregate F1, cost, duration. Click → run detail.
- **`/runs/[id]`** — header with run summary (cache hit rate prominent — this is required to be visible). Table of cases with per-case scores. Click a case row → drawer/modal with three panels:
  - Transcript with grounded spans highlighted in green, ungrounded predicted values in red.
  - Side-by-side gold vs. predicted JSON with a field-level diff. `react-diff-viewer-continued` is fine, or hand-roll if it's faster.
  - Attempts trace: collapsible cards, one per retry attempt, showing request/response/validation errors.
- **`/compare?a=<id>&b=<id>`** — the most important screen. Show per-field aggregate scores for both runs as paired bars. Per-field delta with a "Run A wins" / "Run B wins" / "tie" badge. Below: a list of cases ranked by absolute score difference, so the developer can see *which cases* drove the win. If both runs are different strategies, label them by strategy; if same strategy different models, label by model.
- **No client-side API key.** All Anthropic calls happen server-side; the web app fetches from Hono only.
- **Phase exit**: all three pages render, the SSE stream from a running eval updates the run-detail page live.

### Phase 7 — Tests (≥8)

Use the test runner already in the repo. Required tests:

1. Schema-retry path: mock SDK to return invalid extraction once, then valid. Assert 2 attempts, final result valid, both attempts persisted.
2. Fuzzy med match: `BID` ↔ `twice daily`, `10mg` ↔ `10 mg`, `tylenol` ↔ `Tylenol` all match; `tylenol 10mg BID` vs. `tylenol 20mg BID` does not.
3. Set-F1 correctness on a tiny synthetic case (3 gold, 2 predicted, 1 overlap → P=0.5, R=0.33, F1≈0.4).
4. Hallucination positive: prediction contains a med not in transcript → flagged.
5. Hallucination negative: prediction contains a med that's in transcript with slight casing/spacing differences → not flagged.
6. Resumability: start a run, crash it after 2 cases (mock the runner to throw), resume, assert all cases complete and no case has more than expected attempts.
7. Idempotency: call `startRun` twice with same params, assert the LLM mock was called only the first time.
8. Rate-limit backoff: mock SDK to throw 429 twice then succeed, assert the call retried and total elapsed respects backoff.
9. Prompt-hash stability: same strategy → same hash across calls; mutating one character of the system prompt → different hash.

### Phase 8 — Polish, stretch, ship

Run all three strategies on all 50 cases. Verify total cost < $1. If yes:

- **Stretch goals** (in priority order, do as time allows):
  1. **Cost guardrail**: `startRun` estimates cost from token counts before any LLM call; refuses if over a configurable cap (env var `COST_CAP_USD`, default 1.50). Easiest stretch — do this first.
  2. **Active-learning hint**: in the compare view, surface the top 5 cases with highest disagreement between strategies.
  3. **Prompt diff view**: show the textual diff between two runs' prompts and which cases regressed.
  4. **Second model**: add Sonnet 4.6 as a runnable model so compare also works cross-model.
- Fill `NOTES.md` with: results table for the three strategies, per-field winner breakdown, what surprised you, what you'd build next, what you cut, exact 429 handling strategy.
- Verify `bun install && bun run eval -- --strategy=zero_shot` works on a clean clone (do this in a fresh directory).
- Push to private repo, grant access.

---

## Things that will trip you up

- **Don't `JSON.parse` model text.** Even once, even for debugging. Use the tool-use input. There's a real risk you'll write `JSON.parse` in the retry loop "just to log it" and forget to remove it.
- **Cache control belongs on the *content blocks***, not on the message. Re-read the SDK docs if unsure. The first run won't show `cache_read_input_tokens` — that's expected; it shows up on the second identical request.
- **Drizzle migrations**: every schema change needs `bun run db:generate` (or whatever the script is) + `bun run db:push`. Don't edit migrations by hand.
- **`Promise.all` is the wrong tool** for the runner. The semaphore exists for a reason — the developer is grading on this.
- **Idempotency key**: `(strategy, model, prompt_hash, transcript_id)`. All four. Forgetting `prompt_hash` means changing the prompt won't trigger a re-run.
- **Few-shot examples count toward cache.** Put them in the cached block, not in the user message.
- **The compare view is graded heavily.** Don't ship two columns of numbers and call it done.
- **Don't over-engineer the UI.** Tailwind defaults. The brief explicitly says a pretty UI is not what they want.
- **Synthetic data only in tests.** No real-looking patient names, no real ICD codes copy-pasted from real charts.

---

## When to stop and ask

Ask the developer (don't guess) if:

- The existing repo code conflicts with anything in this file.
- A schema decision (DB or extraction) has two reasonable shapes and you can't tell which the brief prefers.
- A test would require modifying gold data to pass.
- You're about to add a dependency not mentioned in this file.
- Phase budget is blowing past 2x estimate.

Otherwise, decide and document the decision in `NOTES.md`. The developer would rather see your reasoning than be pinged on every small call.

---

## End-of-phase checklist

Before declaring a phase done:

- [ ] Code compiles (`tsc --noEmit` across workspaces).
- [ ] Tests pass (only relevant phase's tests; full suite at end of Phase 7).
- [ ] No unused exports, no dead files.
- [ ] No new dependencies beyond what's listed in this file (or, if needed, documented in `NOTES.md` with reasoning).
- [ ] `bun run dev` still boots both apps.
- [ ] Summary written: what built, what skipped, what unsure, commands run to verify.
