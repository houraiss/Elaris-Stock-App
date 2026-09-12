import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { baseColumns } from './_shared';
import { sales } from './sales';
import { customOrders } from './customOrders';
import { customers } from './customers';
import type { PaymentMethod } from './supplierPayments';

// Append-only. Outstanding on a sale = total_centimes - sum of its payments (never stored).
export const customerPayments = sqliteTable('customer_payments', {
  ...baseColumns(),
  saleId: text('sale_id').references(() => sales.id),
  customOrderId: text('custom_order_id').references(() => customOrders.id),
  customerId: text('customer_id')
    .notNull()
    .references(() => customers.id),
  amountCentimes: integer('amount_centimes').notNull(),
  method: text('method').notNull().$type<PaymentMethod>(),
  paidOn: text('paid_on').notNull(),
  note: text('note'),
});

export type CustomerPayment = typeof customerPayments.$inferSelect;
export type NewCustomerPayment = typeof customerPayments.$inferInsert;
