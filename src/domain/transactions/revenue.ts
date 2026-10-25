import { z } from 'zod';
import { idSchema, isoTimestampSchema, optionalText } from '../common/schemas';
import { moneySchema } from '../money';
import { calendarDateSchema } from '../periods';
import { paymentStatusSchema, positiveMoneySchema, voidInfoSchema } from './common';

/** Distance or quantity as a decimal string (no floating point), e.g. "125.5". */
export const quantitySchema = z
  .string()
  .trim()
  .regex(/^\d{1,9}(\.\d{1,3})?$/, 'Use a number with up to 3 decimals, e.g. 125.5.')
  .refine((v) => Number(v) > 0, 'Quantity must be greater than zero.');

/** Fields the user enters for a trip/job. */
const revenueDetailsShape = {
  serviceDate: calendarDateSchema,
  reference: z
    .string()
    .trim()
    .min(1, 'Enter a trip, job or contract reference.')
    .max(60, 'Use at most 60 characters.'),
  /** Null means unassigned: allowed, but listed as an exception until assigned. */
  assetId: idSchema.nullable(),
  customer: optionalText(120),
  description: optionalText(500),
  origin: optionalText(120),
  destination: optionalText(120),
  quantity: quantitySchema.nullable(),
  quantityUnit: optionalText(20),
  rate: moneySchema.nullable(),
  amount: positiveMoneySchema,
  paymentStatus: paymentStatusSchema.nullable(),
  notes: optionalText(2000),
};

export const revenueDetailsSchema = z.strictObject(revenueDetailsShape);
export type RevenueDetails = z.infer<typeof revenueDetailsSchema>;

export const revenueEntrySchema = z.strictObject({
  id: idSchema,
  workspaceId: idSchema,
  ...revenueDetailsShape,
  void: voidInfoSchema.nullable(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});

export type RevenueEntry = z.infer<typeof revenueEntrySchema>;
