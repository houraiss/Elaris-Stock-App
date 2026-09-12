import { asc, eq } from 'drizzle-orm';
import { db } from '../client';
import { materials, type Material } from '../schema/materials';

export async function listActiveMaterials(): Promise<Material[]> {
  return db.select().from(materials).where(eq(materials.isActive, true)).orderBy(asc(materials.sortOrder));
}
