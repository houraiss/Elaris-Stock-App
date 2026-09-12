import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { baseColumns } from './_shared';
import { suppliers } from './suppliers';
import { purchases } from './purchases';

export type PaymentMethod = 'cash' | 'card' | 'transfer';

// Append-only. purchase_id nullable so you can also pay a supplier on account.
export const supplierPayments = sqliteTable('supplier_payments', {
  ...baseColumns(),
  supplierId: text('supplier_id')
    .notNull()
    .references(() => suppliers.id),
  purchaseId: text('purchase_id').references(() => purchases.id),
  amountCentimes: integer('amount_centimes').notNull(),
  method: text('method').notNull().$type<PaymentMethod>(),
  paidOn: text('paid_on').notNull(),
  note: text('note'),
});

export type SupplierPayment = typeof supplierPayments.$inferSelect;
export type NewSupplierPayment = typeof supplierPayments.$inferInsert;
