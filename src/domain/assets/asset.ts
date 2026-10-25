import { z } from 'zod';
import { idSchema, isoTimestampSchema } from '../common/schemas';
import { depreciationAssumptionsSchema } from '../depreciation';
import { calendarDateSchema } from '../periods';

/** Optional free text: trimmed, stored as null when empty. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters.`)
    .nullable()
    .transform((v) => (v === '' ? null : v));

export const assetCategorySchema = z.strictObject({
  id: idSchema,
  workspaceId: idSchema,
  name: z.string().trim().min(1, 'Enter a category name.').max(50, 'Use at most 50 characters.'),
  /** Shows make/model/registration fields. Non-vehicle categories never require them. */
  usesVehicleFields: z.boolean(),
  archived: z.boolean(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});

export type AssetCategory = z.infer<typeof assetCategorySchema>;

export const DEFAULT_ASSET_CATEGORIES: readonly { name: string; usesVehicleFields: boolean }[] = [
  { name: 'Car', usesVehicleFields: true },
  { name: 'Minibus / bus', usesVehicleFields: true },
  { name: 'Truck', usesVehicleFields: true },
  { name: 'Motorcycle', usesVehicleFields: true },
  { name: 'Equipment', usesVehicleFields: false },
  { name: 'Other', usesVehicleFields: false },
];

export function defaultAssetCategories(
  workspaceId: string,
  now: Date,
  newId: () => string,
): AssetCategory[] {
  const timestamp = now.toISOString();
  return DEFAULT_ASSET_CATEGORIES.map((c) => ({
    id: newId(),
    workspaceId,
    name: c.name,
    usesVehicleFields: c.usesVehicleFields,
    archived: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
}

export const vehicleDetailsSchema = z.strictObject({
  make: optionalText(60),
  model: optionalText(60),
  year: z
    .number('Enter a year.')
    .int('Use a whole year.')
    .min(1900, 'Use a year from 1900.')
    .max(2100, 'Use a year up to 2100.')
    .nullable(),
  registration: optionalText(30),
  vin: optionalText(40),
});

export type VehicleDetails = z.infer<typeof vehicleDetailsSchema>;

export const assetStatusSchema = z.enum(['active', 'archived']);
export type AssetStatus = z.infer<typeof assetStatusSchema>;

export const ASSET_CODE_MAX_LENGTH = 30;

export const assetCodeSchema = z
  .string()
  .trim()
  .min(1, 'Enter an asset code.')
  .max(ASSET_CODE_MAX_LENGTH, `Use at most ${ASSET_CODE_MAX_LENGTH} characters.`)
  .regex(/^[A-Za-z0-9][A-Za-z0-9 ._/-]*$/, 'Use letters, numbers, spaces, and . _ / - only.');

/** Fields the user edits directly. Depreciation assumptions change only through a revision. */
const assetDetailsShape = {
  code: assetCodeSchema,
  name: z.string().trim().min(1, 'Enter an asset name.').max(120, 'Use at most 120 characters.'),
  categoryId: idSchema,
  description: optionalText(1000),
  acquisitionDate: calendarDateSchema,
  location: optionalText(120),
  supplier: optionalText(120),
  notes: optionalText(2000),
  vehicle: vehicleDetailsSchema.nullable(),
};

export const assetDetailsSchema = z.strictObject(assetDetailsShape);
export type AssetDetails = z.infer<typeof assetDetailsSchema>;

export const assetSchema = z
  .strictObject({
    id: idSchema,
    workspaceId: idSchema,
    ...assetDetailsShape,
    depreciation: depreciationAssumptionsSchema,
    status: assetStatusSchema,
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .superRefine((asset, ctx) => {
    if (asset.acquisitionDate > asset.depreciation.inServiceDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['depreciation', 'inServiceDate'],
        message: 'In-service date cannot be before the acquisition date.',
      });
    }
  });

export type Asset = z.infer<typeof assetSchema>;

/** Codes are unique per workspace regardless of case and surrounding spaces. */
export function normalizeAssetCode(code: string): string {
  return code.trim().toUpperCase();
}
