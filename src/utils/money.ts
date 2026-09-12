const CENTIMES_PER_MAD = 100;

export function centimesToMad(centimes: number): number {
  return centimes / CENTIMES_PER_MAD;
}

export function madToCentimes(mad: number): number {
  return Math.round(mad * CENTIMES_PER_MAD);
}

export function formatMad(centimes: number, locale: string = 'fr-MA'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'MAD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(centimesToMad(centimes));
}
