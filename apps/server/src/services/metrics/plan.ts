import { tokenSetRatio, computeSetF1 } from "./utils.js";
import type { FieldScore } from "@healosbench/shared";

function matchPlanItem(p: string, g: string): boolean {
  return tokenSetRatio(p, g) >= 0.80;
}

export function evaluatePlan(prediction: string[], gold: string[]): FieldScore {
  const score = computeSetF1(prediction, gold, matchPlanItem);
  return {
    score,
    details: {
      prediction,
      gold
    }
  };
}
