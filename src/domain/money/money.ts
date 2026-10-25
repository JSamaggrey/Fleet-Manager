import { minorUnitDigits, type CurrencyCode } from './currency';
import { Decimal, toBigRoundingMode, type RoundingMode } from './decimal';

/**
 * A monetary amount in integer minor units (e.g. pesewas for GHS) with an explicit currency.
 * Integers keep storage, comparison, and JSON backup exact; see docs/adr/0002-money-representation.md.
 */
export interface Money {
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
}

export class MoneyError extends Error {
  override name = 'MoneyError';
}

export class CurrencyMismatchError extends MoneyError {
  override name = 'CurrencyMismatchError';
  constructor(a: CurrencyCode, b: CurrencyCode) {
    super(`Cannot combine ${a} and ${b} amounts without an approved FX policy.`);
  }
}

/** Default rounding for derived amounts: half away from zero (common commercial convention). */
export const DEFAULT_ROUNDING: RoundingMode = 'half-up';

export function money(amountMinor: number, currency: CurrencyCode): Money {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new MoneyError(`Amount must be a safe integer of minor units, got ${amountMinor}.`);
  }
  // Normalise -0 so equality and serialisation are stable.
  return { amountMinor: amountMinor === 0 ? 0 : amountMinor, currency };
}

export function zero(currency: CurrencyCode): Money {
  return money(0, currency);
}

const DECIMAL_INPUT = /^(-)?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?$/;

/**
 * Parses a user-entered decimal amount such as "1,234.56" or "-12.5".
 * Rejects more fractional digits than the currency allows rather than silently rounding.
 */
export function parseMoney(input: string, currency: CurrencyCode): Money {
  const match = DECIMAL_INPUT.exec(input.trim());
  if (!match) {
    throw new MoneyError(`"${input}" is not a valid amount.`);
  }
  const [, sign = '', whole = '', fraction = ''] = match;
  const digits = minorUnitDigits(currency);
  if (fraction.length > digits) {
    throw new MoneyError(`${currency} amounts allow at most ${digits} decimal places.`);
  }
  const minor = Decimal(`${sign}${whole.replaceAll(',', '')}.${fraction || '0'}`).times(
    minorUnitScale(digits),
  );
  return money(toSafeInteger(minor), currency);
}

/** Plain decimal string, e.g. "1234.56" or "-0.05". Suitable for CSV export. */
export function toDecimalString(value: Money): string {
  return Decimal(String(value.amountMinor))
    .div(minorUnitScale(minorUnitDigits(value.currency)))
    .toFixed(minorUnitDigits(value.currency));
}

export function formatMoney(value: Money, locale = 'en-GH'): string {
  const digits = minorUnitDigits(value.currency);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: value.currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(toDecimalString(value)));
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new CurrencyMismatchError(a.currency, b.currency);
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountMinor + b.amountMinor, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountMinor - b.amountMinor, a.currency);
}

export function negate(value: Money): Money {
  return money(-value.amountMinor, value.currency);
}

/** Sums amounts of one currency. The currency is required so an empty list has a defined result. */
export function sum(values: readonly Money[], currency: CurrencyCode): Money {
  return values.reduce((total, value) => add(total, value), zero(currency));
}

/**
 * Multiplies by a decimal factor given as a string (e.g. a rate or quantity) and rounds to whole
 * minor units using an explicit rounding mode.
 */
export function multiply(
  value: Money,
  factor: string,
  rounding: RoundingMode = DEFAULT_ROUNDING,
): Money {
  let decimalFactor;
  try {
    decimalFactor = Decimal(factor);
  } catch {
    throw new MoneyError(`"${factor}" is not a valid decimal factor.`);
  }
  const product = Decimal(String(value.amountMinor))
    .times(decimalFactor)
    .round(0, toBigRoundingMode(rounding));
  return money(toSafeInteger(product), value.currency);
}

/**
 * value × numerator / denominator, rounded once to whole minor units (e.g. a month's charge for
 * 7 of its 30 days). Integers in, so the ratio is exact before the single rounding step.
 */
export function prorate(
  value: Money,
  numerator: number,
  denominator: number,
  rounding: RoundingMode = DEFAULT_ROUNDING,
): Money {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new MoneyError('Pro-rating needs whole numbers and a positive denominator.');
  }
  if (numerator === denominator) return value;
  const result = Decimal(String(value.amountMinor))
    .times(String(numerator))
    .div(String(denominator))
    .round(0, toBigRoundingMode(rounding));
  return money(toSafeInteger(result), value.currency);
}

/**
 * part / whole as a percentage string with one decimal (e.g. "23.5"), or null when whole ≤ 0.
 * Used for margin, which is undefined without positive revenue.
 */
export function percentOf(part: Money, whole: Money): string | null {
  assertSameCurrency(part, whole);
  if (whole.amountMinor <= 0) return null;
  return Decimal(String(part.amountMinor))
    .times('100')
    .div(String(whole.amountMinor))
    .round(1, toBigRoundingMode(DEFAULT_ROUNDING))
    .toFixed(1);
}

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b);
  return a.amountMinor < b.amountMinor ? -1 : a.amountMinor > b.amountMinor ? 1 : 0;
}

export function isZero(value: Money): boolean {
  return value.amountMinor === 0;
}

export function isNegative(value: Money): boolean {
  return value.amountMinor < 0;
}

function toSafeInteger(value: Decimal): number {
  const asString = value.toFixed(0);
  const asNumber = Number(asString);
  if (!Number.isSafeInteger(asNumber) || String(asNumber) !== asString) {
    throw new MoneyError(`Amount ${value.toString()} is outside the supported range.`);
  }
  return asNumber;
}

function minorUnitScale(digits: number): Decimal {
  return Decimal('10').pow(digits);
}
