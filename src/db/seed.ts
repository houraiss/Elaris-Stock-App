import { db } from './client';
import { materials, markupRules } from './schema';
import type { MaterialPlating } from './schema/materials';
import { generateId } from '../utils/id';
import { DEFAULT_MARKUP_RULES } from '../pricing/defaultMarkupRules';

// Two purity tiers, each with its plain form plus its plating sub-types:
// 925 -> normal, rhodium-plated ("Rhodié"); 800 -> normal, chrome-plated
// ("argent chromé"), gold-plated ("argent doré"). `name` is the French
// fallback stored in the DB; the UI resolves the localized label from
// `code` via the `material.<code>` i18n keys (see materialName.ts).
const SEED_MATERIALS = [
  { code: 'argent_925', name: 'Argent 925', purity: '925', plating: 'none' },
  { code: 'argent_rhodie_925', name: 'Argent Rhodié 925', purity: '925', plating: 'rhodium' },
  { code: 'argent_800', name: 'Argent 800', purity: '800', plating: 'none' },
  { code: 'argent_800_chrome', name: 'Argent 800 Chromé', purity: '800', plating: 'chrome' },
  { code: 'argent_800_dore', name: 'Argent 800 Doré', purity: '800', plating: 'gold' },
] satisfies ReadonlyArray<{ code: string; name: string; purity: string; plating: MaterialPlating }>;

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
        plating: material.plating,
        sortOrder: index,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: materials.code,
        set: { name: material.name, purity: material.purity, plating: material.plating, sortOrder: index, updatedAt: now },
      });
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
