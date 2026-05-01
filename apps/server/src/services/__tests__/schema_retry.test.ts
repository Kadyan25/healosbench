/**
 * Test 1: Schema-retry path
 * Mock SDK to return invalid extraction once, then valid.
 * Assert 2 attempts, final result valid, both attempts persisted.
 */
import { describe, it, expect, mock } from "bun:test";
import { db } from "@healosbench/db";
import { runs, caseResults, attempts } from "@healosbench/db/schema/eval";
import { eq } from "drizzle-orm";

let callCount = 0;

mock.module("@healosbench/llm", () => ({
  getPromptHash: () => "retry-hash",
  estimateCost: () => 0,
  STRATEGIES: { zero_shot: { id: "zero_shot", system: "s", userTemplate: "{{TRANSCRIPT}}" } },
  extract: mock(async () => {
    callCount++;
    // First call: extraction is null (schema failed), with 2 attempts in log
    if (callCount === 1) {
      return {
        extraction: null,
        attempts: [
          { request: {}, response: {}, validation_errors: ["chief_complaint: Required"], tokens: { input_tokens: 50, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } },
          { request: {}, response: {}, validation_errors: null, tokens: { input_tokens: 50, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } },
        ],
        tokens: { input_tokens: 100, output_tokens: 30, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        promptHash: "retry-hash",
        wallTimeMs: 10,
      };
    }
    return {
      extraction: {
        chief_complaint: "headache",
        vitals: { bp: null, hr: null, temp_f: null, spo2: null },
        medications: [],
        diagnoses: [],
        plan: [],
        follow_up: { interval_days: null, reason: null },
      },
      attempts: [
        { request: {}, response: {}, validation_errors: null, tokens: { input_tokens: 50, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } },
      ],
      tokens: { input_tokens: 50, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      promptHash: "retry-hash",
      wallTimeMs: 5,
    };
  }),
}));

const { startRun } = await import("../runner.service.js");

describe("Schema-retry path", () => {
  it("persists both attempts when first attempt fails validation", async () => {
    callCount = 0;

    // Clean slate
    await db.delete(attempts as any);
    await db.delete(caseResults);
    await db.delete(runs);

    // First run: extract returns null (schema failed)
    const { run_id } = await startRun({ strategy: "zero_shot", model: "t", limit: 1 });
    await new Promise((r) => setTimeout(r, 800));

    const cr = await db.query.caseResults.findFirst({ where: eq(caseResults.run_id, run_id) });
    expect(cr).toBeDefined();
    // schema_failed should be true because extraction was null
    expect(cr?.schema_failed).toBe(true);

    const attemptRows = await db.query.attempts.findMany({
      where: eq(attempts.case_result_id, cr!.id),
    });
    // Both attempts from the null result should be logged
    expect(attemptRows.length).toBe(2);
    // First attempt has validation errors
    expect(attemptRows[0]?.validation_errors).not.toBeNull();
  });
});
