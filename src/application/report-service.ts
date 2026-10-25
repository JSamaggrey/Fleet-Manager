import type { Asset } from '@/domain/assets';
import { effectiveLines, positionAt, type DepreciationLine } from '@/domain/depreciation';
import { REPORTING_CURRENCY, toDecimalString, type Money } from '@/domain/money';
import {
  addMonths,
  calendarDateInTimeZone,
  compareYearMonth,
  currentYearMonth,
  isValidRange,
  monthsBetween,
  type CalendarRange,
  type YearMonth,
} from '@/domain/periods';
import {
  buildProfitReport,
  toCsv,
  type AssetProfit,
  type CsvCell,
  type FleetProfit,
} from '@/domain/reports';
import {
  expenseBucket,
  isDateInRange,
  isVoided,
  type Expense,
  type RevenueEntry,
} from '@/domain/transactions';
import type { Workspace } from '@/domain/workspace';
import type { Repositories } from '@/repositories';
import { requireWorkspace } from './asset-records';
import type { ServiceDependencies } from './dependencies';
import { ValidationError } from './errors';
import { assetRef, type AssetRef } from './transaction-records';

export interface AssetProfitRow extends AssetProfit {
  asset: AssetRef;
  categoryName: string;
}

export interface ProfitReportView {
  workspaceName: string;
  range: CalendarRange;
  generatedAt: string;
  /** False while the period includes today or later: activity is to date only. */
  periodEnded: boolean;
  rows: AssetProfitRow[];
  fleet: FleetProfit;
  activeAssets: number;
}

export interface ExceptionItem {
  kind: 'revenue' | 'expense' | 'asset';
  id: string;
  date: string | null;
  label: string;
  amount: Money | null;
  detail: string;
}

export interface ExceptionsView {
  unassignedRevenue: ExceptionItem[];
  unassignedExpenses: ExceptionItem[];
  incompleteAssets: ExceptionItem[];
  scheduleReview: ExceptionItem[];
  voided: ExceptionItem[];
  /** Ended months not yet closed for depreciation, if any asset was in service then. */
  unclosedMonths: { from: YearMonth; to: YearMonth; count: number } | null;
  total: number;
}

export interface CsvFile {
  fileName: string;
  contents: string;
  mimeType: 'text/csv';
}

const amount = (m: Money | null): CsvCell => (m === null ? null : toDecimalString(m));

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'workspace'
  );
}

function csvFile(
  workspace: Workspace,
  kind: string,
  range: CalendarRange,
  contents: string,
): CsvFile {
  return {
    fileName: `fms-${slug(workspace.name)}-${kind}-${range.from}_${range.to}.csv`,
    contents,
    mimeType: 'text/csv',
  };
}

function requireRange(range: CalendarRange): CalendarRange {
  if (!isValidRange(range)) {
    throw new ValidationError('Choose a start date on or before the end date.', 'range');
  }
  return range;
}

async function allEffectiveLines(repos: Repositories, assets: readonly Asset[]) {
  const lines: DepreciationLine[] = [];
  const byAsset = new Map<string, DepreciationLine[]>();
  for (const asset of assets) {
    const own = effectiveLines(
      await repos.depreciation.listSchedules(asset.id),
      await repos.depreciation.listLines(asset.id),
    );
    byAsset.set(asset.id, own);
    lines.push(...own);
  }
  return { lines, byAsset };
}

