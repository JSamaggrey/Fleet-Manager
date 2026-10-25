import {
  createColumnHelper,
  useTable,
  type PaginationState,
  type SortingState,
} from '@tanstack/react-table';
import { Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { AssetProfitRow, ProfitReportView } from '@/application/report-service';
import { formatMoney, isNegative, type Money } from '@/domain/money';
import { describeRange, type CalendarRange } from '@/domain/periods';
import { DEPRECIATION_IN_PERIOD_RULE, PROFIT_FORMULAS, REPORT_ASSUMPTIONS } from '@/domain/reports';
import type { Workspace } from '@/domain/workspace';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { Badge, Card, PageHeader } from '../components/Card';
import { DataTable, Pager } from '../components/DataTable';
import { listFeatures } from '../components/list-features';
import { ErrorState, LoadingState } from '../components/StateViews';
import { useExportCsv, useProfitReport, type CsvKind } from '../queries';
import { PeriodPicker } from '../reports/PeriodPicker';
import { useReportPeriod } from '../reports/report-period';
import { TEXT_LINK } from '../transactions/list-controls';

const helper = createColumnHelper<typeof listFeatures, AssetProfitRow>();

/** Link to the records behind a figure, filtered to the asset and period. */
function drill(path: 'revenue' | 'expenses', assetId: string, range: CalendarRange) {
  return `/${path}?asset=${assetId}&from=${range.from}&to=${range.to}`;
}

function MoneyText({ value }: { value: Money }) {
  return <span className={isNegative(value) ? 'text-red-700' : ''}>{formatMoney(value)}</span>;
}

const margin = (value: string | null) => (value === null ? 'N/A' : `${value}%`);

function columnsFor(range: CalendarRange) {
  return helper.columns([
    helper.accessor((row) => row.asset.code, {
      id: 'code',
      header: 'Asset',
      sortFn: 'alphanumeric',
      cell: (info) => (
        <Link to={`/assets/${info.row.original.asset.id}`} className={TEXT_LINK}>
          {info.getValue()}
        </Link>
      ),
    }),
    helper.accessor((row) => row.asset.name, {
      id: 'name',
      header: 'Name',
      sortFn: 'alphanumeric',
      meta: { wrap: true },
      cell: (info) => (
        <>
          {info.getValue()}
          {info.row.original.asset.archived && (
            <span className="ml-2">
              <Badge>Archived</Badge>
            </span>
          )}
        </>
      ),
    }),
    helper.accessor((row) => row.revenue.amountMinor, {
      id: 'revenue',
      header: 'Revenue',
      sortFn: 'basic',
      meta: { numeric: true },
      cell: (info) => (
        <Link to={drill('revenue', info.row.original.asset.id, range)} className={TEXT_LINK}>
          {formatMoney(info.row.original.revenue)}
        </Link>
      ),
    }),
    helper.accessor((row) => row.directExpenses.amountMinor, {
      id: 'direct',
      header: 'Direct expenses',
      sortFn: 'basic',
      meta: { numeric: true },
      cell: (info) => (
        <Link to={drill('expenses', info.row.original.asset.id, range)} className={TEXT_LINK}>
          {formatMoney(info.row.original.directExpenses)}
        </Link>
      ),
    }),
    helper.accessor((row) => row.depreciation.amountMinor, {
      id: 'depreciation',
      header: 'Depreciation',
      sortFn: 'basic',
      meta: { numeric: true },
      cell: (info) => formatMoney(info.row.original.depreciation),
    }),
    helper.accessor((row) => row.profit.amountMinor, {
      id: 'profit',
      header: 'Management profit',
      sortFn: 'basic',
      meta: { numeric: true },
      cell: (info) => (
        <strong>
          <MoneyText value={info.row.original.profit} />
        </strong>
      ),
    }),
    helper.accessor((row) => (row.margin === null ? -Infinity : Number(row.margin)), {
      id: 'margin',
      header: 'Margin',
      sortFn: 'basic',
      meta: { numeric: true },
      cell: (info) => margin(info.row.original.margin),
    }),
  ]);
}

export function ReportsPage({ workspace }: { workspace: Workspace }) {
  const period = useReportPeriod(workspace);
  const report = useProfitReport(period.range);
  const label = describeRange(period.kind, period.range);

  return (
    <>
      <PageHeader
        title="Reports"
        description="Management profit and contribution for this device’s workspace only. Not statutory accounts."
      />
      <Card title="Reporting period">
        {/* Remount on range change so the custom inputs show the applied range. */}
        <PeriodPicker
          key={`${period.kind}-${period.range.from}-${period.range.to}`}
          period={period}
        />
      </Card>

      <div className="mt-6">
        {report.isPending && <LoadingState label="Calculating…" />}
        {report.isError && (
          <ErrorState
            title="The report could not be produced"
            error={report.error}
            onRetry={() => void report.refetch()}
          />
        )}
        {report.data && <ReportBody report={report.data} label={label} />}
      </div>
    </>
  );
}

function ReportBody({ report, label }: { report: ProfitReportView; label: string }) {
  const { fleet, range } = report;
  const [showIdle, setShowIdle] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'code', desc: false }]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 });
  const exportCsv = useExportCsv();
  const columns = useMemo(() => columnsFor(range), [range]);
  const data = useMemo(
    () =>
      showIdle
        ? report.rows
        : report.rows.filter(
            (r) =>
              r.revenueCount > 0 ||
              r.expenseCount > 0 ||
              r.depreciation.amountMinor !== 0 ||
              !r.asset.archived,
          ),
    [report.rows, showIdle],
  );
  const table = useTable({
    features: listFeatures,
    columns,
    data,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    enableSortingRemoval: false,
    getRowId: (row) => row.asset.id,
  });
  const exportButton = (kind: CsvKind, text: string) => (
    <Button
      variant="secondary"
      disabled={exportCsv.isPending}
      onClick={() => exportCsv.mutate({ kind, range })}
    >
      <Download aria-hidden="true" className="size-4" />
      {text}
    </Button>
  );

  const statement: [string, Money, 'add' | 'less' | 'total'][] = [
    ['Revenue', fleet.revenue, 'add'],
    ['Direct operating expenses', fleet.directExpenses, 'less'],
    ['Shared / fleet expenses (not allocated to assets)', fleet.sharedExpenses, 'less'],
    ['Unassigned operating expenses', fleet.unassignedExpenses, 'less'],
    ['Depreciation (non-cash)', fleet.depreciation, 'less'],
  ];

  return (
    <div className="space-y-6">
      <section
        aria-label="Report scope"
        className="grid gap-x-6 gap-y-1 rounded-lg border border-slate-200 bg-white p-4 text-sm shadow-sm sm:grid-cols-2 lg:grid-cols-4"
      >
        <p>
          <span className="text-slate-600">Workspace: </span>
          <strong>{report.workspaceName}</strong> (this device)
        </p>
        <p>
          <span className="text-slate-600">Period: </span>
          <strong>{label}</strong> ({range.from} to {range.to}, inclusive)
        </p>
        <p>
          <span className="text-slate-600">Currency: </span>
          <strong>GHS</strong>
        </p>
        <p>
          <span className="text-slate-600">Basis: </span>
          <strong>service / expense date</strong>
        </p>
      </section>

      {!report.periodEnded && (
        <Alert tone="info" title="This period has not ended">
          <p>
            Revenue and expenses are recorded to date, but depreciation is charged for the whole
            period. Profit and margin will look lower until the period is complete.
          </p>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Fleet management profit" description={PROFIT_FORMULAS.fleet}>
          <table className="w-full text-sm" aria-label="Fleet management profit statement">
            <tbody className="divide-y divide-slate-100">
              {statement.map(([name, value, sign]) => (
                <tr key={name}>
                  <th scope="row" className="py-1.5 text-left font-normal text-slate-700">
                    {sign === 'less' ? '− ' : ''}
                    {name}
                  </th>
                  <td className="py-1.5 text-right tabular-nums">{formatMoney(value)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-300">
                <th scope="row" className="py-2 text-left font-semibold">
                  = Fleet management profit
                </th>
                <td
                  className="py-2 text-right text-base font-semibold tabular-nums"
                  data-testid="fleet-profit"
                >
                  <MoneyText value={fleet.profit} />
                </td>
              </tr>
              <tr>
                <th scope="row" className="py-1.5 text-left font-normal text-slate-700">
                  Margin
                </th>
                <td className="py-1.5 text-right tabular-nums" data-testid="fleet-margin">
                  {margin(fleet.margin)}
                </td>
              </tr>
              <tr>
                <th scope="row" className="py-1.5 text-left font-normal text-slate-700">
                  Active assets
                </th>
                <td className="py-1.5 text-right tabular-nums">{report.activeAssets}</td>
              </tr>
            </tbody>
          </table>
          <p className="text-xs text-slate-600">
            Capital items recorded in the period: {formatMoney(fleet.capitalItems)} (not deducted).
            {fleet.unassignedRevenue.amountMinor > 0 &&
              ` Revenue includes ${formatMoney(fleet.unassignedRevenue)} not assigned to an asset.`}
          </p>
        </Card>

        <Card
          title="From asset profits to fleet profit"
          description="Fleet profit is not the sum of asset profits: shared and unassigned items are only counted at fleet level."
        >
          <table className="w-full text-sm" aria-label="Reconciliation">
            <tbody className="divide-y divide-slate-100">
              {(
                [
                  ['Sum of asset management profits', fleet.sumOfAssetProfits, ''],
                  ['Unassigned revenue', fleet.unassignedRevenue, '+ '],
                  ['Shared / fleet expenses', fleet.sharedExpenses, '− '],
                  ['Unassigned operating expenses', fleet.unassignedExpenses, '− '],
                ] as const
              ).map(([name, value, sign]) => (
                <tr key={name}>
                  <th scope="row" className="py-1.5 text-left font-normal text-slate-700">
                    {sign}
                    {name}
                  </th>
                  <td className="py-1.5 text-right tabular-nums">{formatMoney(value)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-300">
                <th scope="row" className="py-2 text-left font-semibold">
                  = Fleet management profit
                </th>
                <td className="py-2 text-right font-semibold tabular-nums">
                  <MoneyText value={fleet.profit} />
                </td>
              </tr>
            </tbody>
          </table>
        </Card>
      </div>

      <section aria-labelledby="asset-profit-heading">
        <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="asset-profit-heading" className="text-base font-semibold text-slate-900">
              Asset profitability
            </h2>
            <p className="text-sm text-slate-600">{PROFIT_FORMULAS.asset}</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showIdle}
              onChange={(e) => setShowIdle(e.target.checked)}
            />
            Include archived assets with no activity
          </label>
        </div>
        <DataTable
          table={table}
          caption={`Asset management profit, ${label}`}
          emptyMessage="No assets to report."
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-700">
          <p>Select an amount to see the records behind it. {PROFIT_FORMULAS.margin}</p>
          <Pager table={table} />
        </div>
      </section>

      <Card
        title="Export (CSV)"
        description="Spreadsheet files for analysis or sharing. They cannot be restored as a workspace; use a full backup for that. Revenue and expense exports include voided records, marked as voided."
      >
        <div className="flex flex-wrap gap-2">
          {exportButton('profit', 'Asset & fleet profit')}
          {exportButton('revenue', 'Revenue detail')}
          {exportButton('expenses', 'Expense detail')}
        </div>
        {exportCsv.isSuccess && (
          <p className="text-sm text-green-800" role="status">
            Saved {exportCsv.data.fileName}. It may contain sensitive business information.
          </p>
        )}
        {exportCsv.isError && (
          <Alert tone="danger" title="Export failed">
            <p>{exportCsv.error.message}</p>
          </Alert>
        )}
      </Card>

      <Card title="Formulas and assumptions">
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>{PROFIT_FORMULAS.asset}</li>
          <li>{PROFIT_FORMULAS.fleet}</li>
          <li>{PROFIT_FORMULAS.margin}</li>
          <li>{DEPRECIATION_IN_PERIOD_RULE}</li>
          {REPORT_ASSUMPTIONS.map((a) => (
            <li key={a}>{a}</li>
          ))}
          <li>
            Figures cover only this device’s local workspace. Nothing is combined across devices.
          </li>
        </ul>
      </Card>
    </div>
  );
}
