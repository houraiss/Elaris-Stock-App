import { and, asc, desc, eq, gte, inArray, lt, ne, sql } from 'drizzle-orm';
import { db } from '../client';
import { sales } from '../schema/sales';
import { saleItems } from '../schema/saleItems';
import { customerPayments } from '../schema/customerPayments';
import { purchases } from '../schema/purchases';
import { supplierPayments } from '../schema/supplierPayments';
import { stockMovements } from '../schema/stockMovements';
import { variants } from '../schema/variants';
import { pieces } from '../schema/pieces';
import { materials } from '../schema/materials';
import { socialSnapshots, socialPosts, postPieces, type SocialPlatform } from '../schema/social';
import { getStockLevels } from './stock';
import { listActiveMarkupBands } from './markupRules';

const NOT_CANCELLED = ne(sales.status, 'cancelled');

function monthKey(iso: string): string {
  return iso.slice(0, 7); // YYYY-MM
}

function monthLabel(key: string): string {
  const [year, month] = key.split('-');
  return `${month}/${year.slice(2)}`;
}

function lastNMonthKeys(monthsBack: number): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

function startOfCurrentMonthIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

// ---------------------------------------------------------------------------
// Home dashboard
// ---------------------------------------------------------------------------

export interface TopPiece {
  pieceId: string;
  name: string;
  qtySold: number;
}

export interface RecentActivityItem {
  id: string;
  kind: 'sale' | 'purchase';
  occurredAt: string;
  label: string;
  amountCentimes: number;
}

export interface HomeSummary {
  bookedThisMonthCentimes: number;
  cashCollectedThisMonthCentimes: number;
  grossMarginThisMonthCentimes: number;
  owedToYouCentimes: number;
  owedToSuppliersCentimes: number;
  inventoryValueCentimes: number;
  lowStockCount: number;
  topPieces: TopPiece[];
  recentActivity: RecentActivityItem[];
}

