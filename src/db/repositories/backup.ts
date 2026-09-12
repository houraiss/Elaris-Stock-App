import { db } from '../client';
import * as schema from '../schema';

// Every table in the schema (section 5) — kept as an explicit list rather
// than reflected out of the schema module, since export order and naming
// here is what a restored backup would be read back against.
const BACKUP_TABLES = {
  materials: schema.materials,
  markupRules: schema.markupRules,
  pieces: schema.pieces,
  variants: schema.variants,
  piecePhotos: schema.piecePhotos,
  scanEvents: schema.scanEvents,
  stockMovements: schema.stockMovements,
  reservations: schema.reservations,
  customers: schema.customers,
  sales: schema.sales,
  saleItems: schema.saleItems,
  customerPayments: schema.customerPayments,
  suppliers: schema.suppliers,
  purchases: schema.purchases,
  purchaseItems: schema.purchaseItems,
  supplierPayments: schema.supplierPayments,
  customOrders: schema.customOrders,
  socialSnapshots: schema.socialSnapshots,
  socialPosts: schema.socialPosts,
  postPieces: schema.postPieces,
} as const;

export interface BackupExport {
  exportedAt: string;
  tables: Record<string, unknown[]>;
}

export async function buildBackupExport(): Promise<BackupExport> {
  const tables: Record<string, unknown[]> = {};
  for (const [name, table] of Object.entries(BACKUP_TABLES)) {
    tables[name] = await db.select().from(table as never);
  }
  return { exportedAt: new Date().toISOString(), tables };
}
