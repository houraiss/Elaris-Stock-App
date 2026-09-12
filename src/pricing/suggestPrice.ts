import type { MarkupRule } from './types';
import { DEFAULT_MARKUP_RULES } from './defaultMarkupRules';

const CENTIMES_PER_10_MAD = 1_000; // 10 MAD = 1000 centimes

function selectRule(
  rules: MarkupRule[],
  weightMg: number,
  materialId: string | null,
  date: string,
): MarkupRule | undefined {
  const candidates = rules.filter(
    (r) =>
      (r.materialId === null || r.materialId === materialId) &&
      weightMg >= r.minWeightMg &&
      weightMg < r.maxWeightMg &&
      r.effectiveFrom <= date,
  );

  if (candidates.length === 0) return undefined;

  // A material-specific rule always beats a generic (null) one; among rules
  // of the same specificity, the most recently effective one wins, so a
  // newly appended dated override takes over without deleting history.
  return candidates.reduce((best, candidate) => {
    const candidateIsSpecific = candidate.materialId !== null;
    const bestIsSpecific = best.materialId !== null;
    if (candidateIsSpecific !== bestIsSpecific) {
      return candidateIsSpecific ? candidate : best;
    }
    return candidate.effectiveFrom > best.effectiveFrom ? candidate : best;
  });
}

function roundToNearest10Mad(centimes: number): number {
  return Math.round(centimes / CENTIMES_PER_10_MAD) * CENTIMES_PER_10_MAD;
}

/**
 * Suggests a retail price from wholesale cost, weight and material, per the
 * cost-plus markup model in section 2 of the plan. Always editable at the
 * till; this is a starting point, not the final price.
 */
export function suggestPrice(
  costCentimes: number,
  weightMg: number,
  materialId: string | null,
  date: string,
  rules: MarkupRule[] = DEFAULT_MARKUP_RULES,
): number {
  const rule = selectRule(rules, weightMg, materialId, date);
  if (!rule) {
    throw new Error(
      `No markup rule covers weight=${weightMg}mg material=${materialId ?? 'any'} as of ${date}`,
    );
  }
  const rawPriceCentimes = Math.round(costCentimes * (1 + rule.markupBps / 10_000));
  return roundToNearest10Mad(rawPriceCentimes);
}
