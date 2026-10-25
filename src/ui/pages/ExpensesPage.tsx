import {
  createColumnHelper,
  useTable,
  type PaginationState,
  type SortingState,
} from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { ExpenseRow } from '@/application/expense-service';
import { formatMoney } from '@/domain/money';
import {
  RECOGNITION_BASIS,
  isDateInRange,
  isVoided,
  summarizeActivity,
  type Expense,
} from '@/domain/transactions';
import { Badge, PageHeader } from '../components/Card';
import { DataTable, Pager } from '../components/DataTable';
import { listFeatures } from '../components/list-features';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { useAssets, useExpenseCategories, useExpenseList } from '../queries';
import {
  AssetCell,
  FilterField,
  PRIMARY_LINK,
  TEXT_LINK,
  UnassignedBadge,
  VoidedBadge,
} from '../transactions/list-controls';
import { assetOptions } from '../transactions/list-helpers';

const helper = createColumnHelper<typeof listFeatures, ExpenseRow>();

const APPLIES_TO_LABEL: Record<Expense['assignment'], string> = {
  asset: 'Direct',
  shared: 'Shared / fleet',
  unassigned: 'Unassigned',
};

const columns = helper.columns([
  helper.accessor((row) => row.expense.expenseDate, {
    id: 'date',
    header: 'Date',
    sortFn: 'basic',
  }),
  helper.accessor((row) => row.categoryName, {
    id: 'category',
    header: 'Category',
    sortFn: 'alphanumeric',
    meta: { wrap: true },
    cell: (info) => (
      <Link to={`/expenses/${info.row.original.expense.id}`} className={TEXT_LINK}>
        {info.getValue()}
      </Link>
    ),
  }),
  helper.accessor(
    (row) =>
      row.expense.assignment === 'asset'
        ? (row.asset?.code ?? '')
        : APPLIES_TO_LABEL[row.expense.assignment],
    {
      id: 'appliesTo',
      header: 'Applies to',
      sortFn: 'alphanumeric',
      cell: (info) => {
        const { expense, asset } = info.row.original;
        if (expense.assignment === 'asset' && asset) return <AssetCell asset={asset} />;
        if (expense.assignment === 'unassigned') return <UnassignedBadge />;
        return <Badge tone="info">Shared / fleet</Badge>;
      },
    },
  ),
  helper.accessor((row) => row.expense.vendor ?? '', {
    id: 'vendor',
    header: 'Vendor',
    sortFn: 'alphanumeric',
    meta: { wrap: true },
  }),
  helper.accessor((row) => row.expense.description ?? row.expense.reference ?? '', {
    id: 'description',
    header: 'Description',
    sortFn: 'alphanumeric',
    meta: { wrap: true },
  }),
  helper.accessor((row) => row.expense.amount.amountMinor, {
    id: 'amount',
    header: 'Amount',
    sortFn: 'basic',
    enableGlobalFilter: false,
    cell: (info) => formatMoney(info.row.original.expense.amount),
    meta: { numeric: true },
  }),
  helper.accessor(
    (row) =>
      row.expense.void ? 'Voided' : row.expense.nature === 'capital' ? 'Capital' : 'Operating',
    {
      id: 'status',
      header: 'Type',
      sortFn: 'alphanumeric',
      cell: (info) => {
        const { expense } = info.row.original;
        if (expense.void) return <VoidedBadge />;
        return expense.nature === 'capital' ? <Badge>Capital</Badge> : 'Operating';
      },
    },
  ),
]);

type StatusFilter = 'active' | 'voided' | 'all';
type AppliesFilter = '' | 'direct' | 'shared' | 'unassigned' | `asset:${string}`;

