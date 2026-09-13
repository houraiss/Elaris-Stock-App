import * as schema from '../db/schema';

/**
 * Dependency order (parents before children) — used for both push and
 * restore so foreign keys are always satisfied on the receiving side.
 * Every table here has id/created_at/updated_at/synced_at except
 * post_pieces, which is handled separately (see syncEngine.ts).
 */
export const SYNC_TABLES = [
  { name: 'materials', table: schema.materials },
  { name: 'markup_rules', table: schema.markupRules },
  { name: 'customers', table: schema.customers },
  { name: 'suppliers', table: schema.suppliers },
  { name: 'pieces', table: schema.pieces },
  { name: 'variants', table: schema.variants },
  { name: 'piece_photos', table: schema.piecePhotos },
  { name: 'scan_events', table: schema.scanEvents },
  { name: 'purchases', table: schema.purchases },
  { name: 'purchase_items', table: schema.purchaseItems },
  { name: 'supplier_payments', table: schema.supplierPayments },
  { name: 'custom_orders', table: schema.customOrders },
  { name: 'sales', table: schema.sales },
  { name: 'sale_items', table: schema.saleItems },
  { name: 'customer_payments', table: schema.customerPayments },
  { name: 'stock_movements', table: schema.stockMovements },
  { name: 'reservations', table: schema.reservations },
  { name: 'social_snapshots', table: schema.socialSnapshots },
  { name: 'social_posts', table: schema.socialPosts },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
] as { name: string; table: any }[];

export const POST_PIECES_TABLE_NAME = 'post_pieces';
