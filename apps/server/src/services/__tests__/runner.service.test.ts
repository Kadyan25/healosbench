import { describe, it, expect, mock, beforeEach } from "bun:test";
import { startRun, resumeRun } from "../runner.service.js";
import { db } from "@healosbench/db";
import { runs, caseResults } from "@healosbench/db/schema/eval";
import { eq } from "drizzle-orm";


// Mock the DB minimally for the runner tests if needed, or rely on an in-memory test DB.
// For now, since Drizzle integrates directly, we will mock the LLM extractor.

import { extract } from "@healosbench/llm";

mock.module("@healosbench/llm", () => {
  return {
    getPromptHash: () => "mock-hash",
    STRATEGIES: {
      zero_shot: {},
    },
    extract: mock(async (_transcript: string, _strategy: string) => {
      // We will override this implementation per test using extract.mockImplementationOnce
      return {
        extraction: {
          chief_complaint: "test",
          vitals: {},
          medications: [],
          diagnoses: [],
          plan: [],
          follow_up: { interval_days: null, reason: null },
        },
        attempts: [],
        tokens: { input: 10, output: 10 },
      };
    }),
  };
});

describe("Runner Service", () => {
  beforeEach(async () => {
    await db.delete(runs);
    await db.delete(caseResults);
    (extract as import("bun:test").Mock<any>).mockClear();
  });

  it("handles idempotency correctly", async () => {
    // start run 1
    await startRun({ strategy: "zero_shot", model: "test-model", limit: 1 });
    
    // Give it time to finish background task
    await new Promise((res) => setTimeout(res, 500));
    
    const count1 = (extract as import("bun:test").Mock<any>).mock.calls.length;
    expect(count1).toBe(1);

    // start run 2 (same strategy)
    await startRun({ strategy: "zero_shot", model: "test-model", limit: 1 });
    
    await new Promise((res) => setTimeout(res, 500));
    
    // Should NOT have incremented because of idempotency
    const count2 = (extract as import("bun:test").Mock<any>).mock.calls.length;
    expect(count2).toBe(1);
    
    // Force flag should bypass idempotency
    await startRun({ strategy: "zero_shot", model: "test-model", limit: 1, force: true });
    await new Promise((res) => setTimeout(res, 500));
    const count3 = (extract as import("bun:test").Mock<any>).mock.calls.length;
    expect(count3).toBe(2);
  });

  it("handles 429 backoff gracefully", async () => {
    (extract as import("bun:test").Mock<any>).mockImplementationOnce(async () => {
      const err: any = new Error("Rate limit exceeded");
      err.status = 429;
      err.headers = { "retry-after": "0" }; // fast retry for tests
      throw err;
    });
    
    await startRun({ strategy: "zero_shot", model: "test-model", limit: 1 });
    
    await new Promise((res) => setTimeout(res, 500));
    
    const count = (extract as import("bun:test").Mock<any>).mock.calls.length;
    expect(count).toBe(2); // It threw 429 once, then retried and succeeded so called twice
  });

  it("resumes crashed runs", async () => {
    // This is hard to test deterministically without a real dataset mock.
    // Assuming 'listCases' gives us at least 1 item.
    // We will just verify `resumeRun` changes status back to running
    
    const { run_id } = await startRun({ strategy: "zero_shot", model: "test-model", limit: 1 });
    await new Promise((res) => setTimeout(res, 500));
    
    // forcefully set status to failed
    await db.update(runs).set({ status: "failed" }).where(eq(runs.id, run_id));
    
    await resumeRun(run_id);
    
    const run = await db.query.runs.findFirst({ where: eq(runs.id, run_id) });
    expect(run?.status).toBe("done"); // Because it finishes immediately as background task
  });
});
