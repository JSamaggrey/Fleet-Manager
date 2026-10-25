import { describe, expect, it } from 'vitest';
import { CurrencyMismatchError, parseMoney, percentOf, prorate } from '../money';
import { sampleExpense, sampleRevenue } from '@/test/fixtures';
import { csvCell, toCsv } from './csv';
import { buildProfitReport, depreciationInRange } from './profit';

const WS = '00000000-0000-4000-8000-00000000aaaa';
const A = '00000000-0000-4000-8000-00000000a001';
const B = '00000000-0000-4000-8000-00000000a002';
const CAT = '00000000-0000-4000-8000-00000000c001';
const ghs = (v: string) => parseMoney(v, 'GHS');
let n = 0;
const id = () => `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, '0')}`;

const JAN = { from: '2026-01-01', to: '2026-01-31' };
/** 1,000.00 per month for asset A, 310.00 for B, Jan–Mar 2026. */
const lines = ['2026-01', '2026-02', '2026-03'].flatMap((period) => [
  { assetId: A, period, charge: ghs('1000.00') },
  { assetId: B, period, charge: ghs('310.00') },
]);

function report(
  revenue: ReturnType<typeof sampleRevenue>[],
  expenses: ReturnType<typeof sampleExpense>[],
  range = JAN,
) {
  return buildProfitReport({
    range,
    assetIds: [A, B],
    revenue,
    expenses,
    effectiveLines: lines,
    currency: 'GHS',
  });
}
const trip = (assetId: string | null, amount: string, serviceDate = '2026-01-15') =>
  sampleRevenue(id(), WS, assetId, { amount: ghs(amount), serviceDate });
const cost = (
  assignment: 'asset' | 'shared' | 'unassigned',
  amount: string,
  extra: Partial<ReturnType<typeof sampleExpense>> = {},
) =>
  sampleExpense(id(), WS, CAT, {
    assignment,
    assetId: assignment === 'asset' ? A : null,
    amount: ghs(amount),
    expenseDate: '2026-01-20',
    ...extra,
  });

describe('asset management profit', () => {
  it('is revenue − direct operating expenses − depreciation', () => {
    const r = report([trip(A, '5000.00')], [cost('asset', '800.00')]);
    const a = r.assets.find((x) => x.assetId === A);
    expect(a).toMatchObject({
      revenue: ghs('5000.00'),
      directExpenses: ghs('800.00'),
      depreciation: ghs('1000.00'),
      profit: ghs('3200.00'),
      margin: '64.0',
    });
  });

  it('shows margin N/A when revenue is zero, even with a loss', () => {
    const b = report([], []).assets.find((x) => x.assetId === B);
    expect(b?.profit).toEqual(ghs('-310.00'));
    expect(b?.margin).toBeNull();
  });

  it('allows negative margins', () => {
    const a = report([trip(A, '500.00')], []).assets.find((x) => x.assetId === A);
    expect(a?.profit).toEqual(ghs('-500.00'));
    expect(a?.margin).toBe('-100.0');
  });

  it('never deducts shared, unassigned or capital items from an asset', () => {
    const r = report(
      [trip(A, '5000.00')],
      [
        cost('shared', '2500.00'),
        cost('unassigned', '700.00'),
        cost('asset', '9000.00', { nature: 'capital' }),
      ],
    );
    const a = r.assets.find((x) => x.assetId === A);
    expect(a?.directExpenses).toEqual(ghs('0.00'));
    expect(a?.capitalItems).toEqual(ghs('9000.00'));
    expect(a?.profit).toEqual(ghs('4000.00'));
  });
});

