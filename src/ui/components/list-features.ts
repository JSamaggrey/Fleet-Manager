import {
  columnFilteringFeature,
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
  type ReactTable,
  type RowData,
} from '@tanstack/react-table';

/** Features shared by every list page: search, sorting, pagination. */
export const listFeatures = tableFeatures({
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

export type ListTable<TData extends RowData> = ReactTable<typeof listFeatures, TData>;

/** Column meta understood by DataTable. */
export interface ColumnMeta {
  /** Right-aligned with tabular figures. */
  numeric?: boolean;
  /** Allow wrapping (long text such as names); other columns stay on one line. */
  wrap?: boolean;
}
