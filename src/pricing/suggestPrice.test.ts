import { suggestPrice } from './suggestPrice';
import { DEFAULT_MARKUP_RULES } from './defaultMarkupRules';
import type { MarkupRule } from './types';

const DATE = '2026-01-01T00:00:00.000Z';

describe('suggestPrice — weight band boundaries (default rules)', () => {
  // cost = 20000 centimes chosen so every band's raw price is already an
  // exact multiple of 1000 centimes, isolating band selection from rounding.
  const cost = 20_000;

  it.each([
    [4_999, 30_000], // under 5g -> 50%
    [5_000, 29_000], // exactly 5g -> 45% (lower bound inclusive)
    [9_999, 29_000], // just under 10g -> 45%
    [10_000, 27_000], // exactly 10g -> 35%
    [19_999, 27_000], // just under 20g -> 35%
    [20_000, 26_000], // exactly 20g -> 30%
    [50_000, 26_000], // well over 20g -> 30%
  ])('weight %dmg suggests %d centimes', (weightMg, expected) => {
    expect(suggestPrice(cost, weightMg, null, DATE)).toBe(expected);
  });
});

describe('suggestPrice — rounding to nearest 10 MAD', () => {
  // A zero-markup rule makes the raw price equal to cost, isolating rounding.
  const zeroMarkupRule: MarkupRule = {
    id: 'test-zero-markup',
    materialId: null,
    minWeightMg: 0,
    maxWeightMg: Infinity,
    markupBps: 0,
    effectiveFrom: '1970-01-01T00:00:00.000Z',
  };

  it.each([
    [12_344, 12_000], // rounds down
    [12_345, 12_000], // rounds down
    [12_499, 12_000], // rounds down, just under the half
    [12_500, 13_000], // exact half rounds up
    [13_000, 13_000], // exact multiple, unchanged
    [13_500, 14_000], // exact half rounds up
  ])('cost %d centimes rounds to %d centimes', (costCentimes, expected) => {
    expect(suggestPrice(costCentimes, 1_000, null, DATE, [zeroMarkupRule])).toBe(expected);
  });
});

describe('suggestPrice — material-specific overrides', () => {
  const rulesWithOverride: MarkupRule[] = [
    ...DEFAULT_MARKUP_RULES,
    {
      id: 'argent800-under-5g',
      materialId: 'argent_800',
      minWeightMg: 0,
      maxWeightMg: 5_000,
      markupBps: 4_000, // 40%, overrides the generic 50% for this material
      effectiveFrom: '1970-01-01T00:00:00.000Z',
    },
  ];

  it('prefers a material-specific rule over the generic one', () => {
    expect(suggestPrice(20_000, 3_000, 'argent_800', DATE, rulesWithOverride)).toBe(28_000);
  });

  it('falls back to the generic rule for other materials', () => {
    expect(suggestPrice(20_000, 3_000, 'argent_925', DATE, rulesWithOverride)).toBe(30_000);
  });
});

describe('suggestPrice — dated rule history', () => {
  // Appending a new dated rule must not require deleting the old one.
  const historicalRules: MarkupRule[] = [
    {
      id: 'under-5g-v1',
      materialId: null,
      minWeightMg: 0,
      maxWeightMg: 5_000,
      markupBps: 5_000,
      effectiveFrom: '2020-01-01T00:00:00.000Z',
    },
    {
      id: 'under-5g-v2',
      materialId: null,
      minWeightMg: 0,
      maxWeightMg: 5_000,
      markupBps: 5_500,
      effectiveFrom: '2025-06-01T00:00:00.000Z',
    },
  ];

  it('uses the rule in effect at the given date', () => {
    expect(
      suggestPrice(20_000, 3_000, null, '2024-01-01T00:00:00.000Z', historicalRules),
    ).toBe(30_000);
  });

  it('picks up a newer rule once it takes effect', () => {
    expect(
      suggestPrice(20_000, 3_000, null, '2025-12-01T00:00:00.000Z', historicalRules),
    ).toBe(31_000);
  });

  it('throws when no rule is yet effective at the given date', () => {
    expect(() =>
      suggestPrice(20_000, 3_000, null, '2019-01-01T00:00:00.000Z', historicalRules),
    ).toThrow(/No markup rule covers/);
  });
});

describe('suggestPrice — no coverage', () => {
  it('throws when no rule matches the weight at all', () => {
    expect(() => suggestPrice(20_000, 3_000, null, DATE, [])).toThrow(/No markup rule covers/);
  });
});
