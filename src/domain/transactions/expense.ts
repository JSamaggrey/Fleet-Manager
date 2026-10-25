import { z } from 'zod';
import { idSchema, isoTimestampSchema, optionalText } from '../common/schemas';
import { calendarDateSchema } from '../periods';
import { paymentStatusSchema, positiveMoneySchema, voidInfoSchema } from './common';

export const expenseCategorySchema = z.strictObject({
  id: idSchema,
  workspaceId: idSchema,
  name: z.string().trim().min(1, 'Enter a category name.').max(50, 'Use at most 50 characters.'),
  archived: z.boolean(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});

export type ExpenseCategory = z.infer<typeof expenseCategorySchema>;

export const DEFAULT_EXPENSE_CATEGORIES: readonly string[] = [
  'Fuel',
  'Maintenance and repairs',
  'Tyres',
  'Insurance',
  'Licensing and permits',
  'Driver and crew allowances',
  'Tolls and parking',
  'Cleaning',
  'Office and administration',
  'Rent and utilities',
  'Other',
];

export function defaultExpenseCategories(
  workspaceId: string,
  now: Date,
  newId: () => string,
): ExpenseCategory[] {
  const timestamp = now.toISOString();
  return DEFAULT_EXPENSE_CATEGORIES.map((name) => ({
    id: newId(),
    workspaceId,
    name,
    archived: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
}

/**
 * - asset: a direct operating cost of one asset, deducted in that asset's profit.
 * - shared: a fleet/overhead cost. Never allocated to assets in the MVP; shown separately.
 * - unassigned: not yet classified. Listed as an exception until it is assigned.
 */
export const expenseAssignmentSchema = z.enum(['asset', 'shared', 'unassigned']);
export type ExpenseAssignment = z.infer<typeof expenseAssignmentSchema>;

/**
 * Capital items (acquisition or improvement) are not operating expenses. They are kept for the
 * record only; changing an asset's depreciable cost is a separate depreciation revision.
 */
export const expenseNatureSchema = z.enum(['operating', 'capital']);
export type ExpenseNature = z.infer<typeof expenseNatureSchema>;

export const PAYMENT_METHODS = [
  'cash',
  'mobile-money',
  'bank-transfer',
  'cheque',
  'card',
  'other',
] as const;
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Cash',
  'mobile-money': 'Mobile money',
  'bank-transfer': 'Bank transfer',
  cheque: 'Cheque',
  card: 'Card',
  other: 'Other',
};

const expenseDetailsShape = {
  expenseDate: calendarDateSchema,
  assignment: expenseAssignmentSchema,
  /** Set exactly when assignment is 'asset'. */
  assetId: idSchema.nullable(),
  categoryId: idSchema,
  nature: expenseNatureSchema,
  vendor: optionalText(120),
  reference: optionalText(60),
  description: optionalText(500),
  amount: positiveMoneySchema,
  paymentStatus: paymentStatusSchema.nullable(),
  paymentMethod: paymentMethodSchema.nullable(),
  notes: optionalText(2000),
};

function assignmentMatchesAsset(
  e: { assignment: ExpenseAssignment; assetId: string | null },
  ctx: z.RefinementCtx,
) {
  if (e.assignment === 'asset' && e.assetId === null) {
    ctx.addIssue({ code: 'custom', path: ['assetId'], message: 'Choose the asset.' });
  }
  if (e.assignment !== 'asset' && e.assetId !== null) {
    ctx.addIssue({
      code: 'custom',
      path: ['assetId'],
      message: 'Only direct asset expenses name an asset.',
    });
  }
}

export const expenseDetailsSchema = z
  .strictObject(expenseDetailsShape)
  .superRefine(assignmentMatchesAsset);
export type ExpenseDetails = z.infer<typeof expenseDetailsSchema>;

export const expenseSchema = z
  .strictObject({
    id: idSchema,
    workspaceId: idSchema,
    ...expenseDetailsShape,
    void: voidInfoSchema.nullable(),
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .superRefine(assignmentMatchesAsset);

export type Expense = z.infer<typeof expenseSchema>;
