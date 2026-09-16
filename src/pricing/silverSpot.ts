import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SilverSpotPrice } from './silverSpotMath';

export { TROY_OUNCE_GRAMS, SILVER_PURITIES, pricePerGramMad, isStale, type SilverPurity, type SilverSpotPrice } from './silverSpotMath';

const CACHE_KEY = 'elaris.silverSpotCache';

// Both free, keyless, no signup — see PROGRESS.md for the alternatives
// considered and why these two were picked.
const SPOT_PRICE_URL = 'https://api.gold-api.com/price/XAG';
const FX_RATE_URL = 'https://open.er-api.com/v6/latest/USD';

async function fetchSilverUsdPerOz(): Promise<number> {
  const res = await fetch(SPOT_PRICE_URL);
  if (!res.ok) throw new Error(`Silver spot price request failed (${res.status})`);
  const data = await res.json();
  const price = Number(data?.price);
  if (!Number.isFinite(price) || price <= 0) throw new Error('Invalid silver spot price response');
  return price;
}

async function fetchUsdToMad(): Promise<number> {
  const res = await fetch(FX_RATE_URL);
  if (!res.ok) throw new Error(`Exchange rate request failed (${res.status})`);
  const data = await res.json();
  const rate = Number(data?.rates?.MAD);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('Invalid USD/MAD rate response');
  return rate;
}

/** Always hits the network — callers decide when a refresh is warranted. */
export async function fetchSilverSpotPrice(): Promise<SilverSpotPrice> {
  const [usdPerOz, usdToMad] = await Promise.all([fetchSilverUsdPerOz(), fetchUsdToMad()]);
  const price: SilverSpotPrice = { usdPerOz, usdToMad, fetchedAt: new Date().toISOString() };
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(price));
  return price;
}

export async function getCachedSilverSpotPrice(): Promise<SilverSpotPrice | null> {
  const raw = await AsyncStorage.getItem(CACHE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.usdPerOz === 'number' && typeof parsed.usdToMad === 'number' && typeof parsed.fetchedAt === 'string') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
