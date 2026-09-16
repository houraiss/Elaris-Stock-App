import { pricePerGramMad, isStale, TROY_OUNCE_GRAMS, type SilverSpotPrice } from './silverSpotMath';

describe('pricePerGramMad', () => {
  // usdPerOz chosen as exactly one troy ounce of USD, so pure silver is
  // $1.00/gram before the MAD conversion — isolates the purity math from
  // the unit conversion.
  const spot: SilverSpotPrice = { usdPerOz: TROY_OUNCE_GRAMS, usdToMad: 10, fetchedAt: '2026-01-01T00:00:00.000Z' };

  it.each([
    [999, 9.99],
    [925, 9.25],
    [800, 8],
  ] as const)('purity %d -> %d MAD/g', (purity, expected) => {
    expect(pricePerGramMad(spot, purity)).toBeCloseTo(expected, 6);
  });
});

describe('isStale', () => {
  const spot: SilverSpotPrice = { usdPerOz: 30, usdToMad: 10, fetchedAt: '2026-01-01T00:00:00.000Z' };
  const fetchedAtMs = new Date(spot.fetchedAt).getTime();

  it('is not stale right after fetching', () => {
    expect(isStale(spot, 60_000, fetchedAtMs)).toBe(false);
  });

  it('is not stale exactly at the threshold', () => {
    expect(isStale(spot, 60_000, fetchedAtMs + 60_000)).toBe(false);
  });

  it('is stale just past the threshold', () => {
    expect(isStale(spot, 60_000, fetchedAtMs + 60_001)).toBe(true);
  });
});
