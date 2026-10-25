import { z } from 'zod';
import type { ExpenseInput } from '@/application/expense-service';
import type { RevenueInput } from '@/application/revenue-service';
import { multiply, parseMoney, toDecimalString, type Money } from '@/domain/money';
import {
  PAYMENT_METHODS,
  type Expense,
  type PaymentMethod,
  type PaymentStatus,
  type RevenueEntry,
} from '@/domain/transactions';
import { isMoneyText } from '../assets/form-values';

/**
 * Form-level schemas: strings as typed, for quick feedback. The domain schemas in the services
 * remain the authority and re-validate everything.
 */
const positiveAmount = z
  .string()
  .trim()
  .min(1, 'Enter the amount.')
  .refine(isMoneyText, 'Enter an amount such as 450 or 1,250.00 (up to 2 decimals).')
  .refine(
    (v) => !isMoneyText(v) || parseMoney(v, 'GHS').amountMinor > 0,
    'Amount must be greater than zero.',
  );

const QUANTITY_TEXT = /^(\d{1,9}(\.\d{1,3})?)?$/;

const paymentStatusField = z.enum(['', 'unpaid', 'part-paid', 'paid']);
const paymentMethodField = z.enum(['', ...PAYMENT_METHODS]);

/** '' = not chosen yet, 'unassigned' = explicitly unassigned, otherwise an asset id. */
export const UNASSIGNED = 'unassigned';

export const revenueFormSchema = z.object({
  serviceDate: z.string().min(1, 'Enter the service date.'),
  reference: z
    .string()
    .trim()
    .min(1, 'Enter a trip, job or contract reference.')
    .max(60, 'Use at most 60 characters.'),
  assetId: z.string().min(1, 'Choose the asset, or choose "Unassigned" to assign it later.'),
  customer: z.string(),
  description: z.string(),
  origin: z.string(),
  destination: z.string(),
  quantity: z
    .string()
    .trim()
    .regex(QUANTITY_TEXT, 'Use a number with up to 3 decimals, e.g. 125.5.')
    .refine((v) => v === '' || Number(v) > 0, 'Quantity must be greater than zero.'),
  quantityUnit: z.string(),
  rate: z
    .string()
    .trim()
    .refine((v) => v === '' || isMoneyText(v), 'Enter a rate such as 12.50.'),
  amount: positiveAmount,
  paymentStatus: paymentStatusField,
  notes: z.string(),
});

export type RevenueFormValues = z.infer<typeof revenueFormSchema>;

const moneyText = (m: Money | null) => (m === null ? '' : toDecimalString(m));
const orNull = <T extends string>(v: T | '') => (v === '' ? null : v);

export function emptyRevenueForm(today: string, assetId = ''): RevenueFormValues {
  return {
    serviceDate: today,
    reference: '',
    assetId,
    customer: '',
    description: '',
    origin: '',
    destination: '',
    quantity: '',
    quantityUnit: '',
    rate: '',
    amount: '',
    paymentStatus: '',
    notes: '',
  };
}

export function revenueToForm(entry: RevenueEntry): RevenueFormValues {
  return {
    serviceDate: entry.serviceDate,
    reference: entry.reference,
    assetId: entry.assetId ?? UNASSIGNED,
    customer: entry.customer ?? '',
    description: entry.description ?? '',
    origin: entry.origin ?? '',
    destination: entry.destination ?? '',
    quantity: entry.quantity ?? '',
    quantityUnit: entry.quantityUnit ?? '',
    rate: moneyText(entry.rate),
    amount: moneyText(entry.amount),
    paymentStatus: entry.paymentStatus ?? '',
    notes: entry.notes ?? '',
  };
}

export function formToRevenueInput(v: RevenueFormValues): RevenueInput {
  return {
    serviceDate: v.serviceDate,
    reference: v.reference,
    assetId: v.assetId === UNASSIGNED ? null : v.assetId,
    customer: v.customer,
    description: v.description,
    origin: v.origin,
    destination: v.destination,
    quantity: orNull(v.quantity.trim()),
    quantityUnit: v.quantityUnit,
    rate: v.rate.trim() === '' ? null : parseMoney(v.rate, 'GHS'),
    amount: parseMoney(v.amount, 'GHS'),
    paymentStatus: orNull(v.paymentStatus) as PaymentStatus | null,
    notes: v.notes,
  };
}

/** Quantity × rate rounded half-up to the pesewa, or null when either is missing/invalid. */
export function amountFromRate(quantity: string, rate: string): string | null {
  const q = quantity.trim();
  const r = rate.trim();
  if (q === '' || r === '' || !QUANTITY_TEXT.test(q) || !isMoneyText(r)) return null;
  return toDecimalString(multiply(parseMoney(r, 'GHS'), q));
}

export const expenseFormSchema = z
  .object({
    expenseDate: z.string().min(1, 'Enter the expense date.'),
    assignment: z.enum(['', 'asset', 'shared', 'unassigned']),
    assetId: z.string(),
    categoryId: z.string().min(1, 'Choose a category.'),
    nature: z.enum(['operating', 'capital']),
    vendor: z.string(),
    reference: z.string(),
    description: z.string(),
    amount: positiveAmount,
    paymentStatus: paymentStatusField,
    paymentMethod: paymentMethodField,
    notes: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.assignment === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['assignment'],
        message: 'Choose what this expense applies to.',
      });
    }
    if (v.assignment === 'asset' && v.assetId === '') {
      ctx.addIssue({ code: 'custom', path: ['assetId'], message: 'Choose the asset.' });
    }
  });

export type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

export function emptyExpenseForm(today: string, assetId = ''): ExpenseFormValues {
  return {
    expenseDate: today,
    assignment: assetId ? 'asset' : '',
    assetId,
    categoryId: '',
    nature: 'operating',
    vendor: '',
    reference: '',
    description: '',
    amount: '',
    paymentStatus: '',
    paymentMethod: '',
    notes: '',
  };
}

export function expenseToForm(expense: Expense): ExpenseFormValues {
  return {
    expenseDate: expense.expenseDate,
    assignment: expense.assignment,
    assetId: expense.assetId ?? '',
    categoryId: expense.categoryId,
    nature: expense.nature,
    vendor: expense.vendor ?? '',
    reference: expense.reference ?? '',
    description: expense.description ?? '',
    amount: moneyText(expense.amount),
    paymentStatus: expense.paymentStatus ?? '',
    paymentMethod: expense.paymentMethod ?? '',
    notes: expense.notes ?? '',
  };
}

export function formToExpenseInput(v: ExpenseFormValues): ExpenseInput {
  const assignment = v.assignment === '' ? 'unassigned' : v.assignment;
  return {
    expenseDate: v.expenseDate,
    assignment,
    assetId: assignment === 'asset' ? v.assetId : null,
    categoryId: v.categoryId,
    nature: v.nature,
    vendor: v.vendor,
    reference: v.reference,
    description: v.description,
    amount: parseMoney(v.amount, 'GHS'),
    paymentStatus: orNull(v.paymentStatus) as PaymentStatus | null,
    paymentMethod: orNull(v.paymentMethod) as PaymentMethod | null,
    notes: v.notes,
  };
}

/** Maps a service validation field path to a form field, or 'root' when there is none. */
export function fieldFor<T extends string>(path: string | null, known: readonly T[]): T | 'root' {
  const leaf = path?.split('.').at(-1) ?? '';
  return (known as readonly string[]).includes(leaf) ? (leaf as T) : 'root';
}
