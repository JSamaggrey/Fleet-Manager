import { z } from 'zod';

/** A calendar month, 'YYYY-MM'. Depreciation and period close work in whole months. */
export type YearMonth = string;

export const yearMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a month in the form YYYY-MM.');

/** A calendar date without time zone, 'YYYY-MM-DD'. */
export const calendarDateSchema = z.iso.date('Use a date in the form YYYY-MM-DD.');

function toIndex(ym: YearMonth): number {
  const [year, month] = ym.split('-').map(Number);
  if (year === undefined || month === undefined || !yearMonthSchema.safeParse(ym).success) {
    throw new Error(`Invalid month "${ym}".`);
  }
  return year * 12 + (month - 1);
}

function fromIndex(index: number): YearMonth {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

export function addMonths(ym: YearMonth, months: number): YearMonth {
  return fromIndex(toIndex(ym) + months);
}

/** Number of months from `from` to `to` (0 when equal, negative when `to` is earlier). */
export function monthsBetween(from: YearMonth, to: YearMonth): number {
  return toIndex(to) - toIndex(from);
}

export function compareYearMonth(a: YearMonth, b: YearMonth): number {
  return toIndex(a) - toIndex(b);
}

export function yearMonthOfDate(date: string): YearMonth {
  return date.slice(0, 7);
}

/** Today's calendar date in the business time zone. */
export function calendarDateInTimeZone(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function currentYearMonth(now: Date, timeZone: string): YearMonth {
  return yearMonthOfDate(calendarDateInTimeZone(now, timeZone));
}

export function formatYearMonth(ym: YearMonth): string {
  const [year, month] = ym.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, 1)));
}
