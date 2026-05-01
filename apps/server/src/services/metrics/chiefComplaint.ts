import { tokenSetRatio } from "./utils.js";
import type { FieldScore } from "@healosbench/shared";

export function evaluateChiefComplaint(prediction: string, gold: string): FieldScore {
  const score = tokenSetRatio(prediction, gold);
  return {
    score,
    details: {
      prediction,
      gold,
    },
  };
}
