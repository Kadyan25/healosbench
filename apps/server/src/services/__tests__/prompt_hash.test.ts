/**
 * Test 9: Prompt-hash stability
 * Same strategy → same hash. Mutating one character → different hash.
 */
import { describe, it, expect } from "bun:test";
import { getPromptHash } from "@healosbench/llm";

const BASE_STRATEGY = {
  id: "zero_shot" as const,
  system: "You are an expert clinical data extractor.",
  userTemplate: "Extract from: {{TRANSCRIPT}}",
  examples: undefined,
};

describe("Prompt hash stability", () => {
  it("produces the same hash for the same strategy on repeated calls", () => {
    const h1 = getPromptHash(BASE_STRATEGY);
    const h2 = getPromptHash(BASE_STRATEGY);
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64); // SHA-256 hex
  });

  it("produces a different hash when system prompt changes", () => {
    const h1 = getPromptHash(BASE_STRATEGY);
    const h2 = getPromptHash({ ...BASE_STRATEGY, system: BASE_STRATEGY.system + "X" });
    expect(h1).not.toBe(h2);
  });

  it("produces a different hash when userTemplate changes", () => {
    const h1 = getPromptHash(BASE_STRATEGY);
    const h2 = getPromptHash({ ...BASE_STRATEGY, userTemplate: "Different template {{TRANSCRIPT}}" });
    expect(h1).not.toBe(h2);
  });

  it("produces a different hash when examples are added", () => {
    const h1 = getPromptHash(BASE_STRATEGY);
    const h2 = getPromptHash({
      ...BASE_STRATEGY,
      examples: [{ transcript: "Patient has a headache.", extraction: { chief_complaint: "headache" } }],
    });
    expect(h1).not.toBe(h2);
  });
});
