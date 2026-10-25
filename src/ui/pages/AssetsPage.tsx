import {
  createColumnHelper,
  useTable,
  type PaginationState,
  type SortingState,
} from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { AssetSummary } from '@/application/asset-service';
import { formatMoney, sum } from '@/domain/money';
import { formatYearMonth } from '@/domain/periods';
import { FOCUS_RING } from '../components/Button';
import { Badge, PageHeader } from '../components/Card';
import { DataTable, Pager } from '../components/DataTable';
import { listFeatures } from '../components/list-features';
import { INPUT_CLASS } from '../components/Field';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { useAssets } from '../queries';

const helper = createColumnHelper<typeof listFeatures, AssetSummary>();

const STATE_LABEL: Record<AssetSummary['position']['state'], string> = {
  'not-started': 'Not started',
  depreciating: 'Depreciating',
  'fully-depreciated': 'Fully depreciated',
};

const columns = helper.columns([
  helper.accessor((row) => row.asset.code, {
    id: 'code',
    header: 'Code',
    sortFn: 'alphanumeric',
    cell: (info) => (
      <Link
        to={`/assets/${info.row.original.asset.id}`}
        className={`font-medium text-blue-800 underline-offset-2 hover:underline ${FOCUS_RING}`}
      >
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
        {info.row.original.asset.status === 'archived' && (
          <span className="ml-2">
            <Badge>Archived</Badge>
          </span>
        )}
      </>
    ),
  }),
  helper.accessor((row) => row.categoryName, {
    id: 'category',
    header: 'Category',
    sortFn: 'alphanumeric',
    meta: { wrap: true },
  }),
  helper.accessor((row) => row.asset.vehicle?.registration ?? '', {
    id: 'registration',
    header: 'Registration',
    sortFn: 'alphanumeric',
    cell: (info) => info.getValue() || <span className="text-slate-400">—</span>,
  }),
  helper.accessor((row) => row.asset.depreciation.inServiceDate, {
    id: 'inService',
    header: 'In service',
    sortFn: 'basic',
    enableGlobalFilter: false,
  }),
  helper.accessor((row) => row.asset.depreciation.capitalizedCost.amountMinor, {
    id: 'cost',
    header: 'Cost',
    sortFn: 'basic',
    enableGlobalFilter: false,
    cell: (info) => formatMoney(info.row.original.asset.depreciation.capitalizedCost),
    meta: { numeric: true },
  }),
  helper.accessor((row) => row.position.bookValue.amountMinor, {
    id: 'bookValue',
    header: 'Book value',
    sortFn: 'basic',
    enableGlobalFilter: false,
    cell: (info) => formatMoney(info.row.original.position.bookValue),
    meta: { numeric: true },
  }),
  helper.accessor((row) => STATE_LABEL[row.position.state], {
    id: 'depreciation',
    header: 'Depreciation',
    sortFn: 'alphanumeric',
    enableGlobalFilter: false,
  }),
]);

type StatusFilter = 'active' | 'archived' | 'all';

export function AssetsPage() {
  const assets = useAssets();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [search, setSearch] = useState('');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'code', desc: false }]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 });

  const allItems = assets.data?.items;
  const categories = useMemo(
    () => [...new Set((allItems ?? []).map((i) => i.categoryName))].sort(),
    [allItems],
  );
  const data = useMemo(
    () =>
      (allItems ?? []).filter(
        (i) =>
          (statusFilter === 'all' || i.asset.status === statusFilter) &&
          (categoryFilter === '' || i.categoryName === categoryFilter),
      ),
    [allItems, statusFilter, categoryFilter],
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
    getRowId: (row) => row.asset.id,
  });

  const filteredRows = table.getPrePaginatedRowModel().rows;
  const totalBookValue = sum(
    filteredRows.map((r) => r.original.position.bookValue),
    'GHS',
  );

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Assets"
          description={
            assets.data
              ? `Book values at the end of ${formatYearMonth(assets.data.period)} (this month), in GHS.`
              : 'Vehicles and other business assets in this workspace.'
          }
        />
        <Link
          to="/assets/new"
          className={`inline-flex min-h-10 items-center gap-2 rounded-md bg-blue-700 px-4 text-sm font-medium text-white hover:bg-blue-800 ${FOCUS_RING}`}
        >
          <Plus aria-hidden="true" className="size-4" />
          Add asset
        </Link>
      </div>

      {assets.isPending && <LoadingState label="Loading assets…" />}
      {assets.isError && (
        <ErrorState
          title="Assets could not be loaded"
          error={assets.error}
          onRetry={() => void assets.refetch()}
        />
      )}

      {assets.data && assets.data.items.length === 0 && (
        <EmptyState title="No assets yet">
          Add your first vehicle or other asset to generate its depreciation schedule.
        </EmptyState>
      )}

      {assets.data && assets.data.items.length > 0 && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <div>
              <label
                htmlFor="asset-search"
                className="mb-1 block text-sm font-medium text-slate-800"
              >
                Search
              </label>
              <input
                id="asset-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Code, name, category, registration"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label
                htmlFor="asset-category"
                className="mb-1 block text-sm font-medium text-slate-800"
              >
                Category
              </label>
              <select
                id="asset-category"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className={INPUT_CLASS}
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="asset-status"
                className="mb-1 block text-sm font-medium text-slate-800"
              >
                Status
              </label>
              <select
                id="asset-status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className={INPUT_CLASS}
              >
                <option value="active">Active</option>
                <option value="archived">Archived</option>
                <option value="all">All</option>
              </select>
            </div>
          </div>

          <DataTable
            table={table}
            caption="Assets, sortable by column"
            emptyMessage="No assets match these filters."
          />

          <div className="mt-4 flex flex-wrap items-center justify-between gap-4 text-sm text-slate-700">
            <p>
              {filteredRows.length} asset{filteredRows.length === 1 ? '' : 's'} · total book value{' '}
              <strong>{formatMoney(totalBookValue)}</strong>
            </p>
            <Pager table={table} />
          </div>
        </>
      )}
    </>
  );
}
