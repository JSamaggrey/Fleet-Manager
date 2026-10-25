import type { RowData } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { FOCUS_RING } from './Button';
import type { ColumnMeta, ListTable } from './list-features';

const metaOf = (meta: unknown) => (meta ?? {}) as ColumnMeta;

/** A sortable table with accessible headers. Rows can be dimmed (e.g. voided records). */
export function DataTable<TData extends RowData>({
  table,
  caption,
  emptyMessage,
  isMuted,
}: {
  table: ListTable<TData>;
  caption: string;
  emptyMessage: string;
  isMuted?: (row: TData) => boolean;
}) {
  const rows = table.getRowModel().rows;
  return (
    <div
      className={`overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm ${FOCUS_RING}`}
      // Focusable so keyboard users can scroll a wide table sideways.
      tabIndex={0}
      role="region"
      aria-label={caption}
    >
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-slate-50 text-left text-slate-700">
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => {
                const sorted = header.column.getIsSorted();
                const { numeric } = metaOf(header.column.columnDef.meta);
                return (
                  <th
                    key={header.id}
                    scope="col"
                    aria-sort={
                      sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'
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
          {rows.map((row) => (
            <tr
              key={row.id}
              className={isMuted?.(row.original) ? 'bg-slate-50 text-slate-500' : ''}
            >
              {row.getAllCells().map((cell) => {
                const { numeric, wrap } = metaOf(cell.column.columnDef.meta);
                return (
                  <td
                    key={cell.id}
                    className={`px-4 py-2 ${numeric ? 'text-right tabular-nums' : ''} ${wrap ? '' : 'whitespace-nowrap'}`}
                  >
                    <table.FlexRender cell={cell} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {table.getPrePaginatedRowModel().rows.length === 0 && (
        <p className="p-6 text-center text-sm text-slate-600">{emptyMessage}</p>
      )}
    </div>
  );
}

export function Pager<TData extends RowData>({ table }: { table: ListTable<TData> }) {
  return (
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
  );
}
