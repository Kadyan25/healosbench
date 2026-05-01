import { describe, it, expect, mock, beforeEach, afterAll } from "bun:test";
import { db } from "@healosbench/db";
import { runs, caseResults } from "@healosbench/db/schema/eval";
import { eq } from "drizzle-orm";

// --- Mock @healosbench/llm before importing runner ---
const mockExtract = mock(async () => ({
  extraction: {
    chief_complaint: "test complaint",
    vitals: { bp: null, hr: null, temp_f: null, spo2: null },
    medications: [],
    diagnoses: [],
    plan: ["rest"],
    follow_up: { interval_days: null, reason: null },
  },
  attempts: [
    {
      request: {},
      response: {},
      validation_errors: null,
      tokens: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    },
  ],
  tokens: {
    input_tokens: 100,
    output_tokens: 50,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  },
  promptHash: "mock-hash",
  wallTimeMs: 10,
}));

mock.module("@healosbench/llm", () => ({
  getPromptHash: () => "mock-prompt-hash",
  estimateCost: () => 0.0001,
  STRATEGIES: { zero_shot: { id: "zero_shot", system: "test", userTemplate: "{{TRANSCRIPT}}" } },
  extract: mockExtract,
}));

// Import after mock
const { startRun, resumeRun } = await import("../runner.service.js");

async function cleanDb() {
  await db.delete(caseResults);
  await db.delete(runs);
  mockExtract.mockClear();
}

// Restore default implementation
function setDefaultMock() {
  mockExtract.mockImplementation(async () => ({
    extraction: {
      chief_complaint: "test complaint",
      vitals: { bp: null, hr: null, temp_f: null, spo2: null },
      medications: [],
      diagnoses: [],
      plan: ["rest"],
      follow_up: { interval_days: null, reason: null },
    },
    attempts: [{ request: {}, response: {}, validation_errors: null, tokens: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } }],
    tokens: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    promptHash: "mock-hash",
    wallTimeMs: 10,
  }));
}

function wait(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

// ===== Test 7: Idempotency =====
describe("Idempotency", () => {
  beforeEach(async () => { await cleanDb(); setDefaultMock(); });

  it("does not re-call LLM on second run with same params (force=false)", async () => {
    await startRun({ strategy: "zero_shot", model: "test-model", limit: 1 });
    await wait(800);
    const firstCount = mockExtract.mock.calls.length;
    expect(firstCount).toBe(1);

    // Second run same strategy — should copy, not re-call
    await startRun({ strategy: "zero_shot", model: "test-model", limit: 1 });
    await wait(800);
    expect(mockExtract.mock.calls.length).toBe(1); // still 1
  });

  it("re-calls LLM when force=true", async () => {
    await startRun({ strategy: "zero_shot", model: "test-model", limit: 1 });
    await wait(800);
    expect(mockExtract.mock.calls.length).toBe(1);

    await startRun({ strategy: "zero_shot", model: "test-model", limit: 1, force: true });
    await wait(800);
    expect(mockExtract.mock.calls.length).toBe(2);
  });
});

// ===== Test 8: Rate-limit backoff =====
describe("Rate-limit backoff", () => {
  beforeEach(async () => { await cleanDb(); setDefaultMock(); });

  it("retries after 429 and succeeds on second call", async () => {
    let callCount = 0;
    mockExtract.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        const err: any = new Error("rate limited");
        err.status = 429;
        err.headers = { "retry-after": "0" };
        throw err;
      }
      return {
        extraction: { chief_complaint: "x", vitals: { bp: null, hr: null, temp_f: null, spo2: null }, medications: [], diagnoses: [], plan: [], follow_up: { interval_days: null, reason: null } },
        attempts: [],
        tokens: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        promptHash: "mock-hash",
        wallTimeMs: 5,
      };
    });

    await startRun({ strategy: "zero_shot", model: "test-model", limit: 1 });
    await wait(1200); // allow time for retry

    expect(callCount).toBe(2); // threw once, retried once
    // Case should be done not failed
    const allCases = await db.query.caseResults.findMany();
    expect(allCases.some((c) => c.status === "done")).toBe(true);
  });
});

// ===== Test 6: Resumability =====
describe("Resumability", () => {
  beforeEach(async () => { await cleanDb(); setDefaultMock(); });

  it("resumes from pending cases without double-calling done cases", async () => {
    const { run_id } = await startRun({ strategy: "zero_shot", model: "test-model", limit: 2 });
    await wait(1000);

    // Mark run as crashed, reset one case to pending
    await db.update(runs).set({ status: "failed" }).where(eq(runs.id, run_id));
    const cases = await db.query.caseResults.findMany({ where: eq(caseResults.run_id, run_id) });
    if (cases[0]) {
      await db.update(caseResults).set({ status: "pending" }).where(eq(caseResults.id, cases[0].id));
    }

    const callsBefore = mockExtract.mock.calls.length;

    await resumeRun(run_id);
    await wait(800);

    // Only the pending case should trigger a new call
    expect(mockExtract.mock.calls.length).toBe(callsBefore + 1);

    const run = await db.query.runs.findFirst({ where: eq(runs.id, run_id) });
    expect(run?.status).toBe("done");
  });
});

afterAll(async () => {
  await cleanDb();
});
