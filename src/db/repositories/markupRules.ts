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

export interface MarkupRuleGroup {
  key: string;
  materialId: string | null;
  materialName: string | null;
  minWeightMg: number;
  maxWeightMg: number;
  active: MarkupRuleWithMaterial;
  history: MarkupRuleWithMaterial[]; // superseded rows, newest first
}

/**
 * Groups rules by (material, weight band) and picks the one currently in
 * effect per group — shared by Settings (editing) and Insights (comparing
 * realised markup against what the rule table currently expects).
 */
export function groupMarkupRules(rules: MarkupRuleWithMaterial[]): MarkupRuleGroup[] {
  const groups = new Map<string, MarkupRuleWithMaterial[]>();
  for (const rule of rules) {
    const key = `${rule.materialId ?? 'all'}|${rule.minWeightMg}|${rule.maxWeightMg}`;
    const list = groups.get(key) ?? [];
    list.push(rule);
    groups.set(key, list);
  }

  const today = new Date().toISOString();
  const result: MarkupRuleGroup[] = [];
  for (const [key, list] of groups) {
    const sorted = [...list].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));
    const active = sorted.find((r) => r.effectiveFrom <= today) ?? sorted[sorted.length - 1];
    result.push({
      key,
      materialId: active.materialId,
      materialName: active.materialName,
      minWeightMg: active.minWeightMg,
      maxWeightMg: active.maxWeightMg,
      active,
      history: sorted.filter((r) => r.id !== active.id),
    });
  }
  return result.sort((a, b) => a.minWeightMg - b.minWeightMg);
}

export async function listActiveMarkupBands(): Promise<MarkupRuleGroup[]> {
  return groupMarkupRules(await listMarkupRules());
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
