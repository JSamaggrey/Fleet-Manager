import { describe, expect, it } from 'vitest';
import { isCurrencyCode } from './currency';
import {
  CurrencyMismatchError,
  MoneyError,
  add,
  compare,
  formatMoney,
  money,
  multiply,
  negate,
  parseMoney,
  subtract,
  sum,
  toDecimalString,
} from './money';

const ghs = (minor: number) => money(minor, 'GHS');

describe('money construction', () => {
  it('rejects non-integer and unsafe minor-unit amounts', () => {
    expect(() => money(1.5, 'GHS')).toThrow(MoneyError);
    expect(() => money(Number.MAX_SAFE_INTEGER + 1, 'GHS')).toThrow(MoneyError);
    expect(() => money(Number.NaN, 'GHS')).toThrow(MoneyError);
  });

  it('normalises negative zero', () => {
    expect(Object.is(ghs(-0).amountMinor, 0)).toBe(true);
  });

  it('only recognises supported currency codes', () => {
    expect(isCurrencyCode('GHS')).toBe(true);
    expect(isCurrencyCode('USD')).toBe(false);
    expect(isCurrencyCode('toString')).toBe(false);
  });
});

describe('parseMoney', () => {
  it.each([
    ['0', 0],
    ['12', 1200],
    ['12.5', 1250],
    ['12.05', 1205],
    ['1,234.56', 123456],
    ['-0.05', -5],
    ['  99.99 ', 9999],
  ])('parses %j as %i pesewas', (input, expected) => {
    expect(parseMoney(input, 'GHS').amountMinor).toBe(expected);
  });

  it.each(['', 'abc', '1.2.3', '1,23.00', '12,', '.5', '1e3', '+5', '--1'])(
    'rejects %j',
    (input) => {
      expect(() => parseMoney(input, 'GHS')).toThrow(MoneyError);
    },
  );

  it('rejects more decimal places than the currency allows instead of rounding', () => {
    expect(() => parseMoney('1.005', 'GHS')).toThrow(/at most 2 decimal places/);
  });

  it('rejects amounts beyond the safe range', () => {
    expect(() => parseMoney('999999999999999999', 'GHS')).toThrow(MoneyError);
  });
});

describe('arithmetic', () => {
  it('is exact where binary floating point is not (0.10 + 0.20)', () => {
    const total = add(parseMoney('0.10', 'GHS'), parseMoney('0.20', 'GHS'));
    expect(toDecimalString(total)).toBe('0.30');
  });

  it('adds, subtracts, negates and compares', () => {
    expect(add(ghs(150), ghs(50))).toEqual(ghs(200));
    expect(subtract(ghs(150), ghs(200))).toEqual(ghs(-50));
    expect(negate(ghs(75))).toEqual(ghs(-75));
    expect(compare(ghs(1), ghs(2))).toBe(-1);
    expect(compare(ghs(2), ghs(2))).toBe(0);
    expect(compare(ghs(3), ghs(2))).toBe(1);
  });

  it('sums an empty list to zero in the given currency', () => {
    expect(sum([], 'GHS')).toEqual(ghs(0));
    expect(sum([ghs(1), ghs(2), ghs(3)], 'GHS')).toEqual(ghs(6));
  });

  it('refuses to combine different currencies', () => {
    // Only GHS exists today; simulate a foreign-currency record arriving from elsewhere.
    const foreign = { amountMinor: 100, currency: 'USD' } as unknown as ReturnType<typeof ghs>;
    expect(() => add(ghs(100), foreign)).toThrow(CurrencyMismatchError);
    expect(() => compare(ghs(100), foreign)).toThrow(CurrencyMismatchError);
  });
});

describe('multiply rounding', () => {
  it('rounds half away from zero by default', () => {
    expect(multiply(ghs(1), '0.5').amountMinor).toBe(1);
    expect(multiply(ghs(-1), '0.5').amountMinor).toBe(-1);
    expect(multiply(ghs(1), '0.49').amountMinor).toBe(0);
  });

  it('supports half-even and toward-zero when explicitly requested', () => {
    expect(multiply(ghs(1), '0.5', 'half-even').amountMinor).toBe(0);
    expect(multiply(ghs(3), '0.5', 'half-even').amountMinor).toBe(2);
    expect(multiply(ghs(199), '0.5', 'toward-zero').amountMinor).toBe(99);
  });

  it('computes rate × quantity exactly', () => {
    // 37.5 km at GHS 4.35/km = GHS 163.125 → 163.13 (half-up)
    expect(toDecimalString(multiply(parseMoney('4.35', 'GHS'), '37.5'))).toBe('163.13');
  });

  it('rejects invalid factors', () => {
    expect(() => multiply(ghs(100), 'abc')).toThrow(MoneyError);
  });
});

describe('presentation', () => {
  it('produces plain decimal strings for export', () => {
    expect(toDecimalString(ghs(123456))).toBe('1234.56');
    expect(toDecimalString(ghs(-5))).toBe('-0.05');
    expect(toDecimalString(ghs(0))).toBe('0.00');
  });

  it('formats for display with two decimals', () => {
    expect(formatMoney(ghs(123456))).toMatch(/1,234\.56/);
  });
});
