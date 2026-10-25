import { ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { DEPRECIATION_CONVENTION } from '@/domain/depreciation';
import { formatMoney } from '@/domain/money';
import {
  addMonths,
  compareYearMonth,
  currentYearMonth,
  formatYearMonth,
  yearMonthSchema,
} from '@/domain/periods';
import type { Workspace } from '@/domain/workspace';
import { Alert } from '../components/Alert';
import { Button, FOCUS_RING } from '../components/Button';
import { Card, PageHeader } from '../components/Card';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Field, INPUT_CLASS } from '../components/Field';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { useClosePeriods, usePeriodReport } from '../queries';
import { useServices } from '../services';

export function DepreciationPage({ workspace }: { workspace: Workspace }) {
  const { now } = useServices();
  const thisMonth = currentYearMonth(now(), workspace.settings.timeZone);
  const [period, setPeriod] = useState(thisMonth);
  const report = usePeriodReport(period);

  return (
    <>
      <PageHeader
        title="Depreciation"
        description="Depreciation charged per month across all assets in this workspace (GHS). Non-cash management cost."
      />

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <Button
          variant="secondary"
          onClick={() => setPeriod(addMonths(period, -1))}
          aria-label="Previous month"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
        </Button>
        <div>
          <label htmlFor="period" className="mb-1 block text-sm font-medium text-slate-800">
            Month
          </label>
          <input
            id="period"
            type="month"
            value={period}
            onChange={(e) => {
              if (yearMonthSchema.safeParse(e.target.value).success) setPeriod(e.target.value);
            }}
            className={`${INPUT_CLASS} w-44`}
          />
        </div>
        <Button
          variant="secondary"
          onClick={() => setPeriod(addMonths(period, 1))}
          aria-label="Next month"
        >
          <ChevronRight aria-hidden="true" className="size-4" />
        </Button>
        {period !== thisMonth && (
          <Button variant="ghost" onClick={() => setPeriod(thisMonth)}>
            This month
          </Button>
        )}
      </div>

      {report.isPending && <LoadingState label="Loading depreciation…" />}
      {report.isError && (
        <ErrorState title="Depreciation could not be loaded" error={report.error} />
      )}
      {report.data && (
        <div className="space-y-6">
          <p className="text-sm text-slate-700">
            <strong>{formatYearMonth(report.data.period)}</strong>:{' '}
            {report.data.closed ? (
              <span className="inline-flex items-center gap-1">
                <Lock aria-hidden="true" className="size-3.5" /> closed
              </span>
            ) : compareYearMonth(report.data.period, thisMonth) > 0 ? (
              'projected (future month)'
            ) : (
              'open'
            )}{' '}
            · total depreciation <strong>{formatMoney(report.data.totalCharge)}</strong>
          </p>

          {report.data.rows.length === 0 ? (
            <EmptyState title="No depreciation in this month">
              No asset has a scheduled charge for {formatYearMonth(report.data.period)}.
            </EmptyState>
          ) : (
            <div
              className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm"
              tabIndex={0}
              role="region"
              aria-label={`Depreciation for ${formatYearMonth(report.data.period)}`}
            >
              <table className="min-w-full divide-y divide-slate-200 text-sm tabular-nums">
                <caption className="sr-only">
                  Depreciation for {formatYearMonth(report.data.period)}
                </caption>
                <thead className="bg-slate-50 text-left text-slate-700">
                  <tr>
                    <th scope="col" className="px-4 py-2 font-medium">
                      Asset
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      Category
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">
                      Opening book value
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">
                      Depreciation
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">
                      Accumulated
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">
                      Closing book value
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.data.rows.map(({ asset, categoryName, line }) => (
                    <tr key={asset.id}>
                      <td className="px-4 py-2">
                        <Link
                          to={`/assets/${asset.id}`}
                          className={`font-medium text-blue-800 hover:underline ${FOCUS_RING}`}
                        >
                          {asset.code}
                        </Link>{' '}
                        <span className="text-slate-600">{asset.name}</span>
                        {asset.status === 'archived' && (
                          <span className="ml-1 text-xs text-slate-500">(archived)</span>
                        )}
                      </td>
                      <td className="px-4 py-2">{categoryName}</td>
                      <td className="px-4 py-2 text-right">{formatMoney(line.openingBookValue)}</td>
                      <td className="px-4 py-2 text-right font-medium">
                        {formatMoney(line.charge)}
                      </td>
                      <td className="px-4 py-2 text-right">{formatMoney(line.accumulated)}</td>
                      <td className="px-4 py-2 text-right">{formatMoney(line.closingBookValue)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 font-semibold">
                  <tr>
                    <th scope="row" colSpan={3} className="px-4 py-2 text-left">
                      Total
                    </th>
                    <td className="px-4 py-2 text-right">{formatMoney(report.data.totalCharge)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <p className="text-xs text-slate-600">{DEPRECIATION_CONVENTION}</p>

          <ClosePeriodsCard closedThrough={report.data.closedThrough} thisMonth={thisMonth} />
        </div>
      )}
    </>
  );
}

function ClosePeriodsCard({
  closedThrough,
  thisMonth,
}: {
  closedThrough: string | null;
  thisMonth: string;
}) {
  const close = useClosePeriods();
  const lastEnded = addMonths(thisMonth, -1);
  const [through, setThrough] = useState(lastEnded);
  const [open, setOpen] = useState(false);
  const canClose = closedThrough === null || compareYearMonth(lastEnded, closedThrough) > 0;
  const valid =
    yearMonthSchema.safeParse(through).success &&
    compareYearMonth(through, thisMonth) < 0 &&
    (closedThrough === null || compareYearMonth(through, closedThrough) > 0);

  return (
    <Card
      title="Close depreciation months"
      description={
        closedThrough
          ? `Closed through ${formatYearMonth(closedThrough)}. Closed months are never recalculated; later revisions apply from the first open month.`
          : 'No months are closed. Until you close months, corrections to an asset regenerate its whole schedule.'
      }
    >
      {canClose ? (
        <div className="flex flex-wrap items-end gap-3">
          <Field
            label="Close through (inclusive)"
            hint="Only months that have ended can be closed."
          >
            {(control) => (
              <input
                {...control}
                type="month"
                value={through}
                max={lastEnded}
                onChange={(e) => setThrough(e.target.value)}
                className={`${INPUT_CLASS} w-44`}
              />
            )}
          </Field>
          <Button variant="secondary" disabled={!valid} onClick={() => setOpen(true)}>
            <Lock aria-hidden="true" className="size-4" />
            Close months…
          </Button>
        </div>
      ) : (
        <p className="text-sm text-slate-700">All ended months are already closed.</p>
      )}
      {close.isSuccess && (
        <Alert tone="success" title={`Closed through ${formatYearMonth(close.data)}`} />
      )}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Close depreciation through ${valid ? formatYearMonth(through) : ''}?`}
        description={
          <>
            <p>
              Depreciation figures for every asset up to and including this month will be locked.
              This cannot be undone.
            </p>
            <p>
              Later changes to residual value or useful life will apply only from the following
              month.
            </p>
          </>
        }
        confirmLabel="Close months"
        pending={close.isPending}
        onConfirm={() => close.mutate(through, { onSettled: () => setOpen(false) })}
      />
      {close.isError && (
        <Alert tone="danger" title="Not closed">
          <p>{close.error.message}</p>
        </Alert>
      )}
    </Card>
  );
}
