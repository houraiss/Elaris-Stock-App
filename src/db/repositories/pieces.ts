import { and, asc, desc, eq, inArray, type SQL } from 'drizzle-orm';
import { db } from '../client';
import { pieces, type ItemType, type Piece, type VariantType } from '../schema/pieces';
import { variants, type Variant } from '../schema/variants';
import { materials } from '../schema/materials';
import { piecePhotos } from '../schema/piecePhotos';
import { generateId } from '../../utils/id';
import { getStockLevels, type StockLevel } from './stock';

export interface NewVariantInput {
  label: string; // '52', '54', '45cm', or 'default'
  nominalWeightMg: number;
  costCentimes: number;
  priceCentimes: number;
  barcode?: string | null;
}

export interface NewPieceInput {
  name: string;
  category: string;
  materialId: string;
  itemType: ItemType;
  variantType: VariantType;
  notes?: string | null;
  variants: NewVariantInput[]; // at least one
}

export interface PieceSummary extends Piece {
  materialName: string;
  materialCode: string;
  variantCount: number;
  totalOnHand: number;
  totalCommitted: number;
  totalAvailable: number;
  primaryPhotoUri: string | null;
}

export interface VariantWithStock extends Variant {
  stock: StockLevel;
}

export interface PieceDetail extends Piece {
  materialName: string;
  materialCode: string;
  variants: VariantWithStock[];
  photoUris: string[];
}

export interface CreatedPiece {
  piece: Piece;
  variants: Variant[];
}