export function ExpensesPage() {
  const expenses = useExpenseList();
  const assets = useAssets();
  const categories = useExpenseCategories();
  const [params] = useSearchParams();
  const initialAsset = params.get('asset');
  const [applies, setApplies] = useState<AppliesFilter>(
    initialAsset === 'unassigned' || initialAsset === 'shared'
      ? initialAsset
      : initialAsset
        ? `asset:${initialAsset}`
        : '',
  );
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'date', desc: true }]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 });

  const rows = expenses.data;
  const data = useMemo(
    () =>
      (rows ?? []).filter(({ expense }) => {
        const appliesOk =
          applies === '' ||
          (applies === 'direct' && expense.assignment === 'asset') ||
          applies === expense.assignment ||
          applies === `asset:${expense.assetId}`;
        return (
          appliesOk &&
          (statusFilter === 'all' || (statusFilter === 'voided') === isVoided(expense)) &&
          (categoryFilter === '' || expense.categoryId === categoryFilter) &&
          isDateInRange(expense.expenseDate, { from: from || null, to: to || null })
        );
      }),
    [rows, applies, statusFilter, categoryFilter, from, to],
  );

  const table = useTable({
    features: listFeatures,
    columns,
    data,
    state: { sorting, pagination, globalFilter: search },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onGlobalFilterChange: setSearch,
    globalFilterFn: 'includesString',
    enableSortingRemoval: false,
    getRowId: (row) => row.expense.id,
  });

  const shown = table.getPrePaginatedRowModel().rows.map((r) => r.original.expense);
  const totals = summarizeActivity([], shown, 'GHS');
  const voidedShown = shown.filter(isVoided).length;
  const assetChoices = assetOptions(assets.data?.items ?? []);
  const presetAsset = applies.startsWith('asset:') ? applies.slice(6) : '';

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Expenses" description={RECOGNITION_BASIS} />
        <Link
          to={presetAsset ? `/expenses/new?asset=${presetAsset}` : '/expenses/new'}
          className={PRIMARY_LINK}
        >
          <Plus aria-hidden="true" className="size-4" />
          Record expense
        </Link>
      </div>

      {expenses.isPending && <LoadingState label="Loading expenses…" />}
      {expenses.isError && (
        <ErrorState
          title="Expenses could not be loaded"
          error={expenses.error}
          onRetry={() => void expenses.refetch()}
        />
      )}
      {rows && rows.length === 0 && (
        <EmptyState title="No expenses recorded yet">
          Record fuel, repairs and other costs against an asset, or as a shared fleet cost.
        </EmptyState>
      )}

      {rows && rows.length > 0 && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <FilterField id="expense-search" label="Search">
              {(p) => (
                <input
                  {...p}
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Category, vendor, description"
                />
              )}
            </FilterField>
            <FilterField id="expense-applies" label="Applies to">
              {(p) => (
                <select
                  {...p}
                  value={applies}
                  onChange={(e) => setApplies(e.target.value as AppliesFilter)}
                >
                  <option value="">Everything</option>
                  <option value="direct">Direct (any asset)</option>
                  <option value="shared">Shared / fleet</option>
                  <option value="unassigned">Unassigned only</option>
                  {assetChoices.map((o) => (
                    <option key={o.value} value={`asset:${o.value}`}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
            </FilterField>
            <FilterField id="expense-category" label="Category">
              {(p) => (
                <select
                  {...p}
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                >
                  <option value="">All categories</option>
                  {(categories.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </FilterField>
            <FilterField id="expense-status" label="Status">
              {(p) => (
                <select
                  {...p}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                >
                  <option value="active">Not voided</option>
                  <option value="voided">Voided</option>
                  <option value="all">All</option>
                </select>
              )}
            </FilterField>
            <FilterField id="expense-from" label="From (expense date)">
              {(p) => (
                <input {...p} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              )}
            </FilterField>
            <FilterField id="expense-to" label="To (inclusive)">
              {(p) => (
                <input {...p} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              )}
            </FilterField>
          </div>

          <DataTable
            table={table}
            caption="Expenses, sortable by column"
            emptyMessage="No expenses match these filters."
            isMuted={(row) => isVoided(row.expense)}
          />

          <div className="mt-4 flex flex-wrap items-start justify-between gap-4 text-sm text-slate-700">
            <div>
              <p>
                {shown.length} expense{shown.length === 1 ? '' : 's'}
                {voidedShown > 0 && ` (${voidedShown} voided, excluded from totals)`}
              </p>
              <dl
                className="mt-1 flex flex-wrap gap-x-6 gap-y-1"
                aria-label="Totals for the expenses shown"
              >
                {(
                  [
                    ['Direct operating', totals.directExpenses],
                    ['Shared / fleet', totals.sharedExpenses],
                    ['Unassigned', totals.unassignedExpenses],
                    ['Capital (not operating)', totals.capitalItems],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="flex gap-1">
                    <dt>{label}:</dt>
                    <dd className="font-semibold tabular-nums">{formatMoney(value)}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <Pager table={table} />
          </div>
        </>
      )}
    </>
  );
}
