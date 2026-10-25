import type { z } from 'zod';
import type { Asset } from '@/domain/assets';
import type { AuditChange } from '@/domain/audit';
import { toDecimalString, type Money } from '@/domain/money';
import { calendarDateInTimeZone } from '@/domain/periods';
import { voidReasonSchema, type VoidInfo } from '@/domain/transactions';
import type { Workspace } from '@/domain/workspace';
import type { Repositories } from '@/repositories';
import { ValidationError } from './errors';

/** The asset a record points at, as lists show it. */
export interface AssetRef {
  id: string;
  code: string;
  name: string;
  archived: boolean;
}

export function assetRef(asset: Asset): AssetRef {
  return {
    id: asset.id,
    code: asset.code,
    name: asset.name,
    archived: asset.status === 'archived',
  };
}

export async function assetRefs(repos: Repositories): Promise<Map<string, AssetRef>> {
  return new Map((await repos.assets.list()).map((a) => [a.id, assetRef(a)]));
}

/** Parses with a domain schema, turning the first issue into a ValidationError. */
export function parseOrThrow<S extends z.ZodType>(
  schema: S,
  input: unknown,
  fallback: string,
): z.output<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ValidationError(issue?.message ?? fallback, issue?.path.join('.') || null);
  }
  return parsed.data;
}

export function moneyAuditText(value: Money | null): string | null {
  return value === null ? null : `${value.currency} ${toDecimalString(value)}`;
}

/** Field values for an audit "created" event: every non-empty field, before = null. */
export function createdChanges(view: Record<string, AuditChange['after']>): AuditChange[] {
  return Object.entries(view)
    .filter(([, value]) => value !== null)
    .map(([field, value]) => ({ field, before: null, after: value }));
}

/** Recorded activity cannot be dated after today in the business time zone. */
export function rejectFutureDate(
  date: string,
  workspace: Workspace,
  at: Date,
  field: string,
  label: string,
): void {
  const today = calendarDateInTimeZone(at, workspace.settings.timeZone);
  if (date > today) {
    throw new ValidationError(`${label} cannot be in the future (today is ${today}).`, field);
  }
}

export async function requireAssetForRecord(repos: Repositories, assetId: string): Promise<Asset> {
  const asset = await repos.assets.get(assetId);
  if (!asset) throw new ValidationError('Choose an asset from this workspace.', 'assetId');
  return asset;
}

export function voidInfo(reason: string, at: Date): VoidInfo {
  const parsed = voidReasonSchema.safeParse(reason);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? 'Give a reason for voiding.',
      'reason',
    );
  }
  return { voidedAt: at.toISOString(), reason: parsed.data };
}

export class AlreadyVoidedError extends ValidationError {
  override name = 'AlreadyVoidedError';
  constructor(what: string) {
    super(`This ${what} is voided and cannot be changed. Record a new ${what} instead.`);
  }
}
