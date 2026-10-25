import type { z } from 'zod';
import { diffFields, type AuditEvent } from '@/domain/audit';
import { formatMoney } from '@/domain/money';
import { revenueDetailsSchema, type RevenueEntry } from '@/domain/transactions';
import type { Workspace } from '@/domain/workspace';
import type { Repositories } from '@/repositories';
import { auditEvent, requireWorkspace, type RecordContext } from './asset-records';
import type { ServiceDependencies } from './dependencies';
import { NotFoundError } from './errors';
import {
  AlreadyVoidedError,
  assetRef,
  assetRefs,
  createdChanges,
  moneyAuditText,
  parseOrThrow,
  rejectFutureDate,
  requireAssetForRecord,
  voidInfo,
  type AssetRef,
} from './transaction-records';

export type RevenueInput = z.input<typeof revenueDetailsSchema>;

export interface RevenueRow {
  entry: RevenueEntry;
  /** Null when the entry is unassigned. */
  asset: AssetRef | null;
}

export interface RevenueDetail extends RevenueRow {
  history: AuditEvent[];
}

/** Newest service date first; same-day entries newest recorded first. */
export function byServiceDateDesc(a: RevenueEntry, b: RevenueEntry): number {
  return b.serviceDate.localeCompare(a.serviceDate) || b.createdAt.localeCompare(a.createdAt);
}

function auditView(entry: RevenueEntry, asset: AssetRef | null) {
  return {
    serviceDate: entry.serviceDate,
    reference: entry.reference,
    asset: asset ? asset.code : 'Unassigned',
    customer: entry.customer,
    description: entry.description,
    origin: entry.origin,
    destination: entry.destination,
    quantity: entry.quantity,
    quantityUnit: entry.quantityUnit,
    rate: moneyAuditText(entry.rate),
    amount: moneyAuditText(entry.amount),
    paymentStatus: entry.paymentStatus,
    notes: entry.notes,
  };
}

function describe(entry: RevenueEntry, asset: AssetRef | null): string {
  return `${entry.reference} on ${entry.serviceDate}, ${formatMoney(entry.amount)}, ${asset ? asset.code : 'unassigned'}`;
}

async function refFor(repos: Repositories, assetId: string | null): Promise<AssetRef | null> {
  if (assetId === null) return null;
  const asset = await repos.assets.get(assetId);
  return asset ? assetRef(asset) : null;
}

async function validate(repos: Repositories, workspace: Workspace, input: RevenueInput, at: Date) {
  const details = parseOrThrow(revenueDetailsSchema, input, 'Invalid revenue entry.');
  rejectFutureDate(details.serviceDate, workspace, at, 'serviceDate', 'Service date');
  const asset =
    details.assetId === null ? null : assetRef(await requireAssetForRecord(repos, details.assetId));
  return { details, asset };
}

/** Validates and stores a new entry with its audit event, inside a write. */
export async function insertRevenue(
  repos: Repositories,
  ctx: RecordContext,
  workspace: Workspace,
  input: RevenueInput,
): Promise<RevenueEntry> {
  const { details, asset } = await validate(repos, workspace, input, ctx.at);
  const timestamp = ctx.at.toISOString();
  const entry: RevenueEntry = {
    id: ctx.newId(),
    workspaceId: workspace.id,
    ...details,
    void: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await repos.revenue.put(entry);
  await repos.audit.append(
    auditEvent(
      ctx,
      workspace,
      { type: 'revenue', id: entry.id },
      'revenue.recorded',
      `Revenue recorded: ${describe(entry, asset)}`,
      createdChanges(auditView(entry, asset)),
    ),
  );
  return entry;
}

export function createRevenueService(deps: ServiceDependencies) {
  const { store, newId, now, actor } = deps;
  const context = (): RecordContext => ({ newId, actor, at: now() });

  async function requireEntry(repos: Repositories, id: string): Promise<RevenueEntry> {
    const entry = await repos.revenue.get(id);
    if (!entry) throw new NotFoundError('Revenue entry not found.');
    return entry;
  }

  return {
    async listRevenue(): Promise<RevenueRow[]> {
      return store.read(async (repos) => {
        const assets = await assetRefs(repos);
        return (await repos.revenue.list()).sort(byServiceDateDesc).map((entry) => ({
          entry,
          asset: entry.assetId === null ? null : (assets.get(entry.assetId) ?? null),
        }));
      });
    },

    async getRevenue(id: string): Promise<RevenueDetail> {
      return store.read(async (repos) => {
        const entry = await requireEntry(repos, id);
        return {
          entry,
          asset: await refFor(repos, entry.assetId),
          history: await repos.audit.listForEntity('revenue', id),
        };
      });
    },

    async recordRevenue(input: RevenueInput): Promise<RevenueEntry> {
      const ctx = context();
      return store.write(async (repos) =>
        insertRevenue(repos, ctx, await requireWorkspace(repos), input),
      );
    },

    /** Corrects an entry. Every changed field is audited; voided entries cannot change. */
    async updateRevenue(id: string, input: RevenueInput): Promise<RevenueEntry> {
      const ctx = context();
      return store.write(async (repos) => {
        const workspace = await requireWorkspace(repos);
        const current = await requireEntry(repos, id);
        if (current.void) throw new AlreadyVoidedError('revenue entry');
        const { details, asset } = await validate(repos, workspace, input, ctx.at);
        const next: RevenueEntry = { ...current, ...details };
        const before = auditView(current, await refFor(repos, current.assetId));
        const after = auditView(next, asset);
        const changes = diffFields(before, after, Object.keys(before) as (keyof typeof before)[]);
        if (changes.length === 0) return current;
        const saved = { ...next, updatedAt: ctx.at.toISOString() };
        await repos.revenue.put(saved);
        await repos.audit.append(
          auditEvent(
            ctx,
            workspace,
            { type: 'revenue', id },
            'revenue.updated',
            `Revenue ${saved.reference} corrected`,
            changes,
          ),
        );
        return saved;
      });
    },

    /** Removes an entry from every total. The record and its reason stay; this is permanent. */
    async voidRevenue(id: string, reason: string): Promise<RevenueEntry> {
      const ctx = context();
      const info = voidInfo(reason, ctx.at);
      return store.write(async (repos) => {
        const workspace = await requireWorkspace(repos);
        const current = await requireEntry(repos, id);
        if (current.void) throw new AlreadyVoidedError('revenue entry');
        const saved: RevenueEntry = { ...current, void: info, updatedAt: info.voidedAt };
        await repos.revenue.put(saved);
        await repos.audit.append(
          auditEvent(
            ctx,
            workspace,
            { type: 'revenue', id },
            'revenue.voided',
            `Revenue voided: ${describe(current, await refFor(repos, current.assetId))}. Reason: ${info.reason}`,
            [{ field: 'void', before: null, after: info.reason }],
          ),
        );
        return saved;
      });
    },
  };
}

export type RevenueService = ReturnType<typeof createRevenueService>;
