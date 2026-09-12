import { db } from './client';
import { materials, markupRules } from './schema';
import { generateId } from '../utils/id';
import { DEFAULT_MARKUP_RULES } from '../pricing/defaultMarkupRules';

const SEED_MATERIALS = [
  { code: 'argent_rhodie_925', name: 'Argent Rhodié 925', purity: '925' },
  { code: 'argent_925', name: 'Argent 925', purity: '925' },
  { code: 'argent_800', name: 'Argent 800', purity: '800' },
] as const;

/** Idempotent: safe to call on every app start. */
export async function seedDatabase(): Promise<void> {
  const now = new Date().toISOString();

  for (const [index, material] of SEED_MATERIALS.entries()) {
    await db
      .insert(materials)
      .values({
        id: generateId(),
        code: material.code,
        name: material.name,
        purity: material.purity,
        sortOrder: index,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: materials.code });
  }

  const existingRules = await db.select().from(markupRules).limit(1);
  if (existingRules.length > 0) return;

  for (const rule of DEFAULT_MARKUP_RULES) {
    await db.insert(markupRules).values({
      id: generateId(),
      materialId: rule.materialId,
      minWeightMg: rule.minWeightMg,
      maxWeightMg: Number.isFinite(rule.maxWeightMg) ? rule.maxWeightMg : Number.MAX_SAFE_INTEGER,
      markupBps: rule.markupBps,
      effectiveFrom: rule.effectiveFrom,
      createdAt: now,
      updatedAt: now,
    });
  }
}
