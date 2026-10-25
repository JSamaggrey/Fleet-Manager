import { describe, expect, it } from 'vitest';
import {
  addMonths,
  calendarDateInTimeZone,
  compareYearMonth,
  currentYearMonth,
  monthsBetween,
  yearMonthSchema,
} from './year-month';

describe('year-month arithmetic', () => {
  it('adds months across year boundaries', () => {
    expect(addMonths('2025-11', 3)).toBe('2026-02');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-06', 0)).toBe('2026-06');
  });

  it('counts months between periods', () => {
    expect(monthsBetween('2025-11', '2026-02')).toBe(3);
    expect(monthsBetween('2026-02', '2025-11')).toBe(-3);
    expect(compareYearMonth('2026-01', '2025-12')).toBeGreaterThan(0);
  });

  it('validates the format', () => {
    expect(yearMonthSchema.safeParse('2026-13').success).toBe(false);
    expect(yearMonthSchema.safeParse('2026-1').success).toBe(false);
    expect(yearMonthSchema.safeParse('2026-12').success).toBe(true);
  });

  it('uses the business time zone for "today"', () => {
    // 23:30 UTC on 31 Jan is still January in Accra but already February in Lagos (UTC+1).
    const now = new Date('2026-01-31T23:30:00.000Z');
    expect(calendarDateInTimeZone(now, 'Africa/Accra')).toBe('2026-01-31');
    expect(currentYearMonth(now, 'Africa/Accra')).toBe('2026-01');
    expect(currentYearMonth(now, 'Africa/Lagos')).toBe('2026-02');
  });
});
