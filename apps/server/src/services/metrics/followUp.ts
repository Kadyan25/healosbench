import { tokenSetRatio } from "./utils.js";
import type { FollowUp, FieldScore } from "@healosbench/shared";

export function evaluateFollowUp(prediction: FollowUp, gold: FollowUp): FieldScore {
  let intervalScore = 0;
  if (prediction.interval_days === gold.interval_days) {
    intervalScore = 1;
  }

  let reasonScore = 0;
  if (!prediction.reason && !gold.reason) {
    reasonScore = 1;
  } else if (prediction.reason && gold.reason) {
    reasonScore = tokenSetRatio(prediction.reason, gold.reason);
  } else {
    reasonScore = 0;
  }

  const score = (intervalScore + reasonScore) / 2;

  return {
    score,
    details: {
      intervalScore,
      reasonScore,
      prediction,
      gold
    }
  };
}
