import { z } from 'zod';
import {
  assetDetailsSchema,
  assetSchema,
  normalizeAssetCode,
  type Asset,
  type AssetCategory,
} from '@/domain/assets';
import { diffFields, type AuditChange } from '@/domain/audit';
import {
  depreciationAssumptionsSchema,
  inServicePeriod,
  planInitialSchedule,
  type DepreciationAssumptions,
  type DepreciationLine,
  type DepreciationSchedule,
  type PlannedLine,
} from '@/domain/depreciation';
import { toDecimalString } from '@/domain/money';
import { addMonths, type YearMonth } from '@/domain/periods';
import type { Workspace } from '@/domain/workspace';
import type { NewAuditEvent, Repositories } from '@/repositories';
import { NoWorkspaceError, ValidationError } from './errors';

export type AssetDetailsInput = z.input<typeof assetDetailsSchema>;
export type DepreciationAssumptionsInput = z.input<typeof depreciationAssumptionsSchema>;

export interface AssetInput {
  details: AssetDetailsInput;
  depreciation: DepreciationAssumptionsInput;
}

export interface RecordContext {
  newId: () => string;
  actor: string;
  at: Date;
}

export class AssetValidationError extends ValidationError {
  override name = 'AssetValidationError';
}

export async function requireWorkspace(repos: Repositories): Promise<Workspace> {
  const workspace = await repos.workspace.get();
  if (!workspace) throw new NoWorkspaceError();
  return workspace;
}

export function firstOpenPeriod(workspace: Workspace): YearMonth | null {
  return workspace.depreciationClosedThrough === null
    ? null
    : addMonths(workspace.depreciationClosedThrough, 1);
}

export function auditEvent(
  ctx: RecordContext,
  workspace: Workspace,
  entity: { type: string; id: string },
  action: string,
  summary: string,
  changes: AuditChange[] = [],
): NewAuditEvent {
  return {
    id: ctx.newId(),
    workspaceId: workspace.id,
    occurredAt: ctx.at.toISOString(),
    actor: ctx.actor,
    action,
    entityType: entity.type,
    entityId: entity.id,
    summary: summary.slice(0, 500),
    changes,
  };
}

/** Human-readable values for the audit trail (money as "GHS 1234.56"). */
export function assumptionsAuditView(a: DepreciationAssumptions) {
  return {
    capitalizedCost: `${a.capitalizedCost.currency} ${toDecimalString(a.capitalizedCost)}`,
    residualValue: `${a.residualValue.currency} ${toDecimalString(a.residualValue)}`,
    usefulLifeMonths: a.usefulLifeMonths,
    inServiceDate: a.inServiceDate,
    method: a.method,
  };
}

export function detailsAuditView(asset: Asset, categoryName: string) {
  return {
    code: asset.code,
    name: asset.name,
    category: categoryName,
    description: asset.description,
    acquisitionDate: asset.acquisitionDate,
    location: asset.location,
    supplier: asset.supplier,
    notes: asset.notes,
    vehicle: asset.vehicle,
  };
}

export function diffAssumptions(before: DepreciationAssumptions, after: DepreciationAssumptions) {
  const a = assumptionsAuditView(before);
  const b = assumptionsAuditView(after);
  return diffFields(a, b, Object.keys(a) as (keyof typeof a)[]);
}

/** Validates details against the category and code uniqueness. Returns the normalised details. */
export async function validateDetails(
  repos: Repositories,
  input: AssetDetailsInput,
  options: { existing?: Asset },
): Promise<{ details: z.output<typeof assetDetailsSchema>; category: AssetCategory }> {
  const parsed = assetDetailsSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new AssetValidationError(
      issue?.message ?? 'Invalid asset details.',
      issue?.path.join('.') ?? null,
    );
  }
  const details = parsed.data;
  const category = await repos.categories.get(details.categoryId);
  if (!category) throw new AssetValidationError('Choose a category.', 'categoryId');
  const categoryChanged = options.existing?.categoryId !== details.categoryId;
  if (category.archived && categoryChanged) {
    throw new AssetValidationError('This category is archived. Choose another.', 'categoryId');
  }
  const code = normalizeAssetCode(details.code);
  const clash = (await repos.assets.list()).find(
    (a) => a.id !== options.existing?.id && normalizeAssetCode(a.code) === code,
  );
  if (clash) {
    throw new AssetValidationError(
      `Asset code ${details.code} is already used by ${clash.name}.`,
      'code',
    );
  }
  // Non-vehicle categories never carry vehicle fields.
  return {
    details: { ...details, vehicle: category.usesVehicleFields ? details.vehicle : null },
    category,
  };
}

export function parseAssumptions(input: DepreciationAssumptionsInput): DepreciationAssumptions {
  const parsed = depreciationAssumptionsSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new AssetValidationError(
      issue?.message ?? 'Invalid depreciation assumptions.',
      issue ? ['depreciation', ...issue.path].join('.') : null,
    );
  }
  return parsed.data;
}

export function materialiseLines(
  planned: readonly PlannedLine[],
  ids: { workspaceId: string; assetId: string; scheduleId: string },
  newId: () => string,
): DepreciationLine[] {
  return planned.map((line) => ({ id: newId(), ...ids, ...line }));
}

/** Creates an asset with its first depreciation schedule and audit event, inside a write. */
export async function insertAssetWithSchedule(
  repos: Repositories,
  ctx: RecordContext,
  workspace: Workspace,
  input: AssetInput,
): Promise<Asset> {
  const { details, category } = await validateDetails(repos, input.details, {});
  const depreciation = parseAssumptions(input.depreciation);
  const timestamp = ctx.at.toISOString();
  const assetResult = assetSchema.safeParse({
    id: ctx.newId(),
    workspaceId: workspace.id,
    ...details,
    depreciation,
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  if (!assetResult.success) {
    const issue = assetResult.error.issues[0];
    throw new AssetValidationError(
      issue?.message ?? 'Invalid asset.',
      issue?.path.join('.') ?? null,
    );
  }
  const asset = assetResult.data;
  const schedule: DepreciationSchedule = {
    id: ctx.newId(),
    workspaceId: workspace.id,
    assetId: asset.id,
    version: 1,
    effectiveFrom: inServicePeriod(depreciation),
    assumptions: depreciation,
    reason: 'Initial schedule',
    createdAt: timestamp,
  };
  await repos.assets.put(asset);
  await repos.depreciation.addSchedule(schedule);
  await repos.depreciation.addLines(
    materialiseLines(
      planInitialSchedule(depreciation),
      { workspaceId: workspace.id, assetId: asset.id, scheduleId: schedule.id },
      ctx.newId,
    ),
  );
  const view = { ...detailsAuditView(asset, category.name), ...assumptionsAuditView(depreciation) };
  await repos.audit.append(
    auditEvent(
      ctx,
      workspace,
      { type: 'asset', id: asset.id },
      'asset.created',
      `Asset ${asset.code} created with a ${depreciation.usefulLifeMonths}-month schedule`,
      Object.entries(view)
        .filter(([, value]) => value !== null)
        .map(([field, value]) => ({ field, before: null, after: value as AuditChange['after'] })),
    ),
  );
  return asset;
}