describe('fleet management profit', () => {
  const r = report(
    [trip(A, '5000.00'), trip(B, '1200.00'), trip(null, '300.00')],
    [
      cost('asset', '800.00'),
      cost('shared', '2500.00'),
      cost('unassigned', '700.00'),
      cost('asset', '9000.00', { nature: 'capital' }),
    ],
  );

  it('deducts direct, shared and unassigned operating expenses and depreciation once each', () => {
    expect(r.fleet).toMatchObject({
      revenue: ghs('6500.00'),
      unassignedRevenue: ghs('300.00'),
      directExpenses: ghs('800.00'),
      sharedExpenses: ghs('2500.00'),
      unassignedExpenses: ghs('700.00'),
      depreciation: ghs('1310.00'),
      capitalItems: ghs('9000.00'),
      // 6500 − 800 − 2500 − 700 − 1310
      profit: ghs('1190.00'),
      margin: '18.3',
    });
  });

  it('reconciles with the sum of asset profits', () => {
    // Asset A: 5000 − 800 − 1000 = 3200; asset B: 1200 − 0 − 310 = 890.
    expect(r.fleet.sumOfAssetProfits).toEqual(ghs('4090.00'));
    const reconciled =
      r.fleet.sumOfAssetProfits.amountMinor +
      r.fleet.unassignedRevenue.amountMinor -
      r.fleet.sharedExpenses.amountMinor -
      r.fleet.unassignedExpenses.amountMinor;
    expect(reconciled).toBe(r.fleet.profit.amountMinor);
  });

  it('excludes voided records', () => {
    const voided = { voidedAt: '2026-01-25T09:00:00.000Z', reason: 'Duplicate' };
    const v = report(
      [{ ...trip(A, '5000.00'), void: voided }],
      [{ ...cost('shared', '2500.00'), void: voided }],
    );
    expect(v.fleet.revenue).toEqual(ghs('0.00'));
    expect(v.fleet.sharedExpenses).toEqual(ghs('0.00'));
    expect(v.fleet.margin).toBeNull();
  });
});

describe('period boundaries', () => {
  it('includes records on the first and last day and excludes the days outside', () => {
    const r = report(
      [
        trip(A, '1.00', '2025-12-31'),
        trip(A, '10.00', '2026-01-01'),
        trip(A, '100.00', '2026-01-31'),
        trip(A, '1000.00', '2026-02-01'),
      ],
      [],
    );
    expect(r.fleet.revenue).toEqual(ghs('110.00'));
  });

  it('a quarter equals the sum of its months', () => {
    const records = [trip(A, '100.00', '2026-01-10'), trip(A, '200.00', '2026-03-31')];
    const q1 = report(records, [], { from: '2026-01-01', to: '2026-03-31' });
    const months = [
      { from: '2026-01-01', to: '2026-01-31' },
      { from: '2026-02-01', to: '2026-02-28' },
      { from: '2026-03-01', to: '2026-03-31' },
    ].map((range) => report(records, [], range).fleet.profit.amountMinor);
    expect(q1.fleet.profit.amountMinor).toBe(months.reduce((a, b) => a + b, 0));
    expect(q1.fleet.depreciation).toEqual(ghs('3930.00'));
  });
});

describe('depreciation in a period', () => {
  it('pro-rates partial months by days and rounds half-up once per month', () => {
    // Week 29 Dec 2025 – 4 Jan 2026: no December line; 4 of 31 January days.
    const week = depreciationInRange(lines, { from: '2025-12-29', to: '2026-01-04' }, 'GHS');
    expect(week.get(A)).toEqual(ghs('129.03')); // 1000 × 4/31 = 129.032…
    expect(week.get(B)).toEqual(ghs('40.00')); // 310 × 4/31 = 40
  });

  it('uses the full charge for whole months', () => {
    expect(depreciationInRange(lines, JAN, 'GHS').get(A)).toEqual(ghs('1000.00'));
  });
});

describe('money helpers', () => {
  it('prorates with one rounding step and rejects bad ratios', () => {
    expect(prorate(ghs('100.00'), 1, 3)).toEqual(ghs('33.33'));
    expect(prorate(ghs('0.05'), 1, 2)).toEqual(ghs('0.03')); // half-up
    expect(() => prorate(ghs('1.00'), 1, 0)).toThrow();
  });

  it('computes margins and refuses mixed currencies', () => {
    expect(percentOf(ghs('1.00'), ghs('3.00'))).toBe('33.3');
    expect(percentOf(ghs('1.00'), ghs('0.00'))).toBeNull();
    expect(() => percentOf(ghs('1.00'), { amountMinor: 100, currency: 'USD' as never })).toThrow(
      CurrencyMismatchError,
    );
  });
});

describe('CSV', () => {
  it('quotes when needed and neutralises formula injection in text', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('-12.50')).toBe('-12.50'); // a negative amount stays a number
    expect(csvCell(null)).toBe('');
    expect(csvCell(42)).toBe('42');
  });

  it('starts with a byte-order mark and uses CRLF', () => {
    const csv = toCsv(['a', 'b'], [['1', null]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe('a,b\r\n1,\r\n');
  });
});
