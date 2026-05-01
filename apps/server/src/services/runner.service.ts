import { db } from "@healosbench/db";
import { runs, caseResults, attempts, metricsPerField } from "@healosbench/db/schema/eval";
import { extract, getPromptHash, STRATEGIES, estimateCost } from "@healosbench/llm";
import { eq, and, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { Semaphore } from "../utils/semaphore.js";
import { runEvents } from "../utils/events.js";
import { evaluateCase } from "./evaluate.service.js";
import { listCases } from "./dataset.service.js";
import type { Strategy } from "@healosbench/shared";
import { createHash } from "crypto";

export interface StartRunOpts {
  strategy: Strategy;
  model: string;
  limit?: number;
  force?: boolean;
}

// Global semaphore for concurrency control
const runnerSemaphore = new Semaphore(5);

function getStrategyHash(strategy: Strategy, model: string, promptHash: string): string {
  return createHash("sha256")
    .update(`${strategy}:${model}:${promptHash}`)
    .digest("hex");
}

async function processPendingCases(runId: string, force: boolean) {
  // Fetch the run and pending cases
  const run = await db.query.runs.findFirst({
    where: eq(runs.id, runId),
  });
  if (!run) return;

  const pendingCases = await db.query.caseResults.findMany({
    where: and(eq(caseResults.run_id, runId), eq(caseResults.status, "pending")),
  });

  const dataset = await listCases();
  const datasetMap = new Map(dataset.map((c) => [c.id, c]));

  for (const caseRow of pendingCases) {
    await runnerSemaphore.acquire();

    // Spawn async task, release semaphore when done
    (async () => {
      try {
        const goldCase = datasetMap.get(caseRow.transcript_id);
        if (!goldCase) throw new Error(`Missing gold data for transcript ${caseRow.transcript_id}`);

        // 1. Idempotency Check
        if (!force) {
          const existing = await db.query.caseResults.findFirst({
            where: and(
              eq(caseResults.strategy_hash, caseRow.strategy_hash),
              eq(caseResults.transcript_id, caseRow.transcript_id),
              eq(caseResults.status, "done")
            ),
          });

          if (existing) {
            // Copy result from existing
            await db
              .update(caseResults)
              .set({
                status: "done",
                prediction: existing.prediction,
                scores: existing.scores,
                hallucination_flags: existing.hallucination_flags,
                hallucination_count: existing.hallucination_count,
                schema_failed: existing.schema_failed,
                updated_at: new Date(),
              })
              .where(eq(caseResults.id, caseRow.id));

            runEvents.emit(`case_completed:${runId}`, {
              caseId: caseRow.id,
              status: "done (cached)",
            });
            return;
          }
        }

        // 2. Execute extraction with backoff for 429
        let result;
        let retries = 0;
        const maxRetries = 5;

        while (true) {
          try {
            result = await extract(goldCase.transcript, run.strategy as Strategy, { model: run.model });
            break;
          } catch (err: any) {
            if (err?.status === 429 && retries < maxRetries) {
              retries++;
              const retryAfter = err.headers?.["retry-after"]
                ? parseInt(err.headers["retry-after"], 10) * 1000
                : 1000 * Math.pow(2, retries) + Math.random() * 1000;
              await new Promise((res) => setTimeout(res, retryAfter));
              continue;
            }
            throw err;
          }
        }

        // Save attempts
        if (result.attempts && result.attempts.length > 0) {
          await db.insert(attempts).values(
            result.attempts.map((a, idx) => ({
              id: randomUUID(),
              case_result_id: caseRow.id,
              attempt_no: idx + 1,
              request: a.request,
              response: a.response,
              validation_errors: a.validation_errors,
              tokens: a.tokens,
            }))
          );
        }

        // Handle total failure
        if (!result.extraction) {
          await db
            .update(caseResults)
            .set({
              status: "failed",
              schema_failed: true,
              updated_at: new Date(),
            })
            .where(eq(caseResults.id, caseRow.id));
            
          runEvents.emit(`case_completed:${runId}`, {
            caseId: caseRow.id,
            status: "failed",
          });
          return;
        }

        // 3. Evaluate
        const evalResult = evaluateCase(result.extraction, goldCase.gold, goldCase.transcript);

        // Update case
        await db
          .update(caseResults)
          .set({
            status: "done",
            prediction: result.extraction,
            scores: evalResult.scores,
            hallucination_flags: evalResult.hallucination_flags,
            hallucination_count: evalResult.hallucination_flags.length,
            updated_at: new Date(),
          })
          .where(eq(caseResults.id, caseRow.id));

        // Insert metrics
        const metricsData = Object.entries(evalResult.scores).map(([field_name, metric]) => ({
          id: randomUUID(),
          case_result_id: caseRow.id,
          field_name,
          score: metric.score,
          details: metric.details,
        }));
        
        if (metricsData.length > 0) {
          await db.insert(metricsPerField).values(metricsData);
        }

        // Accumulate tokens on Run
        if (result.tokens) {
          const t = result.tokens;
          const addedCost = estimateCost(t);
          await db.execute(
            sql`UPDATE runs SET
              input_tokens = input_tokens + ${t.input_tokens},
              output_tokens = output_tokens + ${t.output_tokens},
              cache_read_tokens = cache_read_tokens + ${t.cache_read_input_tokens ?? 0},
              cache_write_tokens = cache_write_tokens + ${t.cache_creation_input_tokens ?? 0},
              cost_usd = cost_usd + ${addedCost}
            WHERE id = ${runId}`
          );
        }

        runEvents.emit(`case_completed:${runId}`, {
          caseId: caseRow.id,
          status: "done",
          scores: evalResult.scores,
        });
      } catch (err: any) {
        console.error("Error processing case:", err);
        await db
          .update(caseResults)
          .set({
            status: "failed",
            updated_at: new Date(),
          })
          .where(eq(caseResults.id, caseRow.id));

        runEvents.emit(`case_completed:${runId}`, {
          caseId: caseRow.id,
          status: "failed",
          error: err.message,
        });
      } finally {
        runnerSemaphore.release();
      }
    })();
  }

  // Await completion of all queued items
  // Since we don't `await` inside the loop (we just acquire the sem), 
  // we can just wait for all semaphores to be available again
  for (let i = 0; i < 5; i++) {
    await runnerSemaphore.acquire();
  }
  for (let i = 0; i < 5; i++) {
    runnerSemaphore.release();
  }

  // Check if all cases are done
  const allCases = await db.query.caseResults.findMany({
    where: eq(caseResults.run_id, runId),
  });
  
  const allFinished = allCases.every(c => c.status === "done" || c.status === "failed");
  if (allFinished) {
    await db
      .update(runs)
      .set({
        status: "done",
        finished_at: new Date(),
      })
      .where(eq(runs.id, runId));
      
    runEvents.emit(`run_completed:${runId}`, { runId });
  }
}

export async function startRun(opts: StartRunOpts): Promise<{ run_id: string }> {
  const runId = randomUUID();
  const promptHash = getPromptHash(STRATEGIES[opts.strategy]);
  const strategyHash = getStrategyHash(opts.strategy, opts.model, promptHash);

  await db.insert(runs).values({
    id: runId,
    strategy: opts.strategy,
    model: opts.model,
    prompt_hash: promptHash,
    status: "running",
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    cost_usd: "0",
  });

  const dataset = await listCases();
  const casesToRun = opts.limit ? dataset.slice(0, opts.limit) : dataset;

  await db.insert(caseResults).values(
    casesToRun.map((c) => ({
      id: randomUUID(),
      run_id: runId,
      transcript_id: c.id,
      strategy_hash: strategyHash,
      status: "pending",
      gold: c.gold,
    }))
  );

  // Start processing in background
  processPendingCases(runId, !!opts.force).catch(console.error);

  return { run_id: runId };
}

export async function resumeRun(runId: string): Promise<void> {
  const run = await db.query.runs.findFirst({
    where: eq(runs.id, runId),
  });
  if (!run) throw new Error("Run not found");

  await db
    .update(runs)
    .set({ status: "running" })
    .where(eq(runs.id, runId));

  processPendingCases(runId, false).catch(console.error);
}

export async function getRun(runId: string) {
  const run = await db.query.runs.findFirst({
    where: eq(runs.id, runId),
    with: {
      case_results: {
        with: {
          metrics: true,
          attempts: true,
        }
      }
    }
  });

  if (!run) throw new Error("Run not found");
  return run;
}

export async function listRuns() {
  return db.query.runs.findMany({
    orderBy: (runs, { desc }) => [desc(runs.started_at)],
  });
}
