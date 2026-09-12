import { and, eq, like, or } from 'drizzle-orm';
import { db } from '../client';
import { stockMovements } from '../schema/stockMovements';
import { variants, type Variant } from '../schema/variants';
import { pieces, type Piece } from '../schema/pieces';
import { materials } from '../schema/materials';
import { generateId } from '../../utils/id';
import {
  addVariant,
  createPieceWithVariants,
  type NewPieceInput,
  type NewVariantInput,
  type CreatedPiece,
} from './pieces';
import { getStockLevel, type StockLevel } from './stock';

export interface PieceSearchResult extends Piece {
  materialName: string;
}

/** For attaching a new size/variant to an existing piece (e.g. restocking a ring in a new size). */
export async function searchPieces(query: string): Promise<PieceSearchResult[]> {
  const term = query.trim();
  if (term.length === 0) return [];

  const rows = await db
    .select({ piece: pieces, materialName: materials.name })
    .from(pieces)
    .innerJoin(materials, eq(pieces.materialId, materials.id))
    .where(and(eq(pieces.isActive, true), like(pieces.name, `%${term}%`)))
    .limit(15);

  return rows.map((r) => ({ ...r.piece, materialName: r.materialName }));
}

export interface MatchedVariant {
  variant: Variant;
  piece: Piece;
  materialName: string;
  stock: StockLevel;
}

/** Tier 1 scan resolution: an exact barcode match against the catalogue. */
export async function findVariantByBarcode(barcode: string): Promise<MatchedVariant | null> {
  const [row] = await db
    .select({ variant: variants, piece: pieces, materialName: materials.name })
    .from(variants)
    .innerJoin(pieces, eq(variants.pieceId, pieces.id))
    .innerJoin(materials, eq(pieces.materialId, materials.id))
    .where(eq(variants.barcode, barcode));

  if (!row) return null;

  const stock = await getStockLevel(row.variant.id);
  return { variant: row.variant, piece: row.piece, materialName: row.materialName, stock };
}

/** Manual-mode fallback for restocking without a scan: search by piece name or SKU/barcode. */
export async function searchVariantsForRestock(query: string): Promise<MatchedVariant[]> {
  const term = `%${query.trim()}%`;
  if (query.trim().length === 0) return [];

  const rows = await db
    .select({ variant: variants, piece: pieces, materialName: materials.name })
    .from(variants)
    .innerJoin(pieces, eq(variants.pieceId, pieces.id))
    .innerJoin(materials, eq(pieces.materialId, materials.id))
    .where(or(like(pieces.name, term), like(variants.sku, term), like(variants.barcode, term)))
    .limit(20);

  const results: MatchedVariant[] = [];
  for (const row of rows) {
    const stock = await getStockLevel(row.variant.id);
    results.push({ variant: row.variant, piece: row.piece, materialName: row.materialName, stock });
  }
  return results;
}

export interface RestockInput {
  variantId: string;
  quantity: number;
  unitCostCentimes: number;
  priceCentimes?: number; // update the going-forward price at the same time, if changed
  weightMg?: number; // total weight for this delivery; defaults to nominal weight x quantity
}

/** Restocking an existing variant: writes the opening/replenishment purchase movement. */
export async function restockVariant(input: RestockInput): Promise<void> {
  if (input.quantity <= 0) {
    throw new Error('Quantity must be greater than zero');
  }
  const now = new Date().toISOString();

  const [variant] = await db.select().from(variants).where(eq(variants.id, input.variantId));
  if (!variant) {
    throw new Error('Variant not found');
  }

  const weightMg = input.weightMg ?? variant.nominalWeightMg * input.quantity;

  await db.transaction(async (tx) => {
    await tx.insert(stockMovements).values({
      id: generateId(),
      variantId: input.variantId,
      type: 'purchase',
      qtyDelta: input.quantity,
      weightMg,
      unitCostCentimes: input.unitCostCentimes,
      reason: 'stock_intake',
      occurredAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await tx
      .update(variants)
      .set({
        costCentimes: input.unitCostCentimes,
        priceCentimes: input.priceCentimes ?? variant.priceCentimes,
        updatedAt: now,
      })
      .where(eq(variants.id, input.variantId));
  });
}

export interface NewVariantIntakeInput extends NewVariantInput {
  quantity: number;
}

export interface NewPieceIntakeInput extends Omit<NewPieceInput, 'variants'> {
  variants: NewVariantIntakeInput[];
}

/** Bulk stock-intake path: create a brand-new piece/variant and its opening stock in one go. */
export async function createPieceWithOpeningStock(
  input: NewPieceIntakeInput,
): Promise<CreatedPiece> {
  const created = await createPieceWithVariants(input);
  const now = new Date().toISOString();

  for (let i = 0; i < created.variants.length; i++) {
    const variant = created.variants[i];
    const quantity = input.variants[i].quantity;
    if (quantity <= 0) continue;

    await db.insert(stockMovements).values({
      id: generateId(),
      variantId: variant.id,
      type: 'purchase',
      qtyDelta: quantity,
      weightMg: variant.nominalWeightMg * quantity,
      unitCostCentimes: variant.costCentimes,
      reason: 'stock_intake',
      occurredAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  return created;
}

export interface NewVariantOnExistingPieceInput extends NewVariantInput {
  quantity: number;
}

/** Attaches a new size/variant to an existing piece and writes its opening stock. */
export async function addVariantWithOpeningStock(
  pieceId: string,
  input: NewVariantOnExistingPieceInput,
): Promise<Variant> {
  const variant = await addVariant(pieceId, input);

  if (input.quantity > 0) {
    const now = new Date().toISOString();
    await db.insert(stockMovements).values({
      id: generateId(),
      variantId: variant.id,
      type: 'purchase',
      qtyDelta: input.quantity,
      weightMg: variant.nominalWeightMg * input.quantity,
      unitCostCentimes: variant.costCentimes,
      reason: 'stock_intake',
      occurredAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  return variant;
}
