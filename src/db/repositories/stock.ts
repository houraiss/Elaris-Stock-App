import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../client';
import { stockMovements } from '../schema/stockMovements';
import { saleItems } from '../schema/saleItems';
import { sales } from '../schema/sales';
import { reservations } from '../schema/reservations';

export interface StockLevel {
  variantId: string;
  onHand: number;
  committed: number;
  available: number;
}

const EMPTY_LEVEL = (variantId: string): StockLevel => ({
  variantId,
  onHand: 0,
  committed: 0,
  available: 0,
});

async function sumByVariant(
  variantIds: string[],
  query: (ids: string[]) => Promise<{ variantId: string; total: number }[]>,
): Promise<Map<string, number>> {
  if (variantIds.length === 0) return new Map();
  const rows = await query(variantIds);
  return new Map(rows.map((r) => [r.variantId, r.total]));
}

// On hand: sum of every stock_movements.qty_delta — what is physically in the shop.
function onHandFor(variantIds: string[]) {
  return sumByVariant(variantIds, (ids) =>
    db
      .select({
        variantId: stockMovements.variantId,
        total: sql<number>`coalesce(sum(${stockMovements.qtyDelta}), 0)`,
      })
      .from(stockMovements)
      .where(inArray(stockMovements.variantId, ids))
      .groupBy(stockMovements.variantId),
  );
}

// Committed (layaway): quantity inside open layaway sales, per section 5.3 —
// no stock movement exists yet, so this must be read from sale_items/sales.
function committedFromLayawayFor(variantIds: string[]) {
  return sumByVariant(variantIds, (ids) =>
    db
      .select({
        variantId: saleItems.variantId,
        total: sql<number>`coalesce(sum(${saleItems.qty}), 0)`,
      })
      .from(saleItems)
      .innerJoin(sales, eq(saleItems.saleId, sales.id))
      .where(and(inArray(saleItems.variantId, ids), eq(sales.status, 'layaway_open')))
      .groupBy(saleItems.variantId),
  );
}

// Committed (reservation): active short holds, distinct from layaway.
function committedFromReservationsFor(variantIds: string[]) {
  return sumByVariant(variantIds, (ids) =>
    db
      .select({
        variantId: reservations.variantId,
        total: sql<number>`coalesce(sum(${reservations.qty}), 0)`,
      })
      .from(reservations)
      .where(and(inArray(reservations.variantId, ids), eq(reservations.status, 'held')))
      .groupBy(reservations.variantId),
  );
}

/**
 * Batched stock levels for a set of variants — on hand, committed and
 * available are all derived here, never stored. Use this over
 * getStockLevel() in list views to avoid one query per row.
 */
export async function getStockLevels(variantIds: string[]): Promise<Map<string, StockLevel>> {
  const uniqueIds = [...new Set(variantIds)];
  const [onHandMap, layawayMap, reservedMap] = await Promise.all([
    onHandFor(uniqueIds),
    committedFromLayawayFor(uniqueIds),
    committedFromReservationsFor(uniqueIds),
  ]);

  const result = new Map<string, StockLevel>();
  for (const variantId of uniqueIds) {
    const onHand = onHandMap.get(variantId) ?? 0;
    const committed = (layawayMap.get(variantId) ?? 0) + (reservedMap.get(variantId) ?? 0);
    result.set(variantId, { variantId, onHand, committed, available: onHand - committed });
  }
  return result;
}

export async function getStockLevel(variantId: string): Promise<StockLevel> {
  const levels = await getStockLevels([variantId]);
  return levels.get(variantId) ?? EMPTY_LEVEL(variantId);
}
