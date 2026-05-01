import type { Strategy } from "@healosbench/shared";

/**
 * Cost calculation for Anthropic claude-haiku-4-5-20251001
 * Pricing per 1M tokens.
 */
export const HAIKU_4_5_PRICING = {
  input: 0.80,
  output: 4.00,
  cache_write: 1.00,
  cache_read: 0.08,
} as const;

export interface TokenCounts {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number | null;
  cache_read_input_tokens: number | null;
}

// Cached tokens per strategy: system prompt + optional examples block
const CACHED_TOKENS: Record<Strategy, number> = {
  zero_shot: 700,
  few_shot: 2700,
  cot: 700,
};

// Expected output tokens per call (tool JSON + optional scratchpad)
const OUTPUT_TOKENS: Record<Strategy, number> = {
  zero_shot: 400,
  few_shot: 400,
  cot: 700,
};

const AVG_TRANSCRIPT_TOKENS = 500;

export interface RunCostEstimate {
  low: number;
  mid: number;
  high: number;
}

export function estimateRunCost(opts: { caseCount: number; strategy: Strategy }): RunCostEstimate {
  const { caseCount, strategy } = opts;
  const cached = CACHED_TOKENS[strategy];
  const output = OUTPUT_TOKENS[strategy];

  const cacheWriteCost = (cached / 1_000_000) * HAIKU_4_5_PRICING.cache_write;
  const cacheReadCost = (cached / 1_000_000) * HAIKU_4_5_PRICING.cache_read * Math.max(0, caseCount - 1);
  const freshInputCost = (AVG_TRANSCRIPT_TOKENS / 1_000_000) * HAIKU_4_5_PRICING.input * caseCount;
  const outputCost = (output / 1_000_000) * HAIKU_4_5_PRICING.output * caseCount;

  const mid = cacheWriteCost + cacheReadCost + freshInputCost + outputCost;
  return { low: mid * 0.8, mid, high: mid * 1.3 };
}

export function estimateCost(tokens: TokenCounts): number {
  const {
    input_tokens,
    output_tokens,
    cache_creation_input_tokens,
    cache_read_input_tokens
  } = tokens;

  let totalUsd = 0;

  // Fresh input tokens that were not cached
  totalUsd += (input_tokens / 1_000_000) * HAIKU_4_5_PRICING.input;
  
  // Output tokens
  totalUsd += (output_tokens / 1_000_000) * HAIKU_4_5_PRICING.output;

  // Cache writes (first time seeing this prompt block)
  if (cache_creation_input_tokens) {
    totalUsd += (cache_creation_input_tokens / 1_000_000) * HAIKU_4_5_PRICING.cache_write;
  }

  // Cache reads
  if (cache_read_input_tokens) {
    totalUsd += (cache_read_input_tokens / 1_000_000) * HAIKU_4_5_PRICING.cache_read;
  }

  return totalUsd;
}
