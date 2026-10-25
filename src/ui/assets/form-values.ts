import { z } from 'zod';
import type { AssetInput } from '@/application/asset-records';
import type { Asset } from '@/domain/assets';
import { parseMoney, toDecimalString, type Money } from '@/domain/money';

/**
 * Form-level schemas: strings as typed by the user, with quick feedback. The domain schemas in the
 * services remain the authority and re-validate everything.
 */
export function isMoneyText(value: string): boolean {
  try {
    parseMoney(value, 'GHS');
    return true;
  } catch {
    return false;
  }
}

export const moneyText = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `Enter the ${label}.`)
    .refine(isMoneyText, 'Enter an amount such as 12500 or 12,500.00 (up to 2 decimals).');

export const usefulLifeField = z
  .number('Enter the useful life in months.')
  .int('Use whole months.')
  .min(1, 'Useful life must be at least 1 month.')
  .max(600, 'Useful life can be at most 600 months.');

const residualNotAboveCost = (
  v: { capitalizedCost: string; residualValue: string },
  ctx: z.RefinementCtx,
) => {
  if (isMoneyText(v.capitalizedCost) && isMoneyText(v.residualValue)) {
    if (
      parseMoney(v.residualValue, 'GHS').amountMinor >
      parseMoney(v.capitalizedCost, 'GHS').amountMinor
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['residualValue'],
        message: 'Residual value cannot exceed cost.',
      });
    }
  }
};

export const assetFormSchema = z
  .object({
    code: z.string().trim().min(1, 'Enter an asset code.'),
    name: z.string().trim().min(1, 'Enter an asset name.'),
    categoryId: z.string().min(1, 'Choose a category.'),
    acquisitionDate: z.string().min(1, 'Enter the acquisition date.'),
    inServiceDate: z.string().min(1, 'Enter the in-service date.'),
    capitalizedCost: moneyText('capitalised cost'),
    residualValue: moneyText('residual value'),
    usefulLifeMonths: usefulLifeField,
    location: z.string(),
    supplier: z.string(),
    description: z.string(),
    notes: z.string(),
    make: z.string(),
    model: z.string(),
    year: z
      .string()
      .trim()
      .regex(/^(\d{4})?$/, 'Use a 4-digit year.'),
    registration: z.string(),
    vin: z.string(),
  })
  .superRefine(residualNotAboveCost)
  .superRefine((v, ctx) => {
    if (v.acquisitionDate && v.inServiceDate && v.inServiceDate < v.acquisitionDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['inServiceDate'],
        message: 'In-service date cannot be before the acquisition date.',
      });
    }
  });

export type AssetFormValues = z.infer<typeof assetFormSchema>;

export const revisionFormSchema = z
  .object({
    capitalizedCost: moneyText('capitalised cost'),
    residualValue: moneyText('residual value'),
    usefulLifeMonths: usefulLifeField,
    inServiceDate: z.string().min(1, 'Enter the in-service date.'),
    // Required when saving, not for previewing (checked on save).
    reason: z.string().trim().max(500, 'Use at most 500 characters.'),
  })
  .superRefine(residualNotAboveCost);

export type RevisionFormValues = z.infer<typeof revisionFormSchema>;

const moneyToText = (m: Money) => toDecimalString(m);

export function emptyAssetForm(): AssetFormValues {
  return {
    code: '',
    name: '',
    categoryId: '',
    acquisitionDate: '',
    inServiceDate: '',
    capitalizedCost: '',
    residualValue: '0.00',
    usefulLifeMonths: 60,
    location: '',
    supplier: '',
    description: '',
    notes: '',
    make: '',
    model: '',
    year: '',
    registration: '',
    vin: '',
  };
}

export function assetToForm(asset: Asset): AssetFormValues {
  const v = asset.vehicle;
  return {
    code: asset.code,
    name: asset.name,
    categoryId: asset.categoryId,
    acquisitionDate: asset.acquisitionDate,
    inServiceDate: asset.depreciation.inServiceDate,
    capitalizedCost: moneyToText(asset.depreciation.capitalizedCost),
    residualValue: moneyToText(asset.depreciation.residualValue),
    usefulLifeMonths: asset.depreciation.usefulLifeMonths,
    location: asset.location ?? '',
    supplier: asset.supplier ?? '',
    description: asset.description ?? '',
    notes: asset.notes ?? '',
    make: v?.make ?? '',
    model: v?.model ?? '',
    year: v?.year === null || v?.year === undefined ? '' : String(v.year),
    registration: v?.registration ?? '',
    vin: v?.vin ?? '',
  };
}

export function formToAssetInput(values: AssetFormValues, usesVehicleFields: boolean): AssetInput {
  return {
    details: {
      code: values.code,
      name: values.name,
      categoryId: values.categoryId,
      description: values.description,
      acquisitionDate: values.acquisitionDate,
      location: values.location,
      supplier: values.supplier,
      notes: values.notes,
      vehicle: usesVehicleFields
        ? {
            make: values.make,
            model: values.model,
            year: values.year.trim() === '' ? null : Number(values.year),
            registration: values.registration,
            vin: values.vin,
          }
        : null,
    },
    depreciation: {
      method: 'straight-line',
      capitalizedCost: parseMoney(values.capitalizedCost, 'GHS'),
      residualValue: parseMoney(values.residualValue, 'GHS'),
      usefulLifeMonths: values.usefulLifeMonths,
      inServiceDate: values.inServiceDate,
    },
  };
}

/** Maps a service validation field path to the form field that should show the message. */
export function formFieldFor(path: string | null): keyof AssetFormValues | 'root' {
  if (!path) return 'root';
  const leaf = path.split('.').at(-1) ?? '';
  const known: (keyof AssetFormValues)[] = [
    'code',
    'name',
    'categoryId',
    'acquisitionDate',
    'inServiceDate',
    'capitalizedCost',
    'residualValue',
    'usefulLifeMonths',
    'location',
    'supplier',
    'description',
    'notes',
    'make',
    'model',
    'year',
    'registration',
    'vin',
  ];
  return (known as string[]).includes(leaf) ? (leaf as keyof AssetFormValues) : 'root';
}
