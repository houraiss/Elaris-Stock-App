import type { TFunction } from 'i18next';

/**
 * Material rows only carry one (French) name in the DB — this resolves the
 * localized label from `material.<code>` i18n keys, falling back to the
 * stored name for a material code with no translation (e.g. a future one
 * added outside the seed). Takes plain code/name so it works both for a
 * `Material` row and for the `materialCode`/`materialName` pairs returned
 * by joined queries (pieces, markup rules, insights, etc).
 */
export function getMaterialDisplayName(code: string, fallbackName: string, t: TFunction): string {
  return t(`material.${code}`, fallbackName);
}
