import { createHash } from "crypto";
import type { Strategy } from "@healosbench/shared";

interface StrategyDefinition {
  id: Strategy;
  system: string;
  userTemplate?: string;
  examples?: Array<{ transcript: string; extraction: any }>;
}

/**
 * Returns a stable SHA-256 hash of the strategy's canonical representation.
 * Any change to the system prompt, user template, or examples will change the hash.
 */
export function getPromptHash(strategy: StrategyDefinition): string {
  const payload = {
    id: strategy.id,
    system: strategy.system,
    examples: strategy.examples ?? null,
    userTemplate: strategy.userTemplate ?? null,
  };
  
  const canonicalString = JSON.stringify(payload);
  return createHash("sha256").update(canonicalString).digest("hex");
}
