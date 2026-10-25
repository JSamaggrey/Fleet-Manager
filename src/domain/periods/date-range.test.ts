import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysInMonth,
  daysInclusive,
  describeRange,
  isValidRange,
  monthsInRange,
  periodContaining,
  shiftPeriod,
} from './date-range';

const MONDAY = 1;
const SUNDAY = 0;

describe('periodContaining', () => {
  it('finds the Monday-start week, including across a month and year end', () => {
    // 2026-01-01 is a Thursday.
    expect(periodContaining('week', '2026-01-01', MONDAY)).toEqual({
      from: '2025-12-29',
      to: '2026-01-04',
    });
    // A Monday is the first day of its own week; a Sunday is the last.
    expect(periodContaining('week', '2026-03-02', MONDAY).from).toBe('2026-03-02');
    expect(periodContaining('week', '2026-03-08', MONDAY)).toEqual({
      from: '2026-03-02',
      to: '2026-03-08',
    });
  });

  it('honours a Sunday week start', () => {
    expect(periodContaining('week', '2026-03-08', SUNDAY)).toEqual({
      from: '2026-03-08',
      to: '2026-03-14',
    });
  });

  it('finds months (with leap years), quarters and years', () => {
    expect(periodContaining('month', '2028-02-10', MONDAY)).toEqual({
      from: '2028-02-01',
      to: '2028-02-29',
    });
    expect(periodContaining('month', '2026-02-10', MONDAY).to).toBe('2026-02-28');
    expect(periodContaining('quarter', '2026-05-31', MONDAY)).toEqual({
      from: '2026-04-01',
      to: '2026-06-30',
    });
    expect(periodContaining('quarter', '2026-12-31', MONDAY)).toEqual({
      from: '2026-10-01',
      to: '2026-12-31',
    });
    expect(periodContaining('year', '2026-07-04', MONDAY)).toEqual({
      from: '2026-01-01',
      to: '2026-12-31',
    });
  });
});

describe('shiftPeriod', () => {
  it('moves to the adjacent period of the same kind', () => {
    const q1 = periodContaining('quarter', '2026-02-01', MONDAY);
    expect(shiftPeriod('quarter', q1, -1, MONDAY)).toEqual({
      from: '2025-10-01',
      to: '2025-12-31',
    });
    expect(shiftPeriod('quarter', q1, 1, MONDAY)).toEqual({ from: '2026-04-01', to: '2026-06-30' });
    const jan = periodContaining('month', '2026-01-15', MONDAY);
    expect(shiftPeriod('month', jan, -1, MONDAY)).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    const week = periodContaining('week', '2026-01-01', MONDAY);
    expect(shiftPeriod('week', week, 1, MONDAY)).toEqual({ from: '2026-01-05', to: '2026-01-11' });
  });
});

describe('day arithmetic', () => {
  it('counts inclusive days and month lengths', () => {
    expect(daysInclusive({ from: '2026-01-01', to: '2026-01-01' })).toBe(1);
    expect(daysInclusive({ from: '2026-01-01', to: '2026-12-31' })).toBe(365);
    expect(daysInMonth('2026-02')).toBe(28);
    expect(daysInMonth('2028-02')).toBe(29);
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('splits a range into the months it touches', () => {
    expect(monthsInRange({ from: '2025-12-29', to: '2026-01-04' })).toEqual([
      { period: '2025-12', days: 3, daysInMonth: 31 },
      { period: '2026-01', days: 4, daysInMonth: 31 },
    ]);
    expect(monthsInRange({ from: '2026-01-01', to: '2026-03-31' }).map((m) => m.days)).toEqual([
      31, 28, 31,
    ]);
  });

  it('validates and describes ranges', () => {
    expect(isValidRange({ from: '2026-01-02', to: '2026-01-01' })).toBe(false);
    expect(isValidRange({ from: '2026-01-01', to: '2026-01-01' })).toBe(true);
    expect(isValidRange({ from: '', to: '2026-01-01' })).toBe(false);
    expect(describeRange('quarter', { from: '2026-04-01', to: '2026-06-30' })).toBe('Q2 2026');
    expect(describeRange('month', { from: '2026-03-01', to: '2026-03-31' })).toBe('Mar 2026');
    expect(describeRange('week', { from: '2026-03-02', to: '2026-03-08' })).toBe(
      'Week of 2 Mar 2026',
    );
  });
});
