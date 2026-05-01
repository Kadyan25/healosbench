import { distance } from "fastest-levenshtein";

export function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function tokenize(text: string): string[] {
  return Array.from(new Set(normalizeText(text).split(" ").filter(Boolean))).sort();
}

/**
 * Computes a string similarity ratio in [0, 1]
 */
export function fuzzyRatio(a: string, b: string): number {
  if (!a && !b) return 1.0;
  if (!a || !b) return 0.0;
  const dist = distance(a, b);
  const maxLen = Math.max(a.length, b.length);
  return 1 - dist / maxLen;
}

/**
 * Computes a similarity ratio over sorted token intersections/differences.
 * Returns [0, 1].
 */
export function tokenSetRatio(a: string, b: string): number {
  if (!a && !b) return 1.0;
  if (!a || !b) return 0.0;

  const tokensA = tokenize(a);
  const tokensB = tokenize(b);

  const intersection = tokensA.filter(t => tokensB.includes(t));
  const restA = tokensA.filter(t => !tokensB.includes(t));
  const restB = tokensB.filter(t => !tokensA.includes(t));

  const t1 = intersection.join(" ");
  const t2 = intersection.concat(restA).join(" ");
  const t3 = intersection.concat(restB).join(" ");

  const r1 = fuzzyRatio(t1, t2);
  const r2 = fuzzyRatio(t1, t3);
  const r3 = fuzzyRatio(t2, t3);

  // If there's no intersection, t1 is empty, which could yield 0 with t2/t3.
  // We take the max of the three ratios.
  return Math.max(r1, r2, r3);
}

/**
 * Computes the F1 score for two sets of items given a match predicate.
 */
export function computeSetF1<T>(
  predicted: T[],
  gold: T[],
  matchPredicate: (p: T, g: T) => boolean
): number {
  if (predicted.length === 0 && gold.length === 0) return 1.0;
  if (predicted.length === 0 || gold.length === 0) return 0.0;

  let matches = 0;
  const matchedGold = new Set<number>();

  for (const p of predicted) {
    for (let i = 0; i < gold.length; i++) {
      if (!matchedGold.has(i) && matchPredicate(p, gold[i]!)) {
        matches++;
        matchedGold.add(i);
        break;
      }
    }
  }

  const precision = matches / predicted.length;
  const recall = matches / gold.length;

  if (precision + recall === 0) return 0.0;
  return (2 * precision * recall) / (precision + recall);
}
