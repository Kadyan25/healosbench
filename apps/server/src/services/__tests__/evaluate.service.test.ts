import { describe, it, expect } from "bun:test";
import { evaluateCase } from "../evaluate.service.js";
import type { ClinicalExtraction } from "@healosbench/shared";

describe("Evaluate Service", () => {
  const getBaseExtraction = (): ClinicalExtraction => ({
    chief_complaint: "headache",
    vitals: { bp: null, hr: null, temp_f: null, spo2: null },
    medications: [],
    diagnoses: [],
    plan: [],
    follow_up: { interval_days: null, reason: null },
  });

  it("does not flag hallucinations when values are in transcript", () => {
    const transcript = "The patient came in complaining of a severe headache.";
    const gold = getBaseExtraction();
    const predicted = getBaseExtraction();
    predicted.chief_complaint = "severe headache";

    const res = evaluateCase(predicted, gold, transcript);
    expect(res.hallucination_flags).toHaveLength(0);
  });

  it("flags hallucination when medication name is absent from transcript", () => {
    const transcript = "The patient came in complaining of a severe headache.";
    const gold = getBaseExtraction();
    const predicted = getBaseExtraction();
    predicted.chief_complaint = "severe headache";
    predicted.medications = [{ name: "Tylenol", dose: "500 mg", frequency: "daily", route: "PO" }];

    const res = evaluateCase(predicted, gold, transcript);
    // Only medication name is grounding-checked; dose/frequency/route are excluded
    // (normalized forms legitimately differ from transcript wording)
    expect(res.hallucination_flags).toHaveLength(1);
    expect(res.hallucination_flags[0]!.value).toBe("Tylenol");
  });

  it("handles fuzzy negative (slight variations should not flag)", () => {
    const transcript = "Patient is taking acetaminophen 500mg once a day.";
    const gold = getBaseExtraction();
    const predicted = getBaseExtraction();
    predicted.chief_complaint = "";
    predicted.medications = [{ name: "acetaminophen", dose: "500 mg", frequency: "daily", route: "PO" }];

    const res = evaluateCase(predicted, gold, transcript);
    console.log("FAILING FLAGS:", res.hallucination_flags);
    expect(res.hallucination_flags).toHaveLength(0); // 500mg -> 500 mg should be fuzzy matched or normalized
  });
});
