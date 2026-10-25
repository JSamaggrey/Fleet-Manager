import { z } from 'zod';

/** UTC ISO-8601 timestamp as produced by `Date.prototype.toISOString()`. */
export const isoTimestampSchema = z.iso.datetime();

export const idSchema = z.uuid();

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
