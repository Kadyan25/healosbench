import { tokenSetRatio, computeSetF1 } from "./utils.js";
import type { Diagnosis, FieldScore } from "@healosbench/shared";

function matchDiagnosis(p: Diagnosis, g: Diagnosis): boolean {
  // We use this in a greedy approach inside computeSetF1
  // However, computeSetF1 returns boolean. We need fuzzy matching.
  // We'll calculate a continuous score and threshold it for F1.
  const ratio = tokenSetRatio(p.description, g.description);
  let score = ratio;
  if (p.icd10 && g.icd10 && p.icd10 === g.icd10) {
    score += 0.1;
  }
  score = Math.min(score, 1.0);
  return score >= 0.85;
}

export function evaluateDiagnoses(prediction: Diagnosis[], gold: Diagnosis[]): FieldScore {
  const score = computeSetF1(prediction, gold, matchDiagnosis);
  return {
    score,
    details: {
      prediction,
      gold
    }
  };
}
