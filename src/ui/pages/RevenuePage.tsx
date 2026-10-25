import {
  createColumnHelper,
  useTable,
  type PaginationState,
  type SortingState,
} from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { RevenueRow } from '@/application/revenue-service';
import { formatMoney } from '@/domain/money';
import {
  PAYMENT_STATUS_LABEL,
  RECOGNITION_BASIS,
  isDateInRange,
  isVoided,
  summarizeActivity,
} from '@/domain/transactions';
import { PageHeader } from '../components/Card';
import { DataTable, Pager } from '../components/DataTable';
import { listFeatures } from '../components/list-features';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { useAssets, useRevenueList } from '../queries';
import {
  AssetCell,
  FilterField,
  PRIMARY_LINK,
  TEXT_LINK,
  UnassignedBadge,
  VoidedBadge,
} from '../transactions/list-controls';
import { assetOptions } from '../transactions/list-helpers';
import { UNASSIGNED } from '../transactions/form-values';

const helper = createColumnHelper<typeof listFeatures, RevenueRow>();

const columns = helper.columns([
  helper.accessor((row) => row.entry.serviceDate, {
    id: 'date',
    header: 'Service date',
    sortFn: 'basic',
  }),
  helper.accessor((row) => row.entry.reference, {
    id: 'reference',
    header: 'Reference',
    sortFn: 'alphanumeric',
    cell: (info) => (
      <Link to={`/revenue/${info.row.original.entry.id}`} className={TEXT_LINK}>
        {info.getValue()}
      </Link>
    ),
  }),
  helper.accessor((row) => row.asset?.code ?? 'Unassigned', {
    id: 'asset',
    header: 'Asset',
    sortFn: 'alphanumeric',
    cell: (info) => {
      const { asset } = info.row.original;
      return asset ? <AssetCell asset={asset} /> : <UnassignedBadge />;
    },
  }),
  helper.accessor((row) => row.entry.customer ?? '', {
    id: 'customer',
    header: 'Customer',
    sortFn: 'alphanumeric',
    meta: { wrap: true },
  }),
  helper.accessor(
    (row) =>
      [row.entry.origin, row.entry.destination].filter(Boolean).join(' → ') ||
      (row.entry.description ?? ''),
    { id: 'details', header: 'Route / description', sortFn: 'alphanumeric', meta: { wrap: true } },
  ),
  helper.accessor((row) => row.entry.amount.amountMinor, {
    id: 'amount',
    header: 'Amount',
    sortFn: 'basic',
    enableGlobalFilter: false,
    cell: (info) => formatMoney(info.row.original.entry.amount),
    meta: { numeric: true },
  }),
  helper.accessor(
    (row) =>
      row.entry.void
        ? 'Voided'
        : row.entry.paymentStatus
          ? PAYMENT_STATUS_LABEL[row.entry.paymentStatus]
          : '',
    {
      id: 'status',
      header: 'Status',
      sortFn: 'alphanumeric',
      cell: (info) =>
        info.row.original.entry.void ? (
          <VoidedBadge />
        ) : (
          info.getValue() || <span className="text-slate-400">—</span>
        ),
    },
  ),
]);

type StatusFilter = 'active' | 'voided' | 'all';

export function RevenuePage() {
  const revenue = useRevenueList();
  const assets = useAssets();
  const [params] = useSearchParams();
  const [assetFilter, setAssetFilter] = useState(params.get('asset') ?? '');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'date', desc: true }]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 });

  const rows = revenue.data;
  const data = useMemo(
    () =>
      (rows ?? []).filter(
        ({ entry }) =>
          (statusFilter === 'all' || (statusFilter === 'voided') === isVoided(entry)) &&
          (assetFilter === '' ||
            (assetFilter === UNASSIGNED
              ? entry.assetId === null
              : entry.assetId === assetFilter)) &&
          isDateInRange(entry.serviceDate, { from: from || null, to: to || null }),
      ),
    [rows, statusFilter, assetFilter, from, to],
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
    getRowId: (row) => row.entry.id,
  });

  const shown = table.getPrePaginatedRowModel().rows.map((r) => r.original.entry);
  const totals = summarizeActivity(shown, [], 'GHS');
  const voidedShown = shown.filter(isVoided).length;
  const assetChoices = assetOptions(assets.data?.items ?? []);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Revenue" description={RECOGNITION_BASIS} />
        <Link
          to={
            assetFilter && assetFilter !== UNASSIGNED
              ? `/revenue/new?asset=${assetFilter}`
              : '/revenue/new'
          }
          className={PRIMARY_LINK}
        >
          <Plus aria-hidden="true" className="size-4" />
          Record revenue
        </Link>
      </div>

      {revenue.isPending && <LoadingState label="Loading revenue…" />}
      {revenue.isError && (
        <ErrorState
          title="Revenue could not be loaded"
          error={revenue.error}
          onRetry={() => void revenue.refetch()}
        />
      )}
      {rows && rows.length === 0 && (
        <EmptyState title="No revenue recorded yet">
          Record a trip, job or contract amount against the asset that earned it.
        </EmptyState>
      )}

      {rows && rows.length > 0 && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <FilterField id="revenue-search" label="Search">
              {(p) => (
                <input
                  {...p}
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Reference, customer, route"
                />
              )}
            </FilterField>
            <FilterField id="revenue-asset" label="Asset">
              {(p) => (
                <select {...p} value={assetFilter} onChange={(e) => setAssetFilter(e.target.value)}>
                  <option value="">All assets</option>
                  <option value={UNASSIGNED}>Unassigned only</option>
                  {assetChoices.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
            </FilterField>
            <FilterField id="revenue-status" label="Status">
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
            <FilterField id="revenue-from" label="From (service date)">
              {(p) => (
                <input {...p} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              )}
            </FilterField>
            <FilterField id="revenue-to" label="To (inclusive)">
              {(p) => (
                <input {...p} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              )}
            </FilterField>
          </div>

          <DataTable
            table={table}
            caption="Revenue entries, sortable by column"
            emptyMessage="No revenue matches these filters."
            isMuted={(row) => isVoided(row.entry)}
          />

          <div className="mt-4 flex flex-wrap items-center justify-between gap-4 text-sm text-slate-700">
            <p>
              {shown.length} entr{shown.length === 1 ? 'y' : 'ies'} · total{' '}
              <strong data-testid="revenue-total">{formatMoney(totals.revenue)}</strong>
              {voidedShown > 0 && ` (excludes ${voidedShown} voided)`}
              {totals.unassignedRevenue.amountMinor > 0 &&
                ` · ${formatMoney(totals.unassignedRevenue)} unassigned`}
            </p>
            <Pager table={table} />
          </div>
        </>
      )}
    </>
  );
}