export async function getHomeSummary(lowStockThreshold: number): Promise<HomeSummary> {
  const monthStart = startOfCurrentMonthIso();

  const [{ booked = 0 } = {}] = await db
    .select({ booked: sql<number>`coalesce(sum(${sales.totalCentimes}), 0)` })
    .from(sales)
    .where(and(NOT_CANCELLED, gte(sales.occurredAt, monthStart)));

  const [{ cash = 0 } = {}] = await db
    .select({ cash: sql<number>`coalesce(sum(${customerPayments.amountCentimes}), 0)` })
    .from(customerPayments)
    .where(gte(customerPayments.paidOn, monthStart));

  const [{ cost = 0 } = {}] = await db
    .select({ cost: sql<number>`coalesce(sum(${saleItems.unitCostCentimes} * ${saleItems.qty}), 0)` })
    .from(saleItems)
    .innerJoin(sales, eq(saleItems.saleId, sales.id))
    .where(and(NOT_CANCELLED, gte(sales.occurredAt, monthStart)));

  // Owed to you: open layaways, total minus whatever's been paid against them.
  const openSales = await db
    .select({ id: sales.id, total: sales.totalCentimes })
    .from(sales)
    .where(eq(sales.status, 'layaway_open'));
  const openSaleIds = openSales.map((s) => s.id);
  const paidByOpenSale = new Map<string, number>();
  if (openSaleIds.length > 0) {
    const paymentRows = await db
      .select({ saleId: customerPayments.saleId, amount: customerPayments.amountCentimes })
      .from(customerPayments)
      .where(inArray(customerPayments.saleId, openSaleIds));
    for (const p of paymentRows) {
      if (!p.saleId) continue;
      paidByOpenSale.set(p.saleId, (paidByOpenSale.get(p.saleId) ?? 0) + p.amount);
    }
  }
  const owedToYouCentimes = openSales.reduce(
    (sum, s) => sum + (s.total - (paidByOpenSale.get(s.id) ?? 0)),
    0,
  );

  // Owed to suppliers: every purchase minus every supplier payment.
  const [{ purchased = 0 } = {}] = await db
    .select({ purchased: sql<number>`coalesce(sum(${purchases.totalCentimes}), 0)` })
    .from(purchases);
  const [{ paidSuppliers = 0 } = {}] = await db
    .select({ paidSuppliers: sql<number>`coalesce(sum(${supplierPayments.amountCentimes}), 0)` })
    .from(supplierPayments);

  // Inventory value at cost: on-hand quantity x current cost, per variant.
  const onHandRows = await db
    .select({ variantId: stockMovements.variantId, onHand: sql<number>`coalesce(sum(${stockMovements.qtyDelta}), 0)` })
    .from(stockMovements)
    .groupBy(stockMovements.variantId);
  const allVariants = await db.select({ id: variants.id, cost: variants.costCentimes }).from(variants);
  const costByVariant = new Map(allVariants.map((v) => [v.id, v.cost]));
  const onHandByVariant = new Map(onHandRows.map((r) => [r.variantId, r.onHand]));
  let inventoryValueCentimes = 0;
  for (const [variantId, onHand] of onHandByVariant) {
    if (onHand > 0) inventoryValueCentimes += onHand * (costByVariant.get(variantId) ?? 0);
  }

  // Low stock: 'model' variants whose available quantity is at or below the
  // threshold — a 'unique' piece has no restock concept (it's a one-off; at
  // qty 0 it just means "sold", not "reorder soon"), so those are excluded.
  const modelVariantRows = await db
    .select({ id: variants.id })
    .from(variants)
    .innerJoin(pieces, eq(variants.pieceId, pieces.id))
    .where(eq(pieces.itemType, 'model'));
  const levels = await getStockLevels(modelVariantRows.map((v) => v.id));
  let lowStockCount = 0;
  for (const level of levels.values()) {
    if (level.available <= lowStockThreshold) lowStockCount++;
  }

  // Top pieces this month by quantity sold.
  const topRows = await db
    .select({ pieceId: variants.pieceId, qtySold: sql<number>`sum(${saleItems.qty})` })
    .from(saleItems)
    .innerJoin(sales, eq(saleItems.saleId, sales.id))
    .innerJoin(variants, eq(saleItems.variantId, variants.id))
    .where(and(NOT_CANCELLED, gte(sales.occurredAt, monthStart)))
    .groupBy(variants.pieceId)
    .orderBy(desc(sql`sum(${saleItems.qty})`))
    .limit(5);
  const pieceNames = topRows.length
    ? await db
        .select({ id: pieces.id, name: pieces.name })
        .from(pieces)
        .where(inArray(pieces.id, topRows.map((r) => r.pieceId)))
    : [];
  const nameByPieceId = new Map(pieceNames.map((p) => [p.id, p.name]));
  const topPieces: TopPiece[] = topRows.map((r) => ({
    pieceId: r.pieceId,
    name: nameByPieceId.get(r.pieceId) ?? '—',
    qtySold: r.qtySold,
  }));

  // Recent activity: latest sales and purchases, merged.
  const recentSales = await db.select().from(sales).orderBy(desc(sales.createdAt)).limit(6);
  const recentPurchases = await db.select().from(purchases).orderBy(desc(purchases.createdAt)).limit(6);
  const recentActivity: RecentActivityItem[] = [
    ...recentSales.map((s) => ({
      id: s.id,
      kind: 'sale' as const,
      occurredAt: s.createdAt,
      label: s.status === 'layaway_open' ? 'layaway opened' : 'sale',
      amountCentimes: s.totalCentimes,
    })),
    ...recentPurchases.map((p) => ({
      id: p.id,
      kind: 'purchase' as const,
      occurredAt: p.createdAt,
      label: 'purchase',
      amountCentimes: p.totalCentimes,
    })),
  ]
    .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))
    .slice(0, 8);

  return {
    bookedThisMonthCentimes: booked,
    cashCollectedThisMonthCentimes: cash,
    grossMarginThisMonthCentimes: booked - cost,
    owedToYouCentimes,
    owedToSuppliersCentimes: purchased - paidSuppliers,
    inventoryValueCentimes,
    lowStockCount,
    topPieces,
    recentActivity,
  };
}

