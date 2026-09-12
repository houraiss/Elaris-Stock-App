import { asc, desc, eq } from 'drizzle-orm';
import { db } from '../client';
import { markupRules, type MarkupRuleRow } from '../schema/markupRules';
import { materials } from '../schema/materials';
import { generateId } from '../../utils/id';

export interface MarkupRuleWithMaterial extends MarkupRuleRow {
  materialName: string | null;
}

export async function listMarkupRules(): Promise<MarkupRuleWithMaterial[]> {
  const rows = await db
    .select({ rule: markupRules, materialName: materials.name })
    .from(markupRules)
    .leftJoin(materials, eq(markupRules.materialId, materials.id))
    .orderBy(asc(markupRules.minWeightMg), desc(markupRules.effectiveFrom));

  return rows.map((r) => ({ ...r.rule, materialName: r.materialName }));
}

export interface AppendMarkupRuleInput {
  materialId: string | null;
  minWeightMg: number;
  maxWeightMg: number; // Number.MAX_SAFE_INTEGER for an open-ended top band
  markupBps: number;
  effectiveFrom: string;
}

/**
 * Markup rules are never updated or deleted — Settings always appends a new
 * dated row, so past pricing stays reconstructable (section 9, session 6).
 */
export async function appendMarkupRule(input: AppendMarkupRuleInput): Promise<MarkupRuleRow> {
  const now = new Date().toISOString();
  const id = generateId();
  await db.insert(markupRules).values({
    id,
    materialId: input.materialId,
    minWeightMg: input.minWeightMg,
    maxWeightMg: input.maxWeightMg,
    markupBps: input.markupBps,
    effectiveFrom: input.effectiveFrom,
    createdAt: now,
    updatedAt: now,
  });
  const [created] = await db.select().from(markupRules).where(eq(markupRules.id, id));
  return created;
}
