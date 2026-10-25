import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { describeRange, isValidRange, type PeriodKind } from '@/domain/periods';
import { Button } from '../components/Button';
import { INPUT_CLASS } from '../components/Field';
import type { ReportPeriod } from './report-period';

const KIND_LABEL: Record<PeriodKind, string> = {
  week: 'Week',
  month: 'Month',
  quarter: 'Quarter',
  year: 'Year',
  custom: 'Custom range',
};

export function PeriodPicker({ period }: { period: ReportPeriod }) {
  const { kind, range } = period;
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const customValid = isValidRange({ from, to });

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label htmlFor="report-kind" className="mb-1 block text-sm font-medium text-slate-800">
          Period
        </label>
        <select
          id="report-kind"
          value={kind}
          onChange={(e) => {
            const next = e.target.value as PeriodKind;
            setFrom(range.from);
            setTo(range.to);
            period.setKind(next);
          }}
          className={INPUT_CLASS}
        >
          {Object.entries(KIND_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {kind === 'custom' ? (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (customValid) period.setCustom({ from, to });
          }}
        >
          <div>
            <label htmlFor="report-from" className="mb-1 block text-sm font-medium text-slate-800">
              From
            </label>
            <input
              id="report-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label htmlFor="report-to" className="mb-1 block text-sm font-medium text-slate-800">
              To (inclusive)
            </label>
            <input
              id="report-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
          <Button type="submit" variant="secondary" disabled={!customValid}>
            Apply
          </Button>
          {!customValid && (
            <p className="w-full text-sm text-red-700">
              Choose a start date on or before the end date.
            </p>
          )}
        </form>
      ) : (
        <div className="flex items-center gap-2">
          <Button variant="secondary" aria-label="Previous period" onClick={() => period.shift(-1)}>
            <ChevronLeft aria-hidden="true" className="size-4" />
            Previous
          </Button>
          <p
            className="min-w-40 text-center text-base font-semibold text-slate-900"
            aria-live="polite"
          >
            {describeRange(kind, range)}
          </p>
          <Button variant="secondary" aria-label="Next period" onClick={() => period.shift(1)}>
            Next
            <ChevronRight aria-hidden="true" className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