// ---------------------------------------------------------------------------
// Insights: revenue over time (booked vs. cash collected)
// ---------------------------------------------------------------------------

export interface MonthlyRevenue {
  month: string; // display label
  bookedCentimes: number;
  cashCentimes: number;
}

export async function getRevenueByMonth(monthsBack = 6): Promise<MonthlyRevenue[]> {
  const keys = lastNMonthKeys(monthsBack);
  const earliestIso = new Date(`${keys[0]}-01T00:00:00.000Z`).toISOString();

  const bookedRows = await db.all<{ month: string; total: number }>(sql`
    select strftime('%Y-%m', ${sales.occurredAt}) as month, coalesce(sum(${sales.totalCentimes}), 0) as total
    from ${sales}
    where ${sales.status} != 'cancelled' and ${sales.occurredAt} >= ${earliestIso}
    group by month
  `);
  const cashRows = await db.all<{ month: string; total: number }>(sql`
    select strftime('%Y-%m', ${customerPayments.paidOn}) as month, coalesce(sum(${customerPayments.amountCentimes}), 0) as total
    from ${customerPayments}
    where ${customerPayments.paidOn} >= ${earliestIso}
    group by month
  `);

  const bookedByMonth = new Map(bookedRows.map((r) => [r.month, r.total]));
  const cashByMonth = new Map(cashRows.map((r) => [r.month, r.total]));

  return keys.map((key) => ({
    month: monthLabel(key),
    bookedCentimes: bookedByMonth.get(key) ?? 0,
    cashCentimes: cashByMonth.get(key) ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// Insights: realised markup vs. the current rule table
// ---------------------------------------------------------------------------

export interface MarkupComparison {
  label: string; // "All materials · 5–10 g" etc.
  ruleBps: number;
  realisedBps: number;
  itemCount: number;
}

/** Weighted realised margin (margin / cost, not an average of percentages) per current band. */
export async function getRealisedMarkupVsRuleTable(): Promise<MarkupComparison[]> {
  const bands = await listActiveMarkupBands();
  if (bands.length === 0) return [];

  const soldItems = await db
    .select({
      qty: saleItems.qty,
      unitCostCentimes: saleItems.unitCostCentimes,
      unitPriceCentimes: saleItems.unitPriceCentimes,
      weightMgActual: saleItems.weightMgActual,
      materialId: pieces.materialId,
    })
    .from(saleItems)
    .innerJoin(sales, eq(saleItems.saleId, sales.id))
    .innerJoin(variants, eq(saleItems.variantId, variants.id))
    .innerJoin(pieces, eq(variants.pieceId, pieces.id))
    .where(NOT_CANCELLED);

  const totals = new Map<string, { cost: number; margin: number; count: number }>();

  for (const item of soldItems) {
    const perUnitWeight = item.weightMgActual / Math.max(1, item.qty);
    // Material-specific band beats a generic one covering the same weight.
    const match =
      bands.find((b) => b.materialId === item.materialId && perUnitWeight >= b.minWeightMg && perUnitWeight < b.maxWeightMg) ??
      bands.find((b) => b.materialId === null && perUnitWeight >= b.minWeightMg && perUnitWeight < b.maxWeightMg);
    if (!match) continue;

    const cost = item.unitCostCentimes * item.qty;
    const margin = (item.unitPriceCentimes - item.unitCostCentimes) * item.qty;
    const entry = totals.get(match.key) ?? { cost: 0, margin: 0, count: 0 };
    entry.cost += cost;
    entry.margin += margin;
    entry.count += item.qty;
    totals.set(match.key, entry);
  }

  return bands
    .map((band) => {
      const entry = totals.get(band.key);
      const realisedBps = entry && entry.cost > 0 ? Math.round((entry.margin / entry.cost) * 10_000) : 0;
      return {
        label: `${band.materialName ?? 'All materials'} · ${Math.round(band.minWeightMg / 1000)}–${
          band.maxWeightMg >= Number.MAX_SAFE_INTEGER / 2 ? '∞' : Math.round(band.maxWeightMg / 1000)
        } g`,
        ruleBps: band.active.markupBps,
        realisedBps,
        itemCount: entry?.count ?? 0,
      };
    })
    .filter((row) => row.itemCount > 0);
}

// ---------------------------------------------------------------------------
// Insights: sales breakdown by material / category / channel
// ---------------------------------------------------------------------------

export type SalesBreakdownDimension = 'material' | 'category' | 'channel';

export interface SalesBreakdownRow {
  label: string;
  totalCentimes: number;
  qty: number;
}

export async function getSalesBreakdown(dimension: SalesBreakdownDimension): Promise<SalesBreakdownRow[]> {
  if (dimension === 'channel') {
    const rows = await db
      .select({
        label: sales.channel,
        totalCentimes: sql<number>`coalesce(sum(${saleItems.unitPriceCentimes} * ${saleItems.qty}), 0)`,
        qty: sql<number>`coalesce(sum(${saleItems.qty}), 0)`,
      })
      .from(saleItems)
      .innerJoin(sales, eq(saleItems.saleId, sales.id))
      .where(NOT_CANCELLED)
      .groupBy(sales.channel)
      .orderBy(desc(sql`sum(${saleItems.unitPriceCentimes} * ${saleItems.qty})`));
    return rows;
  }

  const groupCol = dimension === 'material' ? materials.name : pieces.category;
  const rows = await db
    .select({
      label: groupCol,
      totalCentimes: sql<number>`coalesce(sum(${saleItems.unitPriceCentimes} * ${saleItems.qty}), 0)`,
      qty: sql<number>`coalesce(sum(${saleItems.qty}), 0)`,
    })
    .from(saleItems)
    .innerJoin(sales, eq(saleItems.saleId, sales.id))
    .innerJoin(variants, eq(saleItems.variantId, variants.id))
    .innerJoin(pieces, eq(variants.pieceId, pieces.id))
    .innerJoin(materials, eq(pieces.materialId, materials.id))
    .where(NOT_CANCELLED)
    .groupBy(groupCol)
    .orderBy(desc(sql`sum(${saleItems.unitPriceCentimes} * ${saleItems.qty})`));
  return rows;
}

// ---------------------------------------------------------------------------
// Insights: wholesale cost trends per material
// ---------------------------------------------------------------------------

export interface CostTrendSeries {
  materialName: string;
  points: { month: string; avgCostPerGramCentimes: number }[];
}

export async function getCostTrendsByMaterial(monthsBack = 6): Promise<CostTrendSeries[]> {
  const keys = lastNMonthKeys(monthsBack);
  const earliestIso = new Date(`${keys[0]}-01T00:00:00.000Z`).toISOString();

  const rows = await db
    .select({
      materialName: materials.name,
      occurredAt: stockMovements.occurredAt,
      weightMg: stockMovements.weightMg,
      unitCostCentimes: stockMovements.unitCostCentimes,
      qtyDelta: stockMovements.qtyDelta,
    })
    .from(stockMovements)
    .innerJoin(variants, eq(stockMovements.variantId, variants.id))
    .innerJoin(pieces, eq(variants.pieceId, pieces.id))
    .innerJoin(materials, eq(pieces.materialId, materials.id))
    .where(and(eq(stockMovements.type, 'purchase'), gte(stockMovements.occurredAt, earliestIso)));

  const byMaterial = new Map<string, Map<string, { costGramSum: number; count: number }>>();
  for (const row of rows) {
    if (!row.weightMg || row.weightMg <= 0 || row.qtyDelta <= 0) continue;
    const costPerGram = row.unitCostCentimes / (row.weightMg / row.qtyDelta / 1000);
    const key = monthKey(row.occurredAt);
    const materialMap = byMaterial.get(row.materialName) ?? new Map();
    const point = materialMap.get(key) ?? { costGramSum: 0, count: 0 };
    point.costGramSum += costPerGram;
    point.count += 1;
    materialMap.set(key, point);
    byMaterial.set(row.materialName, materialMap);
  }

  const series: CostTrendSeries[] = [];
  for (const [materialName, materialMap] of byMaterial) {
    series.push({
      materialName,
      points: keys.map((key) => {
        const point = materialMap.get(key);
        return {
          month: monthLabel(key),
          avgCostPerGramCentimes: point ? Math.round(point.costGramSum / point.count) : 0,
        };
      }),
    });
  }
  return series;
}

// ---------------------------------------------------------------------------
// Insights: ring sizes that actually sell
// ---------------------------------------------------------------------------

export interface RingSizePopularity {
  label: string;
  qtySold: number;
}

export async function getRingSizePopularity(): Promise<RingSizePopularity[]> {
  const rows = await db
    .select({ label: variants.label, qtySold: sql<number>`coalesce(sum(${saleItems.qty}), 0)` })
    .from(saleItems)
    .innerJoin(sales, eq(saleItems.saleId, sales.id))
    .innerJoin(variants, eq(saleItems.variantId, variants.id))
    .innerJoin(pieces, eq(variants.pieceId, pieces.id))
    .where(and(NOT_CANCELLED, eq(pieces.variantType, 'ring_size')))
    .groupBy(variants.label)
    .orderBy(desc(sql`sum(${saleItems.qty})`));
  return rows;
}

// ---------------------------------------------------------------------------
// Insights: dead stock
// ---------------------------------------------------------------------------

export interface DeadStockRow {
  pieceId: string;
  variantId: string;
  pieceName: string;
  variantLabel: string;
  onHand: number;
  daysSinceLastSale: number | null; // null = never sold
}

export async function getDeadStock(daysThreshold = 90): Promise<DeadStockRow[]> {
  const onHandRows = await db
    .select({ variantId: stockMovements.variantId, onHand: sql<number>`coalesce(sum(${stockMovements.qtyDelta}), 0)` })
    .from(stockMovements)
    .groupBy(stockMovements.variantId);
  const inStockVariantIds = onHandRows.filter((r) => r.onHand > 0).map((r) => r.variantId);
  if (inStockVariantIds.length === 0) return [];

  const lastSaleRows = await db
    .select({ variantId: saleItems.variantId, lastSale: sql<string>`max(${sales.occurredAt})` })
    .from(saleItems)
    .innerJoin(sales, eq(saleItems.saleId, sales.id))
    .where(and(NOT_CANCELLED, inArray(saleItems.variantId, inStockVariantIds)))
    .groupBy(saleItems.variantId);
  const lastSaleByVariant = new Map(lastSaleRows.map((r) => [r.variantId, r.lastSale]));

  const detailRows = await db
    .select({
      variantId: variants.id,
      variantLabel: variants.label,
      pieceId: pieces.id,
      pieceName: pieces.name,
    })
    .from(variants)
    .innerJoin(pieces, eq(variants.pieceId, pieces.id))
    .where(inArray(variants.id, inStockVariantIds));

  const onHandByVariant = new Map(onHandRows.map((r) => [r.variantId, r.onHand]));
  const now = Date.now();
  const result: DeadStockRow[] = [];
  for (const row of detailRows) {
    const lastSale = lastSaleByVariant.get(row.variantId) ?? null;
    const daysSinceLastSale = lastSale ? Math.floor((now - new Date(lastSale).getTime()) / (1000 * 60 * 60 * 24)) : null;
    if (daysSinceLastSale === null || daysSinceLastSale >= daysThreshold) {
      result.push({
        pieceId: row.pieceId,
        variantId: row.variantId,
        pieceName: row.pieceName,
        variantLabel: row.variantLabel,
        onHand: onHandByVariant.get(row.variantId) ?? 0,
        daysSinceLastSale,
      });
    }
  }
  return result.sort((a, b) => (b.daysSinceLastSale ?? Infinity) - (a.daysSinceLastSale ?? Infinity));
}

// ---------------------------------------------------------------------------
// Insights: follower growth vs. sales
// ---------------------------------------------------------------------------

export interface FollowerGrowthPoint {
  month: string;
  followers: number | null; // last known snapshot that month; carried forward when a month has no entry
  bookedCentimes: number;
}

export async function getFollowerGrowthVsSales(platform: SocialPlatform, monthsBack = 6): Promise<FollowerGrowthPoint[]> {
  const keys = lastNMonthKeys(monthsBack);
  const earliestIso = new Date(`${keys[0]}-01T00:00:00.000Z`).toISOString();

  const snapshotRows = await db
    .select({ capturedOn: socialSnapshots.capturedOn, followers: socialSnapshots.followers })
    .from(socialSnapshots)
    .where(and(eq(socialSnapshots.platform, platform), gte(socialSnapshots.capturedOn, earliestIso)))
    .orderBy(asc(socialSnapshots.capturedOn));

  const lastFollowersByMonth = new Map<string, number>();
  for (const row of snapshotRows) {
    lastFollowersByMonth.set(monthKey(row.capturedOn), row.followers);
  }

  const bookedRows = await db.all<{ month: string; total: number }>(sql`
    select strftime('%Y-%m', ${sales.occurredAt}) as month, coalesce(sum(${sales.totalCentimes}), 0) as total
    from ${sales}
    where ${sales.status} != 'cancelled' and ${sales.occurredAt} >= ${earliestIso}
    group by month
  `);
  const bookedByMonth = new Map(bookedRows.map((r) => [r.month, r.total]));

  let lastKnownFollowers: number | null = null;
  return keys.map((key) => {
    if (lastFollowersByMonth.has(key)) lastKnownFollowers = lastFollowersByMonth.get(key)!;
    return {
      month: monthLabel(key),
      followers: lastKnownFollowers,
      bookedCentimes: bookedByMonth.get(key) ?? 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Insights: post-to-sales correlation
// ---------------------------------------------------------------------------

export interface PostSalesCorrelationRow {
  postId: string;
  platform: SocialPlatform;
  postedAt: string;
  caption: string | null;
  pieceNames: string[];
  qtySoldAfter: number;
}

const CORRELATION_WINDOW_DAYS = 14;

/** For each tagged post, how many units of its tagged pieces sold in the following 14 days. */
export async function getPostToSalesCorrelation(limit = 20): Promise<PostSalesCorrelationRow[]> {
  const taggedRows = await db
    .select({ post: socialPosts, pieceId: postPieces.pieceId, pieceName: pieces.name })
    .from(postPieces)
    .innerJoin(socialPosts, eq(postPieces.postId, socialPosts.id))
    .innerJoin(pieces, eq(postPieces.pieceId, pieces.id))
    .orderBy(desc(socialPosts.postedAt));

  if (taggedRows.length === 0) return [];

  const byPost = new Map<string, { post: (typeof taggedRows)[number]['post']; pieceIds: string[]; pieceNames: string[] }>();
  for (const row of taggedRows) {
    const entry = byPost.get(row.post.id) ?? { post: row.post, pieceIds: [], pieceNames: [] };
    if (!entry.pieceIds.includes(row.pieceId)) {
      entry.pieceIds.push(row.pieceId);
      entry.pieceNames.push(row.pieceName);
    }
    byPost.set(row.post.id, entry);
  }

  const posts = [...byPost.values()].sort((a, b) => (a.post.postedAt < b.post.postedAt ? 1 : -1)).slice(0, limit);

  const results: PostSalesCorrelationRow[] = [];
  for (const { post, pieceIds, pieceNames } of posts) {
    const windowEnd = new Date(new Date(post.postedAt).getTime() + CORRELATION_WINDOW_DAYS * 86_400_000).toISOString();
    const soldRows = await db
      .select({ qty: saleItems.qty })
      .from(saleItems)
      .innerJoin(sales, eq(saleItems.saleId, sales.id))
      .innerJoin(variants, eq(saleItems.variantId, variants.id))
      .where(
        and(
          NOT_CANCELLED,
          gte(sales.occurredAt, post.postedAt),
          lt(sales.occurredAt, windowEnd),
          inArray(variants.pieceId, pieceIds),
        ),
      );
    results.push({
      postId: post.id,
      platform: post.platform,
      postedAt: post.postedAt,
      caption: post.caption,
      pieceNames,
      qtySoldAfter: soldRows.reduce((sum, r) => sum + r.qty, 0),
    });
  }

  return results;
}
