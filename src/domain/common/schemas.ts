import { z } from 'zod';

/** UTC ISO-8601 timestamp as produced by `Date.prototype.toISOString()`. */
export const isoTimestampSchema = z.iso.datetime();

export const idSchema = z.uuid();

/** Optional free text: trimmed, stored as null when empty. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters.`)
    .nullable()
    .transform((v) => (v === '' ? null : v));

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
