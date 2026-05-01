import type { ClinicalExtraction, HallucinationFlag, Metrics } from "@healosbench/shared";
import {
  evaluateChiefComplaint,
  evaluateVitals,
  evaluateMedications,
  evaluateDiagnoses,
  evaluatePlan,
  evaluateFollowUp,
  normalizeText,
} from "./metrics/index.js";
import { distance } from "fastest-levenshtein";

export interface EvaluationResult {
  scores: Metrics;
  hallucination_flags: HallucinationFlag[];
}

// Strict grounding: substring or fuzzy window match. Used for short atomic values (med names).
function checkGroundingStrict(value: string, transcriptNorm: string): boolean {
  if (!value) return true;
  const valNorm = normalizeText(value);
  if (!valNorm) return true;

  if (transcriptNorm.includes(valNorm)) return true;

  // Fallback: strip spaces to handle "500 mg" vs "500mg"
  const strippedVal = valNorm.replace(/\s+/g, "");
  const strippedTrans = transcriptNorm.replace(/\s+/g, "");
  if (strippedTrans.includes(strippedVal)) return true;

  // Fuzzy window match for short values
  const valTokens = valNorm.split(" ");
  const transTokens = transcriptNorm.split(" ");
  const windowSize = valTokens.length;
  for (let i = 0; i <= transTokens.length - windowSize; i++) {
    const windowText = transTokens.slice(i, i + windowSize).join(" ");
    const maxLen = Math.max(valNorm.length, windowText.length);
    if (maxLen === 0) continue;
    const ratio = 1 - distance(valNorm, windowText) / maxLen;
    if (ratio >= 0.85) return true;
  }

  return false;
}

// Common English stopwords to exclude from token coverage checks
const STOPWORDS = new Set([
  "a","an","the","and","or","but","in","on","at","to","for","of","with","by",
  "from","as","is","was","are","were","be","been","being","have","has","had",
  "do","does","did","will","would","could","should","may","might","shall","can",
  "its","it","this","that","these","those","not","no","nor",
]);

// Token-coverage grounding: used for paraphrased/synthesized fields (chief_complaint, plan, diagnoses).
// A value is grounded if >=50% of its non-stopword tokens each appear somewhere in the transcript.
// This tolerates paraphrase ("ibuprofen for fever" grounded even if transcript says "take ibuprofen as needed").
function checkGroundingTokenCoverage(value: string, transcriptNorm: string, threshold = 0.5): boolean {
  if (!value) return true;
  const valNorm = normalizeText(value);
  if (!valNorm) return true;

  const tokens = valNorm.split(" ").filter((t) => t.length > 2 && !STOPWORDS.has(t));
  if (tokens.length === 0) return true; // nothing meaningful to check

  const grounded = tokens.filter((t) => {
    // exact token presence
    if (transcriptNorm.includes(t)) return true;
    // fuzzy: any transcript token within edit distance 1 of this token
    const transTokens = transcriptNorm.split(" ");
    return transTokens.some((tt) => {
      const maxLen = Math.max(t.length, tt.length);
      return maxLen > 0 && 1 - distance(t, tt) / maxLen >= 0.85;
    });
  });

  return grounded.length / tokens.length >= threshold;
}

export function evaluateCase(
  prediction: ClinicalExtraction,
  gold: ClinicalExtraction,
  transcript: string
): EvaluationResult {
  const scores: Metrics = {
    chief_complaint: evaluateChiefComplaint(prediction.chief_complaint, gold.chief_complaint),
    vitals: evaluateVitals(prediction.vitals, gold.vitals),
    medications: evaluateMedications(prediction.medications, gold.medications),
    diagnoses: evaluateDiagnoses(prediction.diagnoses, gold.diagnoses),
    plan: evaluatePlan(prediction.plan, gold.plan),
    follow_up: evaluateFollowUp(prediction.follow_up, gold.follow_up),
  };

  const hallucination_flags: HallucinationFlag[] = [];
  const transcriptNorm = normalizeText(transcript);

  // Grounding check: only free-text fields where hallucination is meaningful.
  // Excluded: vitals (structured numeric), med.dose/frequency/route (normalized forms
  // legitimately differ from transcript), icd10 codes (model infers these), interval_days.

  // Grounding check strategy by field:
  // - medication names: strict (proper nouns must appear, modulo minor spelling variants)
  // - chief_complaint, diagnoses, plan, follow_up.reason: token-coverage (paraphrased fields;
  //   50% of significant tokens must be traceable to the transcript)
  // - vitals, med.dose/frequency/route, icd10, interval_days: not checked (normalized forms
  //   legitimately differ from transcript wording)

  if (!checkGroundingTokenCoverage(prediction.chief_complaint, transcriptNorm)) {
    hallucination_flags.push({
      field_path: "chief_complaint",
      value: prediction.chief_complaint,
      reason: "Key terms not found in transcript",
    });
  }

  for (let i = 0; i < prediction.medications.length; i++) {
    const med = prediction.medications[i]!;
    if (!checkGroundingStrict(med.name, transcriptNorm)) {
      hallucination_flags.push({
        field_path: `medications[${i}].name`,
        value: med.name,
        reason: "Medication name not found in transcript",
      });
    }
  }

  for (let i = 0; i < prediction.diagnoses.length; i++) {
    const diag = prediction.diagnoses[i]!;
    if (!checkGroundingTokenCoverage(diag.description, transcriptNorm)) {
      hallucination_flags.push({
        field_path: `diagnoses[${i}].description`,
        value: diag.description,
        reason: "Diagnosis key terms not found in transcript",
      });
    }
  }

  for (let i = 0; i < prediction.plan.length; i++) {
    const item = prediction.plan[i]!;
    if (!checkGroundingTokenCoverage(item, transcriptNorm)) {
      hallucination_flags.push({
        field_path: `plan[${i}]`,
        value: item,
        reason: "Plan item key terms not found in transcript",
      });
    }
  }

  if (prediction.follow_up.reason && !checkGroundingTokenCoverage(prediction.follow_up.reason, transcriptNorm)) {
    hallucination_flags.push({
      field_path: "follow_up.reason",
      value: prediction.follow_up.reason,
      reason: "Follow-up reason key terms not found in transcript",
    });
  }

  return {
    scores,
    hallucination_flags,
  };
}
