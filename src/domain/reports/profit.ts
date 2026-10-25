import type { DepreciationLine } from '../depreciation';
import {
  add,
  percentOf,
  prorate,
  subtract,
  sum,
  zero,
  type CurrencyCode,
  type Money,
} from '../money';
import {
  isDateInRange,
  isVoided,
  summarizeActivity,
  type Expense,
  type RevenueEntry,
} from '../transactions';
import { monthsInRange, type CalendarRange } from '../periods';

export const PROFIT_FORMULAS = {
  asset:
    'Asset management profit = recognised asset revenue − direct operating expenses of the asset − depreciation of the asset.',
  fleet:
    'Fleet management profit = all recognised revenue (including unassigned) − direct operating expenses − shared fleet expenses − unassigned operating expenses − depreciation.',
  margin:
    'Margin = management profit ÷ revenue, shown only when revenue is above zero; otherwise N/A.',
} as const;

export const DEPRECIATION_IN_PERIOD_RULE =
  'Depreciation per asset is the stored monthly charge for each month in the period. A month partly inside the period contributes charge × days inside ÷ days in month, rounded half-up to the pesewa. Whole months, quarters and years therefore match the schedule exactly.';

export const REPORT_ASSUMPTIONS = [
  'Management profit / contribution for internal use; not statutory net profit.',
  'Revenue counts by service date and expenses by expense date. Payment status does not change this.',
  'Voided records are excluded.',
  'Shared fleet expenses are not allocated to assets. They are deducted only in fleet profit.',
  'Unassigned operating expenses are deducted only in fleet profit until they are classified.',
  'Capital items (acquisitions and improvements) are not operating expenses and are not deducted; asset cost reaches profit only through depreciation.',
  'Depreciation is a non-cash cost.',
  'All amounts are GHS. No other currency is included.',
] as const;

/** Depreciation charged to each asset within the range (pro-rata for partial months). */
export function depreciationInRange(
  effectiveLines: readonly Pick<DepreciationLine, 'assetId' | 'period' | 'charge'>[],
  range: CalendarRange,
  currency: CurrencyCode,
): Map<string, Money> {
  const months = new Map(monthsInRange(range).map((m) => [m.period, m]));
  const byAsset = new Map<string, Money>();
  for (const line of effectiveLines) {
    const month = months.get(line.period);
    if (!month) continue;
    const share = prorate(line.charge, month.days, month.daysInMonth);
    byAsset.set(line.assetId, add(byAsset.get(line.assetId) ?? zero(currency), share));
  }
  return byAsset;
}

export interface AssetProfit {
  assetId: string;
  revenue: Money;
  directExpenses: Money;
  depreciation: Money;
  profit: Money;
  /** Percentage with one decimal, or null (N/A) when revenue is not above zero. */
  margin: string | null;
  capitalItems: Money;
  revenueCount: number;
  expenseCount: number;
}

export interface FleetProfit {
  revenue: Money;
  unassignedRevenue: Money;
  directExpenses: Money;
  sharedExpenses: Money;
  unassignedExpenses: Money;
  depreciation: Money;
  profit: Money;
  margin: string | null;
  capitalItems: Money;
  /** Sum of every asset's management profit, for the reconciliation to fleet profit. */
  sumOfAssetProfits: Money;
}

export interface ProfitReport {
  range: CalendarRange;
  assets: AssetProfit[];
  fleet: FleetProfit;
}

/**
 * Builds asset and fleet management profit for one inclusive date range. `assetIds` lists every
 * asset to report (rows with no activity show zeros). Records for other assets are ignored at
 * asset level but still count at fleet level.
 */
export function buildProfitReport(input: {
  range: CalendarRange;
  assetIds: readonly string[];
  revenue: readonly RevenueEntry[];
  expenses: readonly Expense[];
  effectiveLines: readonly Pick<DepreciationLine, 'assetId' | 'period' | 'charge'>[];
  currency: CurrencyCode;
}): ProfitReport {
  const { range, currency } = input;
  const inRange = { from: range.from, to: range.to };
  const revenue = input.revenue.filter(
    (r) => !isVoided(r) && isDateInRange(r.serviceDate, inRange),
  );
  const expenses = input.expenses.filter(
    (e) => !isVoided(e) && isDateInRange(e.expenseDate, inRange),
  );
  const depreciation = depreciationInRange(input.effectiveLines, range, currency);

  const assets = input.assetIds.map((assetId): AssetProfit => {
    const own = summarizeActivity(
      revenue.filter((r) => r.assetId === assetId),
      expenses.filter((e) => e.assetId === assetId),
      currency,
    );
    const charge = depreciation.get(assetId) ?? zero(currency);
    const profit = subtract(subtract(own.revenue, own.directExpenses), charge);
    return {
      assetId,
      revenue: own.revenue,
      directExpenses: own.directExpenses,
      depreciation: charge,
      profit,
      margin: percentOf(profit, own.revenue),
      capitalItems: own.capitalItems,
      revenueCount: revenue.filter((r) => r.assetId === assetId).length,
      expenseCount: expenses.filter((e) => e.assetId === assetId).length,
    };
  });

  const all = summarizeActivity(revenue, expenses, currency);
  const totalDepreciation = sum([...depreciation.values()], currency);
  const profit = [
    all.directExpenses,
    all.sharedExpenses,
    all.unassignedExpenses,
    totalDepreciation,
  ].reduce((acc, cost) => subtract(acc, cost), all.revenue);

  return {
    range,
    assets,
    fleet: {
      revenue: all.revenue,
      unassignedRevenue: all.unassignedRevenue,
      directExpenses: all.directExpenses,
      sharedExpenses: all.sharedExpenses,
      unassignedExpenses: all.unassignedExpenses,
      depreciation: totalDepreciation,
      profit,
      margin: percentOf(profit, all.revenue),
      capitalItems: all.capitalItems,
      sumOfAssetProfits: sum(
        assets.map((a) => a.profit),
        currency,
      ),
    },
  };
}