export function createReportService(deps: ServiceDependencies) {
  const { store, now } = deps;

  async function load(repos: Repositories) {
    const workspace = await requireWorkspace(repos);
    const assets = await repos.assets.list();
    const categories = new Map((await repos.categories.list()).map((c) => [c.id, c]));
    const expenseCategories = new Map(
      (await repos.expenseCategories.list()).map((c) => [c.id, c.name]),
    );
    return {
      workspace,
      assets,
      categories,
      expenseCategories,
      revenue: await repos.revenue.list(),
      expenses: await repos.expenses.list(),
      ...(await allEffectiveLines(repos, assets)),
    };
  }

  async function profit(range: CalendarRange) {
    const valid = requireRange(range);
    return store.read(async (repos) => {
      const data = await load(repos);
      const report = buildProfitReport({
        range: valid,
        assetIds: data.assets.map((a) => a.id),
        revenue: data.revenue,
        expenses: data.expenses,
        effectiveLines: data.lines,
        currency: REPORTING_CURRENCY,
      });
      const assets = new Map(data.assets.map((a) => [a.id, a]));
      const rows: AssetProfitRow[] = report.assets.flatMap((row) => {
        const asset = assets.get(row.assetId);
        return asset
          ? [
              {
                ...row,
                asset: assetRef(asset),
                categoryName: data.categories.get(asset.categoryId)?.name ?? 'Unknown category',
              },
            ]
          : [];
      });
      rows.sort((a, b) => a.asset.code.localeCompare(b.asset.code));
      return { data, report, rows };
    });
  }

  return {
    /** Asset and fleet management profit for an inclusive date range. Includes every asset. */
    async profitReport(range: CalendarRange): Promise<ProfitReportView> {
      const at = now();
      const { data, report, rows } = await profit(range);
      const today = calendarDateInTimeZone(at, data.workspace.settings.timeZone);
      return {
        workspaceName: data.workspace.name,
        range: report.range,
        generatedAt: at.toISOString(),
        periodEnded: report.range.to < today,
        rows,
        fleet: report.fleet,
        activeAssets: data.assets.filter((a) => a.status === 'active').length,
      };
    },

    /** Items that need attention, from data actually captured. Not limited to a period. */
    async exceptions(): Promise<ExceptionsView> {
      const at = now();
      return store.read(async (repos) => {
        const data = await load(repos);
        const assetCode = new Map(data.assets.map((a) => [a.id, a.code]));
        const category = (id: string) => data.expenseCategories.get(id) ?? 'Unknown category';

        const unassignedRevenue = data.revenue
          .filter((r) => !isVoided(r) && r.assetId === null)
          .map((r) => ({
            kind: 'revenue' as const,
            id: r.id,
            date: r.serviceDate,
            label: r.reference,
            amount: r.amount,
            detail: 'Revenue without an asset: counted only in fleet results.',
          }));
        const unassignedExpenses = data.expenses
          .filter((e) => !isVoided(e) && e.assignment === 'unassigned')
          .map((e) => ({
            kind: 'expense' as const,
            id: e.id,
            date: e.expenseDate,
            label: category(e.categoryId),
            amount: e.amount,
            detail: 'Not classified as direct or shared: counted only in fleet results.',
          }));

        const incompleteAssets: ExceptionItem[] = [];
        const scheduleReview: ExceptionItem[] = [];
        const period = currentYearMonth(at, data.workspace.settings.timeZone);
        for (const asset of data.assets) {
          const cat = data.categories.get(asset.categoryId);
          const base = {
            kind: 'asset' as const,
            id: asset.id,
            date: null,
            label: asset.code,
            amount: null,
          };
          if (cat?.usesVehicleFields && !asset.vehicle?.registration) {
            incompleteAssets.push({ ...base, detail: 'Vehicle without a registration number.' });
          }
          if (cat?.archived && asset.status === 'active') {
            incompleteAssets.push({ ...base, detail: `Uses the archived category ${cat.name}.` });
          }
          const position = positionAt(data.byAsset.get(asset.id) ?? [], period, asset.depreciation);
          if (asset.status === 'active' && position.state === 'fully-depreciated') {
            scheduleReview.push({
              ...base,
              detail:
                'Fully depreciated but still active: review its useful life or archive it (disposal is not available yet).',
            });
          }
        }

        const voidedRecords: (ExceptionItem & { voidedAt: string })[] = [
          ...data.revenue.flatMap((r) =>
            r.void
              ? [
                  {
                    kind: 'revenue' as const,
                    id: r.id,
                    date: r.serviceDate,
                    label: `${r.reference}${r.assetId ? ` (${assetCode.get(r.assetId) ?? '?'})` : ''}`,
                    amount: r.amount,
                    detail: `Voided: ${r.void.reason}`,
                    voidedAt: r.void.voidedAt,
                  },
                ]
              : [],
          ),
          ...data.expenses.flatMap((e) =>
            e.void
              ? [
                  {
                    kind: 'expense' as const,
                    id: e.id,
                    date: e.expenseDate,
                    label: category(e.categoryId),
                    amount: e.amount,
                    detail: `Voided: ${e.void.reason}`,
                    voidedAt: e.void.voidedAt,
                  },
                ]
              : [],
          ),
        ].sort((a, b) => b.voidedAt.localeCompare(a.voidedAt));
        const voided: ExceptionItem[] = voidedRecords.map((r) => ({
          kind: r.kind,
          id: r.id,
          date: r.date,
          label: r.label,
          amount: r.amount,
          detail: r.detail,
        }));

        // Ended months since the earliest in-service month that are not yet closed.
        const lastEnded = addMonths(period, -1);
        const starts = data.assets
          .map((a) => a.depreciation.inServiceDate.slice(0, 7))
          .sort(compareYearMonth);
        const closed = data.workspace.depreciationClosedThrough;
        const firstOpen = closed ? addMonths(closed, 1) : starts[0];
        const unclosedMonths =
          firstOpen && compareYearMonth(firstOpen, lastEnded) <= 0
            ? { from: firstOpen, to: lastEnded, count: monthsBetween(firstOpen, lastEnded) + 1 }
            : null;

        const lists = [unassignedRevenue, unassignedExpenses, incompleteAssets, scheduleReview];
        return {
          unassignedRevenue,
          unassignedExpenses,
          incompleteAssets,
          scheduleReview,
          voided,
          unclosedMonths,
          total: lists.reduce((n, list) => n + list.length, 0),
        };
      });
    },

    async profitCsv(range: CalendarRange): Promise<CsvFile> {
      const { data, report, rows } = await profit(range);
      const { from, to } = report.range;
      const header = [
        'row_type',
        'period_from',
        'period_to',
        'asset_code',
        'asset_name',
        'category',
        'revenue',
        'direct_operating_expenses',
        'shared_expenses',
        'unassigned_expenses',
        'depreciation',
        'management_profit',
        'margin_percent',
        'capital_items_not_deducted',
        'currency',
      ];
      const assetRows: CsvCell[][] = rows.map((r) => [
        'asset',
        from,
        to,
        r.asset.code,
        r.asset.name,
        r.categoryName,
        amount(r.revenue),
        amount(r.directExpenses),
        null,
        null,
        amount(r.depreciation),
        amount(r.profit),
        r.margin ?? 'N/A',
        amount(r.capitalItems),
        REPORTING_CURRENCY,
      ]);
      const f = report.fleet;
      const fleetRow: CsvCell[] = [
        'fleet',
        from,
        to,
        null,
        'Fleet total',
        null,
        amount(f.revenue),
        amount(f.directExpenses),
        amount(f.sharedExpenses),
        amount(f.unassignedExpenses),
        amount(f.depreciation),
        amount(f.profit),
        f.margin ?? 'N/A',
        amount(f.capitalItems),
        REPORTING_CURRENCY,
      ];
      return csvFile(
        data.workspace,
        'profit',
        report.range,
        toCsv(header, [...assetRows, fleetRow]),
      );
    },

    /** Every revenue entry in the range, voided ones included and flagged. */
    async revenueCsv(range: CalendarRange): Promise<CsvFile> {
      const valid = requireRange(range);
      return store.read(async (repos) => {
        const workspace = await requireWorkspace(repos);
        const assets = new Map((await repos.assets.list()).map((a) => [a.id, a]));
        const entries = (await repos.revenue.list())
          .filter((r) => isDateInRange(r.serviceDate, valid))
          .sort((a, b) => a.serviceDate.localeCompare(b.serviceDate));
        const header = [
          'service_date',
          'reference',
          'asset_code',
          'asset_name',
          'customer',
          'description',
          'origin',
          'destination',
          'quantity',
          'unit',
          'rate',
          'amount',
          'currency',
          'payment_status',
          'status',
          'void_reason',
          'id',
        ];
        const rows = entries.map((r: RevenueEntry): CsvCell[] => {
          const asset = r.assetId ? assets.get(r.assetId) : undefined;
          return [
            r.serviceDate,
            r.reference,
            asset?.code ?? 'UNASSIGNED',
            asset?.name ?? null,
            r.customer,
            r.description,
            r.origin,
            r.destination,
            r.quantity,
            r.quantityUnit,
            amount(r.rate),
            amount(r.amount),
            r.amount.currency,
            r.paymentStatus,
            r.void ? 'voided' : 'recorded',
            r.void?.reason ?? null,
            r.id,
          ];
        });
        return csvFile(workspace, 'revenue', valid, toCsv(header, rows));
      });
    },

    /** Every expense in the range, voided ones included and flagged. */
    async expenseCsv(range: CalendarRange): Promise<CsvFile> {
      const valid = requireRange(range);
      return store.read(async (repos) => {
        const workspace = await requireWorkspace(repos);
        const assets = new Map((await repos.assets.list()).map((a) => [a.id, a]));
        const categories = new Map(
          (await repos.expenseCategories.list()).map((c) => [c.id, c.name]),
        );
        const expenses = (await repos.expenses.list())
          .filter((e) => isDateInRange(e.expenseDate, valid))
          .sort((a, b) => a.expenseDate.localeCompare(b.expenseDate));
        const header = [
          'expense_date',
          'category',
          'applies_to',
          'asset_code',
          'treatment',
          'vendor',
          'reference',
          'description',
          'amount',
          'currency',
          'payment_status',
          'payment_method',
          'status',
          'void_reason',
          'id',
        ];
        const rows = expenses.map((e: Expense): CsvCell[] => [
          e.expenseDate,
          categories.get(e.categoryId) ?? 'Unknown category',
          e.assignment,
          e.assetId ? (assets.get(e.assetId)?.code ?? null) : null,
          expenseBucket(e),
          e.vendor,
          e.reference,
          e.description,
          amount(e.amount),
          e.amount.currency,
          e.paymentStatus,
          e.paymentMethod,
          e.void ? 'voided' : 'recorded',
          e.void?.reason ?? null,
          e.id,
        ]);
        return csvFile(workspace, 'expenses', valid, toCsv(header, rows));
      });
    },
  };
}

export type ReportService = ReturnType<typeof createReportService>;
