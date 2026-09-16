import type { ViewStyle } from 'react-native';

/**
 * Elaris design tokens. Warm ivory + ink-charcoal base (60/30) with a gold
 * accent (10%) — jewelry-boutique feel — plus a silver accent reserved for
 * the silver-material / silver-price surfaces.
 */
export const colors = {
  background: '#FAF8F4',
  surface: '#FFFFFF',
  surfaceAlt: '#F4EFE6',
  border: '#EAE2D4',
  borderStrong: '#DED1B8',

  ink: '#211D18',
  inkSoft: '#6E6759',
  inkMuted: '#A39C8C',
  onInk: '#FFFFFF',

  primary: '#211D18',
  onPrimary: '#FFFFFF',

  gold: '#A67C52',
  goldSoft: '#F6ECDA',
  onGoldSoft: '#8A5F2A',

  silver: '#7C8794',
  silverSoft: '#EBEEF1',
  onSilverSoft: '#525C68',

  success: '#2F7D5A',
  successSoft: '#E4F3EA',
  warning: '#B8863B',
  warningSoft: '#FBF0DD',
  danger: '#B23B3B',
  dangerSoft: '#FBEAEA',
  info: '#3B6FB2',
  infoSoft: '#E9F1FB',

  overlay: 'rgba(33, 29, 24, 0.55)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 26, fontWeight: '700' as const, color: colors.ink },
  h1: { fontSize: 20, fontWeight: '700' as const, color: colors.ink },
  h2: { fontSize: 16, fontWeight: '700' as const, color: colors.ink },
  body: { fontSize: 14, fontWeight: '400' as const, color: colors.ink },
  bodyStrong: { fontSize: 14, fontWeight: '600' as const, color: colors.ink },
  small: { fontSize: 12, fontWeight: '500' as const, color: colors.inkSoft },
  tiny: { fontSize: 11, fontWeight: '600' as const, color: colors.inkSoft },
};

export const shadow: Record<'card' | 'raised' | 'fab', ViewStyle> = {
  card: {
    shadowColor: '#3A2E1E',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  raised: {
    shadowColor: '#3A2E1E',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  fab: {
    shadowColor: '#000000',
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
};
