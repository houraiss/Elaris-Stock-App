const MG_PER_GRAM = 1_000;

export function mgToGrams(weightMg: number): number {
  return weightMg / MG_PER_GRAM;
}

export function gramsToMg(grams: number): number {
  return Math.round(grams * MG_PER_GRAM);
}

export function formatGrams(weightMg: number, locale: string = 'fr-MA'): string {
  const grams = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(mgToGrams(weightMg));
  return `${grams} g`;
}
