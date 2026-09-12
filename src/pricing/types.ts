export interface MarkupRule {
  id: string;
  materialId: string | null; // null = applies to all materials
  minWeightMg: number; // inclusive
  maxWeightMg: number; // exclusive; use Infinity for an open-ended top band
  markupBps: number; // basis points: 100 = 1%, 5000 = 50%
  effectiveFrom: string; // ISO 8601
}
