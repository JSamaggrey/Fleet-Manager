import { z } from 'zod';
import { isoTimestampSchema } from '../common/schemas';
import { moneySchema } from '../money';

/**
 * Recognition basis (docs/product-defaults.md #3): revenue counts in the period of its service
 * date and expenses in the period of their expense date. Payment status is informational only.
 */
export const RECOGNITION_BASIS =
  'Service-date / incurred basis: revenue counts in the month of its service date and expenses in the month of their expense date. Payment status does not change this. Management figures, not cash receipts.';

export const VOID_REASON_MIN_LENGTH = 3;

/** Amounts on revenue and expense records are always positive; a void removes a record. */
export const positiveMoneySchema = moneySchema.refine(
  (m) => m.amountMinor > 0,
  'Amount must be greater than zero.',
);

export const voidReasonSchema = z
  .string()
  .trim()
  .min(VOID_REASON_MIN_LENGTH, 'Give a reason for voiding.')
  .max(500, 'Use at most 500 characters.');

/**
 * A voided record stays stored and visible with its reason, but no total includes it.
 * Voiding cannot be undone; record a new entry instead.
 */
export const voidInfoSchema = z.strictObject({
  voidedAt: isoTimestampSchema,
  reason: voidReasonSchema,
});

export type VoidInfo = z.infer<typeof voidInfoSchema>;

export const paymentStatusSchema = z.enum(['unpaid', 'part-paid', 'paid']);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  unpaid: 'Unpaid',
  'part-paid': 'Part paid',
  paid: 'Paid',
};

export function isVoided(record: { void: VoidInfo | null }): boolean {
  return record.void !== null;
}
