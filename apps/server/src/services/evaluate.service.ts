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

function checkGrounding(value: string, transcriptNorm: string): boolean {
  if (!value) return true;
  const valNorm = normalizeText(value);
  if (!valNorm) return true;

  if (transcriptNorm.includes(valNorm)) {
    return true;
  }

  // Fuzzy substring match (>=0.85) against token windows
  const valTokens = valNorm.split(" ");
  const transTokens = transcriptNorm.split(" ");
  const windowSize = valTokens.length;

  for (let i = 0; i <= transTokens.length - windowSize; i++) {
    const windowText = transTokens.slice(i, i + windowSize).join(" ");
    const dist = distance(valNorm, windowText);
    const maxLen = Math.max(valNorm.length, windowText.length);
    const ratio = 1 - dist / maxLen;
    if (ratio >= 0.85) {
      return true;
    }
  }

  // Fallback: strip all spaces to handle "500 mg" vs "500mg"
  const strippedVal = valNorm.replace(/\s+/g, "");
  const strippedTrans = transcriptNorm.replace(/\s+/g, "");
  if (strippedTrans.includes(strippedVal)) {
    return true;
  }

  // The spec says >= 0.85 against any token window of comparable length.
  return false;
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

  // Check scalar fields for grounding
  if (!checkGrounding(prediction.chief_complaint, transcriptNorm)) {
    hallucination_flags.push({
      field_path: "chief_complaint",
      value: prediction.chief_complaint,
      reason: "Not found in transcript",
    });
  }

  for (let i = 0; i < prediction.medications.length; i++) {
    const med = prediction.medications[i]!;
    if (!checkGrounding(med.name, transcriptNorm)) {
      hallucination_flags.push({
        field_path: `medications[${i}].name`,
        value: med.name,
        reason: "Medication name not found in transcript",
      });
    }
    if (med.dose && !checkGrounding(med.dose, transcriptNorm)) {
      hallucination_flags.push({
        field_path: `medications[${i}].dose`,
        value: med.dose,
        reason: "Medication dose not found in transcript",
      });
    }
  }

  for (let i = 0; i < prediction.diagnoses.length; i++) {
    const diag = prediction.diagnoses[i]!;
    if (!checkGrounding(diag.description, transcriptNorm)) {
      hallucination_flags.push({
        field_path: `diagnoses[${i}].description`,
        value: diag.description,
        reason: "Diagnosis description not found in transcript",
      });
    }
  }

  for (let i = 0; i < prediction.plan.length; i++) {
    const item = prediction.plan[i]!;
    if (!checkGrounding(item, transcriptNorm)) {
      hallucination_flags.push({
        field_path: `plan[${i}]`,
        value: item,
        reason: "Plan item not found in transcript",
      });
    }
  }

  if (prediction.follow_up.reason && !checkGrounding(prediction.follow_up.reason, transcriptNorm)) {
    hallucination_flags.push({
      field_path: "follow_up.reason",
      value: prediction.follow_up.reason,
      reason: "Follow-up reason not found in transcript",
    });
  }

  return {
    scores,
    hallucination_flags,
  };
}
