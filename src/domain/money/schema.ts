import { z } from 'zod';
import { isCurrencyCode, type CurrencyCode } from './currency';

export const currencyCodeSchema = z.custom<CurrencyCode>(isCurrencyCode, 'Unsupported currency.');

/** Persisted money: integer minor units plus explicit currency (ADR 0002). */
export const moneySchema = z.strictObject({
  amountMinor: z.number().refine(Number.isSafeInteger, 'Amount must be whole minor units.'),
  currency: currencyCodeSchema,
});
