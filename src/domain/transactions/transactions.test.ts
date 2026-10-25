import { describe, expect, it } from 'vitest';
import { parseMoney } from '../money';
import { sampleExpense, sampleRevenue } from '@/test/fixtures';
import {
  expenseBucket,
  expenseDetailsSchema,
  expenseSchema,
  isDateInRange,
  revenueDetailsSchema,
  revenueEntrySchema,
  summarizeActivity,
} from './index';

const WS = '00000000-0000-4000-8000-00000000aaaa';
const ASSET = '00000000-0000-4000-8000-00000000a001';
const OTHER_ASSET = '00000000-0000-4000-8000-00000000a002';
const CATEGORY = '00000000-0000-4000-8000-00000000c001';
const ghs = (v: string) => parseMoney(v, 'GHS');
let n = 0;
const id = () => `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, '0')}`;

const revenue = (assetId: string | null, amount: string, voided = false) =>
  sampleRevenue(id(), WS, assetId, {
    amount: ghs(amount),
    void: voided ? { voidedAt: '2026-01-25T09:00:00.000Z', reason: 'Duplicate' } : null,
  });
const expense = (
  assignment: 'asset' | 'shared' | 'unassigned',
  amount: string,
  extra: Partial<Parameters<typeof sampleExpense>[3]> = {},
) =>
  sampleExpense(id(), WS, CATEGORY, {
    assignment,
    assetId: assignment === 'asset' ? ASSET : null,
    amount: ghs(amount),
    ...extra,
  });

/** The user-entered fields of a stored record (drops ids, void and timestamps). */
function detailsOf(record: object): Record<string, unknown> {
  const meta = new Set(['id', 'workspaceId', 'void', 'createdAt', 'updatedAt']);
  return Object.fromEntries(Object.entries(record).filter(([key]) => !meta.has(key)));
}

describe('revenue schema', () => {
  it('accepts a stored entry and an unassigned entry', () => {
    expect(revenueEntrySchema.safeParse(revenue(ASSET, '450.00')).success).toBe(true);
    expect(revenueEntrySchema.safeParse(revenue(null, '450.00')).success).toBe(true);
  });

  it('rejects zero and negative amounts', () => {
    expect(revenueEntrySchema.safeParse(revenue(ASSET, '0.00')).success).toBe(false);
    expect(revenueEntrySchema.safeParse(revenue(ASSET, '-1.00')).success).toBe(false);
  });

  it('rejects other currencies (no FX policy)', () => {
    const entry = { ...revenue(ASSET, '1.00'), amount: { amountMinor: 100, currency: 'USD' } };
    expect(revenueEntrySchema.safeParse(entry).success).toBe(false);
  });

  it('validates quantity as a positive decimal string and trims text', () => {
    const details = detailsOf(revenue(ASSET, '10.00'));
    const ok = revenueDetailsSchema.parse({ ...details, quantity: '125.5', customer: '  ' });
    expect(ok.quantity).toBe('125.5');
    expect(ok.customer).toBeNull();
    for (const bad of ['0', '1.2345', 'abc', '-3']) {
      expect(revenueDetailsSchema.safeParse({ ...details, quantity: bad }).success).toBe(false);
    }
  });

  it('requires a reference and rejects a too-short void reason', () => {
    expect(
      revenueEntrySchema.safeParse({ ...revenue(ASSET, '1.00'), reference: ' ' }).success,
    ).toBe(false);
    const shortReason = {
      ...revenue(ASSET, '1.00'),
      void: { voidedAt: '2026-01-25T09:00:00.000Z', reason: 'x' },
    };
    expect(revenueEntrySchema.safeParse(shortReason).success).toBe(false);
  });
});

describe('expense schema', () => {
  it('names an asset exactly when the expense is direct', () => {
    expect(expenseSchema.safeParse(expense('asset', '10.00')).success).toBe(true);
    expect(expenseSchema.safeParse(expense('shared', '10.00')).success).toBe(true);
    expect(expenseSchema.safeParse({ ...expense('asset', '10.00'), assetId: null }).success).toBe(
      false,
    );
    expect(expenseSchema.safeParse({ ...expense('shared', '10.00'), assetId: ASSET }).success).toBe(
      false,
    );
    const details = detailsOf(expense('unassigned', '10.00'));
    expect(expenseDetailsSchema.safeParse({ ...details, assetId: ASSET }).success).toBe(false);
  });

  it('rejects unknown payment methods and zero amounts', () => {
    expect(
      expenseSchema.safeParse({ ...expense('shared', '10.00'), paymentMethod: 'crypto' }).success,
    ).toBe(false);
    expect(expenseSchema.safeParse(expense('shared', '0.00')).success).toBe(false);
  });
});

describe('expense buckets', () => {
  it('puts capital first, then assignment', () => {
    expect(expenseBucket({ nature: 'capital', assignment: 'asset' })).toBe('capital');
    expect(expenseBucket({ nature: 'capital', assignment: 'shared' })).toBe('capital');
    expect(expenseBucket({ nature: 'operating', assignment: 'asset' })).toBe('direct');
    expect(expenseBucket({ nature: 'operating', assignment: 'shared' })).toBe('shared');
    expect(expenseBucket({ nature: 'operating', assignment: 'unassigned' })).toBe('unassigned');
  });
});

describe('summarizeActivity', () => {
  it('counts each expense in exactly one bucket and excludes voided records', () => {
    const totals = summarizeActivity(
      [revenue(ASSET, '450.00'), revenue(null, '1800.00'), revenue(ASSET, '999.00', true)],
      [
        expense('asset', '620.00'),
        expense('asset', '80.00', { assetId: OTHER_ASSET }),
        expense('shared', '2500.00'),
        expense('unassigned', '1200.00'),
        expense('asset', '1500.00', { nature: 'capital' }),
        expense('shared', '5000.00', {
          void: { voidedAt: '2026-01-25T09:00:00.000Z', reason: 'Wrong amount' },
        }),
      ],
      'GHS',
    );
    expect(totals).toEqual({
      revenue: ghs('2250.00'),
      unassignedRevenue: ghs('1800.00'),
      directExpenses: ghs('700.00'),
      sharedExpenses: ghs('2500.00'),
      unassignedExpenses: ghs('1200.00'),
      capitalItems: ghs('1500.00'),
      unassignedCount: 2,
    });
    // No double counting: the buckets add up to every non-voided expense exactly once.
    const bucketed =
      totals.directExpenses.amountMinor +
      totals.sharedExpenses.amountMinor +
      totals.unassignedExpenses.amountMinor +
      totals.capitalItems.amountMinor;
    expect(bucketed).toBe(ghs('5900.00').amountMinor);
  });

  it('returns zeros for no records', () => {
    const totals = summarizeActivity([], [], 'GHS');
    expect(totals.revenue).toEqual(ghs('0.00'));
    expect(totals.unassignedCount).toBe(0);
  });
});

describe('isDateInRange', () => {
  it('is inclusive at both ends and open when an end is null', () => {
    const range = { from: '2026-01-01', to: '2026-01-31' };
    expect(isDateInRange('2026-01-01', range)).toBe(true);
    expect(isDateInRange('2026-01-31', range)).toBe(true);
    expect(isDateInRange('2025-12-31', range)).toBe(false);
    expect(isDateInRange('2026-02-01', range)).toBe(false);
    expect(isDateInRange('1999-01-01', { from: null, to: '2026-01-31' })).toBe(true);
    expect(isDateInRange('2099-01-01', { from: '2026-01-01', to: null })).toBe(true);
  });
});
