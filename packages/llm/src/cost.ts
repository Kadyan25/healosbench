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