/** A piece always has at least one variant; a unique piece has exactly one. */
export async function createPieceWithVariants(input: NewPieceInput): Promise<CreatedPiece> {
  if (input.variants.length === 0) {
    throw new Error('A piece must have at least one variant');
  }
  if (input.itemType === 'unique' && input.variants.length !== 1) {
    throw new Error('A unique piece must have exactly one variant');
  }

  const now = new Date().toISOString();
  const pieceId = generateId();

  return db.transaction(async (tx) => {
    await tx.insert(pieces).values({
      id: pieceId,
      name: input.name,
      category: input.category,
      materialId: input.materialId,
      itemType: input.itemType,
      variantType: input.variantType,
      defaultCostCentimes: input.variants[0].costCentimes,
      notes: input.notes ?? null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    const createdVariants: Variant[] = [];
    for (const v of input.variants) {
      const variantId = generateId();
      await tx.insert(variants).values({
        id: variantId,
        pieceId,
        label: v.label,
        barcode: v.barcode ?? null,
        nominalWeightMg: v.nominalWeightMg,
        costCentimes: v.costCentimes,
        priceCentimes: v.priceCentimes,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      const [createdVariant] = await tx.select().from(variants).where(eq(variants.id, variantId));
      createdVariants.push(createdVariant);
    }

    const [created] = await tx.select().from(pieces).where(eq(pieces.id, pieceId));
    return { piece: created, variants: createdVariants };
  });
}

export interface UpdatePieceInput {
  name?: string;
  category?: string;
  materialId?: string;
  notes?: string | null;
}

export async function updatePiece(pieceId: string, input: UpdatePieceInput): Promise<void> {
  const patch: Partial<Piece> = { updatedAt: new Date().toISOString() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.category !== undefined) patch.category = input.category;
  if (input.materialId !== undefined) patch.materialId = input.materialId;
  if (input.notes !== undefined) patch.notes = input.notes;
  await db.update(pieces).set(patch).where(eq(pieces.id, pieceId));
}

export interface UpdateVariantInput {
  label?: string;
  nominalWeightMg?: number;
  costCentimes?: number;
  priceCentimes?: number;
}

export async function updateVariant(variantId: string, input: UpdateVariantInput): Promise<void> {
  if (input.nominalWeightMg !== undefined && input.nominalWeightMg <= 0) {
    throw new Error('Weight must be greater than zero');
  }
  if (input.costCentimes !== undefined && input.costCentimes <= 0) {
    throw new Error('Cost must be greater than zero');
  }
  if (input.priceCentimes !== undefined && input.priceCentimes <= 0) {
    throw new Error('Price must be greater than zero');
  }

  const patch: Partial<Variant> = { updatedAt: new Date().toISOString() };
  if (input.label !== undefined) patch.label = input.label;
  if (input.nominalWeightMg !== undefined) patch.nominalWeightMg = input.nominalWeightMg;
  if (input.costCentimes !== undefined) patch.costCentimes = input.costCentimes;
  if (input.priceCentimes !== undefined) patch.priceCentimes = input.priceCentimes;
  await db.update(variants).set(patch).where(eq(variants.id, variantId));
}

export async function addVariant(pieceId: string, input: NewVariantInput): Promise<Variant> {
  const now = new Date().toISOString();
  const id = generateId();
  await db.insert(variants).values({
    id,
    pieceId,
    label: input.label,
    barcode: input.barcode ?? null,
    nominalWeightMg: input.nominalWeightMg,
    costCentimes: input.costCentimes,
    priceCentimes: input.priceCentimes,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
  const [created] = await db.select().from(variants).where(eq(variants.id, id));
  return created;
}

export interface ListPiecesFilters {
  materialId?: string;
  category?: string;
  includeInactive?: boolean;
}

export async function listPieces(filters: ListPiecesFilters = {}): Promise<PieceSummary[]> {
  const conditions: SQL[] = [];
  if (!filters.includeInactive) conditions.push(eq(pieces.isActive, true));
  if (filters.materialId) conditions.push(eq(pieces.materialId, filters.materialId));
  if (filters.category) conditions.push(eq(pieces.category, filters.category));

  const rows = await db
    .select({ piece: pieces, materialName: materials.name, materialCode: materials.code })
    .from(pieces)
    .innerJoin(materials, eq(pieces.materialId, materials.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(pieces.createdAt));

  if (rows.length === 0) return [];

  const pieceIds = rows.map((r) => r.piece.id);

  const variantRows = await db
    .select()
    .from(variants)
    .where(and(inArray(variants.pieceId, pieceIds), eq(variants.isActive, true)));

  const variantsByPiece = new Map<string, Variant[]>();
  for (const v of variantRows) {
    const list = variantsByPiece.get(v.pieceId) ?? [];
    list.push(v);
    variantsByPiece.set(v.pieceId, list);
  }

  const stockLevels = await getStockLevels(variantRows.map((v) => v.id));

  const photoRows = await db
    .select()
    .from(piecePhotos)
    .where(and(inArray(piecePhotos.pieceId, pieceIds), eq(piecePhotos.isPrimary, true)));
  const primaryPhotoByPiece = new Map(photoRows.map((p) => [p.pieceId, p.uri]));

  const summaries: PieceSummary[] = [];
  for (const row of rows) {
    const pieceVariants = variantsByPiece.get(row.piece.id) ?? [];
    let totalOnHand = 0;
    let totalCommitted = 0;
    let totalAvailable = 0;
    for (const v of pieceVariants) {
      const level = stockLevels.get(v.id);
      if (level) {
        totalOnHand += level.onHand;
        totalCommitted += level.committed;
        totalAvailable += level.available;
      }
    }

    // Unique pieces leave the active list once sold (on hand reaches zero) —
    // section 5.1. Models stay listed even at zero stock, ready to restock.
    const isSoldOutUnique = row.piece.itemType === 'unique' && totalOnHand <= 0;
    if (isSoldOutUnique && !filters.includeInactive) continue;

    summaries.push({
      ...row.piece,
      materialName: row.materialName,
      materialCode: row.materialCode,
      variantCount: pieceVariants.length,
      totalOnHand,
      totalCommitted,
      totalAvailable,
      primaryPhotoUri: primaryPhotoByPiece.get(row.piece.id) ?? null,
    });
  }
  return summaries;
}

export async function getPieceDetail(pieceId: string): Promise<PieceDetail | null> {
  const [row] = await db
    .select({ piece: pieces, materialName: materials.name, materialCode: materials.code })
    .from(pieces)
    .innerJoin(materials, eq(pieces.materialId, materials.id))
    .where(eq(pieces.id, pieceId));

  if (!row) return null;

  const variantRows = await db
    .select()
    .from(variants)
    .where(eq(variants.pieceId, pieceId))
    .orderBy(asc(variants.label));

  const stockLevels = await getStockLevels(variantRows.map((v) => v.id));

  const photoRows = await db
    .select()
    .from(piecePhotos)
    .where(eq(piecePhotos.pieceId, pieceId))
    .orderBy(desc(piecePhotos.isPrimary));

  return {
    ...row.piece,
    materialName: row.materialName,
    materialCode: row.materialCode,
    variants: variantRows.map((v) => ({
      ...v,
      stock: stockLevels.get(v.id) ?? { variantId: v.id, onHand: 0, committed: 0, available: 0 },
    })),
    photoUris: photoRows.map((p) => p.uri),
  };
}

export async function listCategories(): Promise<string[]> {
  const rows = await db.selectDistinct({ category: pieces.category }).from(pieces);
  return rows.map((r) => r.category).sort();
}
