import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

export type IconName = ComponentProps<typeof Ionicons>['name'];

/** Icon shown for each stack route — used by the header and Home's quick actions. */
export const ROUTE_ICONS: Record<string, IconName> = {
  Home: 'home',
  LogSale: 'pricetag',
  Stock: 'cube',
  PieceDetail: 'diamond',
  AddPiece: 'add-circle',
  StockIntake: 'qr-code',
  Purchases: 'bag-add',
  Balances: 'wallet',
  CustomOrders: 'hammer',
  Reservations: 'bookmark',
  Social: 'share-social',
  Insights: 'stats-chart',
  Settings: 'settings',
};

export const PAYMENT_METHOD_ICONS: Record<string, IconName> = {
  cash: 'cash-outline',
  card: 'card-outline',
  transfer: 'swap-horizontal-outline',
};

export const SALE_CHANNEL_ICONS: Record<string, IconName> = {
  shop: 'storefront-outline',
  market: 'basket-outline',
  whatsapp: 'logo-whatsapp',
  instagram: 'logo-instagram',
  tiktok: 'logo-tiktok',
};

export const SOCIAL_PLATFORM_ICONS: Record<string, IconName> = {
  instagram: 'logo-instagram',
  tiktok: 'logo-tiktok',
};

export const CUSTOM_ORDER_STATUS_ICONS: Record<string, IconName> = {
  quoted: 'document-text-outline',
  ordered: 'receipt-outline',
  in_production: 'construct-outline',
  ready: 'checkmark-circle-outline',
  delivered: 'gift-outline',
  cancelled: 'close-circle-outline',
};

export const ACTIVITY_ICONS: Record<string, IconName> = {
  sale: 'pricetag',
  purchase: 'bag-add',
};

export const SUPPLIER_KIND_ICONS: Record<string, IconName> = {
  wholesaler: 'business-outline',
  craftsman: 'hammer-outline',
};
