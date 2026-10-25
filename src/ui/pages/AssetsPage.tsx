import {
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_includesString,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  tableFeatures,
  useTable,
  type PaginationState,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { AssetSummary } from '@/application/asset-service';
import { formatMoney, sum } from '@/domain/money';
import { formatYearMonth } from '@/domain/periods';
import { FOCUS_RING } from '../components/Button';
import { Badge, PageHeader } from '../components/Card';
import { INPUT_CLASS } from '../components/Field';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { useAssets } from '../queries';

const features = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  rowSortingFeature,
  rowPaginationFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  filterFns: { includesString: filterFn_includesString },
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic },
});

const helper = createColumnHelper<typeof features, AssetSummary>();

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
  helper.accessor((row) => row.asset.name, { id: 'name', header: 'Name', sortFn: 'alphanumeric' }),
  helper.accessor((row) => row.categoryName, {
    id: 'category',
    header: 'Category',
    sortFn: 'alphanumeric',
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
    features,
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

          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <caption className="sr-only">Assets, sortable by column</caption>
              <thead className="bg-slate-50 text-left text-slate-700">
                {table.getHeaderGroups().map((group) => (
                  <tr key={group.id}>
                    {group.headers.map((header) => {
                      const sorted = header.column.getIsSorted();
                      const numeric = (
                        header.column.columnDef.meta as { numeric?: boolean } | undefined
                      )?.numeric;
                      return (
                        <th
                          key={header.id}
                          scope="col"
                          aria-sort={
                            sorted === 'asc'
                              ? 'ascending'
                              : sorted === 'desc'
                                ? 'descending'
                                : 'none'
                          }
                          className={`px-4 py-2 font-medium whitespace-nowrap ${numeric ? 'text-right' : ''}`}
                        >
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className={`inline-flex items-center gap-1 rounded ${FOCUS_RING}`}
                          >
                            <table.FlexRender header={header} />
                            {sorted === 'asc' ? (
                              <ArrowUp aria-hidden="true" className="size-3.5" />
                            ) : sorted === 'desc' ? (
                              <ArrowDown aria-hidden="true" className="size-3.5" />
                            ) : (
                              <ArrowUpDown aria-hidden="true" className="size-3.5 text-slate-400" />
                            )}
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y divide-slate-100">
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id}>
                    {row.getAllCells().map((cell) => {
                      const numeric = (
                        cell.column.columnDef.meta as { numeric?: boolean } | undefined
                      )?.numeric;
                      return (
                        <td
                          key={cell.id}
                          className={`px-4 py-2 ${numeric ? 'text-right tabular-nums' : ''} ${
                            cell.column.id === 'name' || cell.column.id === 'category'
                              ? ''
                              : 'whitespace-nowrap'
                          }`}
                        >
                          <table.FlexRender cell={cell} />
                          {cell.column.id === 'name' &&
                            row.original.asset.status === 'archived' && (
                              <span className="ml-2">
                                <Badge>Archived</Badge>
                              </span>
                            )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredRows.length === 0 && (
              <p className="p-6 text-center text-sm text-slate-600">
                No assets match these filters.
              </p>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-4 text-sm text-slate-700">
            <p>
              {filteredRows.length} asset{filteredRows.length === 1 ? '' : 's'} · total book value{' '}
              <strong>{formatMoney(totalBookValue)}</strong>
            </p>
            <div className="flex items-center gap-2">
              <span>
                Page {table.state.pagination.pageIndex + 1} of {Math.max(1, table.getPageCount())}
              </span>
              <button
                type="button"
                className={`rounded-md px-3 py-1.5 ring-1 ring-slate-300 disabled:text-slate-400 ${FOCUS_RING}`}
                disabled={!table.getCanPreviousPage()}
                onClick={() => table.previousPage()}
              >
                Previous
              </button>
              <button
                type="button"
                className={`rounded-md px-3 py-1.5 ring-1 ring-slate-300 disabled:text-slate-400 ${FOCUS_RING}`}
                disabled={!table.getCanNextPage()}
                onClick={() => table.nextPage()}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
