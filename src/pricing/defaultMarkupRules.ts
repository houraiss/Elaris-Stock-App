import type { MarkupRule } from './types';

/**
 * Seeded defaults from section 2 of the implementation plan, editable in
 * Settings. material_id is null: these bands apply to every material until
 * overridden. Only the two outer anchors (under 5g -> 50%, over 20g -> 30%)
 * come from the business; the 5-10g and 10-20g bands are interpolated and
 * should be corrected once weighed against real pieces.
 */
export const DEFAULT_MARKUP_RULES: MarkupRule[] = [
  {
    id: 'default-under-5g',
    materialId: null,
    minWeightMg: 0,
    maxWeightMg: 5_000,
    markupBps: 5_000,
    effectiveFrom: '1970-01-01T00:00:00.000Z',
  },
  {
    id: 'default-5-10g',
    materialId: null,
    minWeightMg: 5_000,
    maxWeightMg: 10_000,
    markupBps: 4_500,
    effectiveFrom: '1970-01-01T00:00:00.000Z',
  },
  {
    id: 'default-10-20g',
    materialId: null,
    minWeightMg: 10_000,
    maxWeightMg: 20_000,
    markupBps: 3_500,
    effectiveFrom: '1970-01-01T00:00:00.000Z',
  },
  {
    id: 'default-over-20g',
    materialId: null,
    minWeightMg: 20_000,
    maxWeightMg: Infinity,
    markupBps: 3_000,
    effectiveFrom: '1970-01-01T00:00:00.000Z',
  },
];
