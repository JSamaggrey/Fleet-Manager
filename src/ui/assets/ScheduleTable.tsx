import type { DepreciationLine, PlannedLine } from '@/domain/depreciation';
import { formatMoney } from '@/domain/money';
import { compareYearMonth, formatYearMonth, type YearMonth } from '@/domain/periods';

type Line = PlannedLine | DepreciationLine;

function periodStatus(
  period: YearMonth,
  closedThrough: YearMonth | null,
  current: YearMonth | null,
) {
  if (closedThrough !== null && compareYearMonth(period, closedThrough) <= 0) return 'Closed';
  if (current !== null && compareYearMonth(period, current) > 0) return 'Projected';
  return 'Open';
}

/** Monthly schedule lines with period status. Scrolls inside its own box for long lives. */
export function ScheduleTable({
  lines,
  closedThrough,
  currentPeriod,
  caption,
  maxHeightClass = 'max-h-[28rem]',
}: {
  lines: readonly Line[];
  closedThrough: YearMonth | null;
  currentPeriod: YearMonth | null;
  caption: string;
  maxHeightClass?: string;
}) {
  return (
    <div
      className={`overflow-auto rounded-md border border-slate-200 ${maxHeightClass}`}
      tabIndex={0}
      role="region"
      aria-label={caption}
    >
      <table className="min-w-full text-sm tabular-nums">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-slate-50 text-left text-slate-700">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Month
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              #
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Opening book value
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Depreciation
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Accumulated
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Closing book value
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Months left
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {lines.map((line) => {
            const status = periodStatus(line.period, closedThrough, currentPeriod);
            const isCurrent = currentPeriod === line.period;
            return (
              <tr
                key={line.period}
                className={isCurrent ? 'bg-blue-50' : undefined}
                aria-current={isCurrent ? 'date' : undefined}
              >
                <td className="px-3 py-1.5 whitespace-nowrap">{formatYearMonth(line.period)}</td>
                <td className="px-3 py-1.5 text-slate-600">{line.periodNumber}</td>
                <td className="px-3 py-1.5 text-right">{formatMoney(line.openingBookValue)}</td>
                <td className="px-3 py-1.5 text-right font-medium">{formatMoney(line.charge)}</td>
                <td className="px-3 py-1.5 text-right">{formatMoney(line.accumulated)}</td>
                <td className="px-3 py-1.5 text-right">{formatMoney(line.closingBookValue)}</td>
                <td className="px-3 py-1.5 text-right text-slate-600">{line.remainingMonths}</td>
                <td className="px-3 py-1.5">
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                      status === 'Closed'
                        ? 'bg-slate-200 text-slate-800'
                        : status === 'Projected'
                          ? 'text-slate-600'
                          : 'bg-green-100 text-green-900'
                    }`}
                  >
                    {status}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
