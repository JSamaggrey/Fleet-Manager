/**
 * Supported currencies. MVP supports GHS only: there is no approved FX policy, so other
 * currencies are deliberately not representable until one exists (see docs/product-defaults.md).
 */
const CURRENCIES = {
  GHS: { code: 'GHS', minorUnitDigits: 2, name: 'Ghanaian cedi' },
} as const;

export type CurrencyCode = keyof typeof CURRENCIES;

export const REPORTING_CURRENCY: CurrencyCode = 'GHS';

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && Object.hasOwn(CURRENCIES, value);
}

export function minorUnitDigits(currency: CurrencyCode): number {
  return CURRENCIES[currency].minorUnitDigits;
}
