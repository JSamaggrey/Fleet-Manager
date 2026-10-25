import type { YearMonth } from './year-month';

/** Inclusive calendar-date range, 'YYYY-MM-DD' at both ends. */
export interface CalendarRange {
  from: string;
  to: string;
}

export type PeriodKind = 'week' | 'month' | 'quarter' | 'year' | 'custom';

const DAY_MS = 86_400_000;

function toUtc(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined || Number.isNaN(y + m + d)) {
    throw new Error(`Invalid date "${date}".`);
  }
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return fromUtc(toUtc(date) + days * DAY_MS);
}

/** Number of days from `from` to `to`, both included. */
export function daysInclusive(range: CalendarRange): number {
  return Math.round((toUtc(range.to) - toUtc(range.from)) / DAY_MS) + 1;
}

export function daysInMonth(ym: YearMonth): number {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, m ?? 1, 0)).getUTCDate();
}

export function monthRange(ym: YearMonth): CalendarRange {
  return { from: `${ym}-01`, to: `${ym}-${String(daysInMonth(ym)).padStart(2, '0')}` };
}

/** 0 = Sunday … 6 = Saturday, as in workspace settings. */
function weekday(date: string): number {
  return new Date(toUtc(date)).getUTCDay();
}

/** The week, month, quarter or year containing `date`. */
export function periodContaining(
  kind: Exclude<PeriodKind, 'custom'>,
  date: string,
  weekStartsOn: number,
): CalendarRange {
  const [y, m] = date.split('-').map(Number) as [number, number];
  switch (kind) {
    case 'week': {
      const from = addDays(date, -((weekday(date) - weekStartsOn + 7) % 7));
      return { from, to: addDays(from, 6) };
    }
    case 'month':
      return monthRange(date.slice(0, 7));
    case 'quarter': {
      const first = Math.floor((m - 1) / 3) * 3 + 1;
      const start = `${y}-${String(first).padStart(2, '0')}`;
      const end = `${y}-${String(first + 2).padStart(2, '0')}`;
      return { from: monthRange(start).from, to: monthRange(end).to };
    }
    case 'year':
      return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
}

/** The previous (-1) or next (+1) period of the same kind. */
export function shiftPeriod(
  kind: Exclude<PeriodKind, 'custom'>,
  range: CalendarRange,
  direction: -1 | 1,
  weekStartsOn: number,
): CalendarRange {
  const anchor = direction === -1 ? addDays(range.from, -1) : addDays(range.to, 1);
  return periodContaining(kind, anchor, weekStartsOn);
}

/** Each calendar month the range touches, with how many of its days fall inside the range. */
export function monthsInRange(
  range: CalendarRange,
): { period: YearMonth; days: number; daysInMonth: number }[] {
  const result = [];
  let cursor = range.from;
  while (cursor <= range.to) {
    const period = cursor.slice(0, 7);
    const month = monthRange(period);
    const end = month.to < range.to ? month.to : range.to;
    result.push({
      period,
      days: daysInclusive({ from: cursor, to: end }),
      daysInMonth: daysInMonth(period),
    });
    cursor = addDays(month.to, 1);
  }
  return result;
}

export function isValidRange(range: CalendarRange): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(range.from) &&
    /^\d{4}-\d{2}-\d{2}$/.test(range.to) &&
    range.from <= range.to
  );
}

/** e.g. "Mar 2026", "Q1 2026", "2026", "Week of 2 Mar 2026", or "1 Mar – 15 Apr 2026". */
export function describeRange(kind: PeriodKind, range: CalendarRange): string {
  const fmt = (date: string, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: 'UTC' }).format(new Date(toUtc(date)));
  const [y, m] = range.from.split('-').map(Number) as [number, number];
  switch (kind) {
    case 'month':
      return fmt(range.from, { month: 'short', year: 'numeric' });
    case 'quarter':
      return `Q${Math.floor((m - 1) / 3) + 1} ${y}`;
    case 'year':
      return String(y);
    case 'week':
      return `Week of ${fmt(range.from, { day: 'numeric', month: 'short', year: 'numeric' })}`;
    case 'custom':
      return `${fmt(range.from, { day: 'numeric', month: 'short', year: 'numeric' })} – ${fmt(range.to, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }
}
