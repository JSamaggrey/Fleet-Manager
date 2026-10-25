import { sum, type CurrencyCode, type Money } from '../money';
import { isVoided } from './common';
import type { Expense } from './expense';
import type { RevenueEntry } from './revenue';

/**
 * Where an expense lands in management reporting. Capital comes first: an acquisition or
 * improvement is never an operating expense, whatever it is assigned to.
 */
export type ExpenseBucket = 'direct' | 'shared' | 'unassigned' | 'capital';

export function expenseBucket(expense: Pick<Expense, 'nature' | 'assignment'>): ExpenseBucket {
  if (expense.nature === 'capital') return 'capital';
  if (expense.assignment === 'asset') return 'direct';
  return expense.assignment;
}

export interface ActivityTotals {
  /** All non-voided revenue, including unassigned entries. */
  revenue: Money;
  /** Part of `revenue` not yet assigned to an asset. */
  unassignedRevenue: Money;
  /** Operating expenses of one asset. */
  directExpenses: Money;
  /** Fleet/overhead operating expenses; never allocated to assets. */
  sharedExpenses: Money;
  /** Operating expenses not yet classified. */
  unassignedExpenses: Money;
  /** Capital items: recorded, but not operating expenses. */
  capitalItems: Money;
  /** Items needing attention: non-voided unassigned revenue and expenses. */
  unassignedCount: number;
}

/** Totals of non-voided records. Each expense counts in exactly one bucket. */
export function summarizeActivity(
  revenue: readonly RevenueEntry[],
  expenses: readonly Expense[],
  currency: CurrencyCode,
): ActivityTotals {
  const liveRevenue = revenue.filter((r) => !isVoided(r));
  const liveExpenses = expenses.filter((e) => !isVoided(e));
  const bucket = (b: ExpenseBucket) =>
    sum(
      liveExpenses.filter((e) => expenseBucket(e) === b).map((e) => e.amount),
      currency,
    );
  const unassignedRevenue = liveRevenue.filter((r) => r.assetId === null);
  return {
    revenue: sum(
      liveRevenue.map((r) => r.amount),
      currency,
    ),
    unassignedRevenue: sum(
      unassignedRevenue.map((r) => r.amount),
      currency,
    ),
    directExpenses: bucket('direct'),
    sharedExpenses: bucket('shared'),
    unassignedExpenses: bucket('unassigned'),
    capitalItems: bucket('capital'),
    unassignedCount:
      unassignedRevenue.length + liveExpenses.filter((e) => e.assignment === 'unassigned').length,
  };
}

/** Inclusive calendar-date range; a null end is open. Dates are 'YYYY-MM-DD' strings. */
export interface DateRange {
  from: string | null;
  to: string | null;
}

export function isDateInRange(date: string, range: DateRange): boolean {
  return (range.from === null || date >= range.from) && (range.to === null || date <= range.to);
}
