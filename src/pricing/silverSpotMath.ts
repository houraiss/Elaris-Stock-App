export const TROY_OUNCE_GRAMS = 31.1034768;
export const SILVER_PURITIES = [999, 925, 800] as const;
export type SilverPurity = (typeof SILVER_PURITIES)[number];

export interface SilverSpotPrice {
  usdPerOz: number;
  usdToMad: number;
  fetchedAt: string; // ISO 8601
}

/** Purity-adjusted price per gram in MAD — e.g. 925 silver is 92.5% pure. */
export function pricePerGramMad(spot: SilverSpotPrice, purity: SilverPurity): number {
  const pureSilverPerGramMad = (spot.usdPerOz / TROY_OUNCE_GRAMS) * spot.usdToMad;
  return pureSilverPerGramMad * (purity / 1000);
}

export function isStale(spot: SilverSpotPrice, staleAfterMs: number, now = Date.now()): boolean {
  return now - new Date(spot.fetchedAt).getTime() > staleAfterMs;
}
