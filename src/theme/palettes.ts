/**
 * Light and dark color palettes. Same warm ivory/ink + gold-accent (60/30/10)
 * design language in both — dark mode is a luminance flip, not a different
 * theme, so `primary`/`ink` swap which end is "light" while `gold` stays the
 * brand throughline in both.
 */
export const lightColors = {
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

export const darkColors: Record<keyof typeof lightColors, string> = {
  background: '#16130F',
  surface: '#211C16',
  surfaceAlt: '#2B241C',
  border: '#3D3529',
  borderStrong: '#524635',

  ink: '#F3EEE4',
  inkSoft: '#C7BEAC',
  inkMuted: '#948C79',
  onInk: '#211C16',

  primary: '#F3EEE4',
  onPrimary: '#211C16',

  gold: '#C79A6C',
  goldSoft: '#3A2E1F',
  onGoldSoft: '#E8C89A',

  silver: '#9AA5B1',
  silverSoft: '#262B31',
  onSilverSoft: '#C3CBD3',

  success: '#4FAE82',
  successSoft: '#173327',
  warning: '#D6A94F',
  warningSoft: '#332711',
  danger: '#E07575',
  dangerSoft: '#3A1F1F',
  info: '#6FA0DE',
  infoSoft: '#1C2A3A',

  overlay: 'rgba(0, 0, 0, 0.6)',
};

export type Colors = Record<keyof typeof lightColors, string>;
export type ColorScheme = 'light' | 'dark';
