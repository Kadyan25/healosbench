import { normalizeText, tokenSetRatio, computeSetF1 } from "./utils.js";
import type { Medication, FieldScore } from "@healosbench/shared";

const FREQ_SYNONYMS: Record<string, string> = {
  "bid": "twice daily",
  "q12h": "twice daily",
  "twice daily": "twice daily",
  "tid": "three times daily",
  "q8h": "three times daily",
  "three times daily": "three times daily",
  "qd": "once daily",
  "daily": "once daily",
  "once daily": "once daily",
  "qid": "four times daily",
  "q6h": "four times daily",
  "four times daily": "four times daily",
  "prn": "as needed",
  "as needed": "as needed"
};

function normalizeFrequency(freq: string | null): string | null {
  if (!freq) return null;
  const normalized = normalizeText(freq);
  return FREQ_SYNONYMS[normalized] || normalized;
}

function normalizeDose(dose: string | null): string | null {
  if (!dose) return null;
  let d = dose.toLowerCase().trim();
  d = d.replace(/\s+/g, ""); // strip whitespace between number and unit
  d = d.replace("mcg", "µg"); // normalize mcg to µg
  return d;
}

function matchMedication(p: Medication, g: Medication): boolean {
  const nameRatio = tokenSetRatio(p.name, g.name);
  if (nameRatio < 0.85) return false;

  const pDose = normalizeDose(p.dose);
  const gDose = normalizeDose(g.dose);
  if (pDose !== gDose) return false;

  const pFreq = normalizeFrequency(p.frequency);
  const gFreq = normalizeFrequency(g.frequency);
  if (pFreq !== gFreq) return false;

  // We could check route, but prompt only mandates name/dose/frequency.
  return true;
}

export function evaluateMedications(prediction: Medication[], gold: Medication[]): FieldScore {
  const score = computeSetF1(prediction, gold, matchMedication);
  return {
    score,
    details: {
      prediction,
      gold
    }
  };
}
