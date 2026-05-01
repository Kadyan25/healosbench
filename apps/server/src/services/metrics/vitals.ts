import type { Vitals, FieldScore } from "@healosbench/shared";

function parseBp(bp: string | null): { sys: number; dia: number } | null {
  if (!bp) return null;
  const parts = bp.split("/");
  if (parts.length !== 2) return null;
  const sys = parseInt(parts[0]!, 10);
  const dia = parseInt(parts[1]!, 10);
  if (isNaN(sys) || isNaN(dia)) return null;
  return { sys, dia };
}

export function evaluateVitals(prediction: Vitals, gold: Vitals): FieldScore {
  let matchedCount = 0;
  let totalCount = 0;
  const subScores: Record<string, number> = {};

  // temp_f ±0.2
  if (gold.temp_f !== null) {
    totalCount++;
    if (prediction.temp_f !== null && Math.abs(prediction.temp_f - gold.temp_f) <= 0.2) {
      matchedCount++;
      subScores.temp_f = 1;
    } else {
      subScores.temp_f = 0;
    }
  } else if (prediction.temp_f === null) {
    // Both null -> no effect on totalCount, but matching is implicit
  } else {
    // predicted present but gold is null -> penalty
    totalCount++;
    subScores.temp_f = 0;
  }

  // hr ±2
  if (gold.hr !== null) {
    totalCount++;
    if (prediction.hr !== null && Math.abs(prediction.hr - gold.hr) <= 2) {
      matchedCount++;
      subScores.hr = 1;
    } else {
      subScores.hr = 0;
    }
  } else if (prediction.hr !== null) {
    totalCount++;
    subScores.hr = 0;
  }

  // spo2 ±1
  if (gold.spo2 !== null) {
    totalCount++;
    if (prediction.spo2 !== null && Math.abs(prediction.spo2 - gold.spo2) <= 1) {
      matchedCount++;
      subScores.spo2 = 1;
    } else {
      subScores.spo2 = 0;
    }
  } else if (prediction.spo2 !== null) {
    totalCount++;
    subScores.spo2 = 0;
  }

  // bp exact
  if (gold.bp !== null) {
    totalCount++;
    const gBp = parseBp(gold.bp);
    const pBp = parseBp(prediction.bp);
    if (gBp && pBp && gBp.sys === pBp.sys && gBp.dia === pBp.dia) {
      matchedCount++;
      subScores.bp = 1;
    } else {
      subScores.bp = 0;
    }
  } else if (prediction.bp !== null) {
    totalCount++;
    subScores.bp = 0;
  }

  const score = totalCount === 0 ? 1.0 : matchedCount / totalCount;

  return {
    score,
    details: subScores,
  };
}
