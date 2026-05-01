# NOTES.md

## Results

Model: `claude-haiku-4-5-20251001`, 50 cases each.

| Strategy  | chief_complaint | vitals | medications | diagnoses | plan   | follow_up | overall F1 | cost    | halluc rate |
|-----------|-----------------|--------|-------------|-----------|--------|-----------|------------|---------|-------------|
| zero_shot | 0.7530          | 0.9592 | 0.5579      | 0.7619    | 0.6848 | 0.6675    | 0.7307     | $0.1400 | 98%         |
| few_shot  | 0.7260          | 0.9800 | 0.5297      | 0.8733    | 0.7550 | 0.7119    | 0.7626     | $0.1955 | 100%        |
| cot       | 0.7162          | 0.9796 | 0.5483      | 0.7946    | 0.6880 | 0.6838    | 0.7351     | $0.1419 | 98%         |

Total: $0.477.

## Per-field winner

few_shot wins 4 of 6 fields — clear on diagnoses, plan, follow_up. zero_shot edges it on chief_complaint. medications is basically a tie across all three (~0.53–0.56), none did great there.

| Field           | Winner    |
|-----------------|-----------|
| chief_complaint | zero_shot |
| vitals          | few_shot  |
| medications     | zero_shot |
| diagnoses       | few_shot  |
| plan            | few_shot  |
| follow_up       | few_shot  |

## 429 handling

Exponential backoff with jitter in `runner.service.ts`. On a 429:
1. Check `retry-after` header — wait that many seconds if present.
2. Otherwise: `2^retries * 1000ms + random(0–1000ms)`.
3. Max 5 retries then mark case failed.

The semaphore cap of 5 concurrent workers prevents most 429s from happening in the first place.

## What surprised me

Prompt caching never fired. The code has `cache_control: { type: "ephemeral" }` in the right place and we send the beta header, but `cache_creation_input_tokens` stayed 0 the whole time. Turns out Haiku 4.5 needs at least ~2048 tokens in the cached block — zero_shot and cot system prompts are only ~700, so they don't hit the threshold. few_shot examples block is around 2000 but apparently still not enough. The implementation is there, just needs bigger prompts.

Hallucination rate is 98–100% which looks alarming but is mostly the grounding check being conservative. Things like "500mg" in the prediction vs "500 mg" in the transcript get flagged. The space-stripping fallback handles most of these, but minor paraphrase still slips through. For a clinical tool I'd rather have false positives than miss real hallucinations.

few_shot is clearly better on structured list fields. The examples teach the model formatting conventions for plan items and diagnoses that it just doesn't figure out from a schema description alone.

The retry loop had a bug: when the model calls a tool and Zod validation fails, the next turn needs a `tool_result` block for that tool call or the API returns 400. The simple text error message approach works fine for the no-tool-call path but breaks in the more common case.

## What I cut

Prompt caching benefit — the code is wired up but zero_shot/cot prompts need to be padded past 2048 tokens to actually get cache hits. Given total cost came in at $0.48 it wasn't blocking.

Transcript highlighting in the case drawer. The hallucination flags panel shows the same info as text. Everything needed is already in the DB.

Active-learning cross-strategy view. The compare page sorts cases by score diff which is close, but doesn't compute variance across all three strategies at once.

## What I'd build next

Pad the system prompts past 2048 tokens — add a detailed field guide — to actually get cache hits. Would drop per-case cost significantly.

Transcript span highlighting. Data's already there, just needs a frontend renderer.

Second model via `--model=claude-sonnet-4-6`. Backend already accepts it as a free string, compare view would just work.

Smarter medication matching with phonetic lookup for drug name variants.
