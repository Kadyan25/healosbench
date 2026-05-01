import { describe, it, expect } from "bun:test";
import { evaluateMedications } from "../medications.js";
import type { Medication } from "@healosbench/shared";

describe("Medications Metric", () => {
  it("matches identical medications", () => {
    const gold: Medication[] = [{ name: "Tylenol", dose: "500 mg", frequency: "twice daily", route: "PO" }];
    const predicted: Medication[] = [{ name: "Tylenol", dose: "500mg", frequency: "twice daily", route: "PO" }];
    const res = evaluateMedications(predicted, gold);
    expect(res.score).toBe(1.0);
  });

  it("handles synonyms properly (BID vs twice daily)", () => {
    const gold: Medication[] = [{ name: "amoxicillin", dose: "875 mg", frequency: "twice daily", route: "PO" }];
    const predicted: Medication[] = [{ name: "amoxicillin", dose: "875mg", frequency: "BID", route: "PO" }];
    const res = evaluateMedications(predicted, gold);
    expect(res.score).toBe(1.0);
  });

  it("fails on different dose", () => {
    const gold: Medication[] = [{ name: "Tylenol", dose: "500 mg", frequency: "twice daily", route: "PO" }];
    const predicted: Medication[] = [{ name: "Tylenol", dose: "1000 mg", frequency: "twice daily", route: "PO" }];
    const res = evaluateMedications(predicted, gold);
    expect(res.score).toBe(0.0);
  });

  it("fuzzy matches slightly misspelled names", () => {
    const gold: Medication[] = [{ name: "acetaminophen", dose: "500 mg", frequency: "once daily", route: "PO" }];
    const predicted: Medication[] = [{ name: "actaminophen", dose: "500mg", frequency: "QD", route: "PO" }]; // actaminophen
    const res = evaluateMedications(predicted, gold);
    expect(res.score).toBe(1.0);
  });

  it("computes set-F1 correctly", () => {
    const gold: Medication[] = [
      { name: "A", dose: "1", frequency: "daily", route: "PO" },
      { name: "B", dose: "2", frequency: "daily", route: "PO" },
      { name: "C", dose: "3", frequency: "daily", route: "PO" },
    ];
    const predicted: Medication[] = [
      { name: "A", dose: "1", frequency: "daily", route: "PO" }, // Match
      { name: "B", dose: "100", frequency: "daily", route: "PO" }, // Mismatch dose
    ];
    
    // matches = 1
    // precision = 1 / 2 = 0.5
    // recall = 1 / 3 = 0.333
    // f1 = 2 * (0.5 * 0.333) / (0.5 + 0.333) = 0.4
    
    const res = evaluateMedications(predicted, gold);
    expect(res.score).toBeCloseTo(0.4);
  });
});
