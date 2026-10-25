import {
  assetCategorySchema,
  type Asset,
  type AssetCategory,
  type AssetStatus,
} from '@/domain/assets';
import { diffFields, type AuditEvent } from '@/domain/audit';
import {
  effectiveLines,
  planRevision,
  positionAt,
  type BookPosition,
  type DepreciationAssumptions,
  type DepreciationLine,
  type DepreciationSchedule,
  type RevisionPlan,
} from '@/domain/depreciation';
import { currentYearMonth, type YearMonth } from '@/domain/periods';
import type { Repositories } from '@/repositories';
import {
  AssetValidationError,
  auditEvent,
  detailsAuditView,
  diffAssumptions,
  firstOpenPeriod,
  insertAssetWithSchedule,
  materialiseLines,
  parseAssumptions,
  requireWorkspace,
  validateDetails,
  type AssetDetailsInput,
  type AssetInput,
  type DepreciationAssumptionsInput,
  type RecordContext,
} from './asset-records';
import type { ServiceDependencies } from './dependencies';
import { ApplicationError } from './errors';

export class NotFoundError extends ApplicationError {
  override name = 'NotFoundError';
}

export class RevisionRejectedError extends ApplicationError {
  override name = 'RevisionRejectedError';
}

export interface AssetSummary {
  asset: Asset;
  categoryName: string;
  position: BookPosition;
}

export interface AssetDetail {
  asset: Asset;
  category: AssetCategory;
  schedules: DepreciationSchedule[];
  /** Lines in force for each month (closed history plus the current projection). */
  lines: DepreciationLine[];
  position: BookPosition;
  currentPeriod: YearMonth;
  closedThrough: YearMonth | null;
  history: AuditEvent[];
}

export interface CategoryInput {
  name: string;
  usesVehicleFields: boolean;
}

export function createAssetService(deps: ServiceDependencies) {
  const { store, newId, now, actor } = deps;
  const context = (): RecordContext => ({ newId, actor, at: now() });

  async function requireAsset(repos: Repositories, id: string): Promise<Asset> {
    const asset = await repos.assets.get(id);
    if (!asset) throw new NotFoundError('Asset not found.');
    return asset;
  }

  async function categoryName(repos: Repositories, id: string): Promise<string> {
    return (await repos.categories.get(id))?.name ?? 'Unknown category';
  }

  async function assetLines(repos: Repositories, assetId: string) {
    const schedules = await repos.depreciation.listSchedules(assetId);
    const lines = effectiveLines(schedules, await repos.depreciation.listLines(assetId));
    return { schedules, lines };
  }

  async function validateCategory(repos: Repositories, input: CategoryInput, existingId?: string) {
    const name = assetCategorySchema.shape.name.safeParse(input.name);
    if (!name.success)
      throw new AssetValidationError(name.error.issues[0]?.message ?? 'Invalid name.', 'name');
    const clash = (await repos.categories.list()).find(
      (c) => c.id !== existingId && c.name.toLowerCase() === name.data.toLowerCase(),
    );
    if (clash)
      throw new AssetValidationError(`A category named ${clash.name} already exists.`, 'name');
    return name.data;
  }

  async function plan(repos: Repositories, id: string, next: DepreciationAssumptions) {
    const workspace = await requireWorkspace(repos);
    const asset = await requireAsset(repos, id);
    const { schedules, lines } = await assetLines(repos, id);
    const result = planRevision({
      current: asset.depreciation,
      currentLines: lines,
      next,
      firstOpenPeriod: firstOpenPeriod(workspace),
    });
    return { workspace, asset, schedules, result };
  }

  return {
    async listCategories(): Promise<AssetCategory[]> {
      const categories = await store.read((repos) => repos.categories.list());
      return categories.sort((a, b) => a.name.localeCompare(b.name));
    },

    async createCategory(input: CategoryInput): Promise<AssetCategory> {
      const ctx = context();
      return store.write(async (repos) => {
        const workspace = await requireWorkspace(repos);
        const name = await validateCategory(repos, input);
        const timestamp = ctx.at.toISOString();
        const category: AssetCategory = {
          id: newId(),
          workspaceId: workspace.id,
          name,
          usesVehicleFields: input.usesVehicleFields,
          archived: false,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        await repos.categories.put(category);
        await repos.audit.append(
          auditEvent(
            ctx,
            workspace,
            { type: 'category', id: category.id },
            'category.created',
            `Category ${name} created`,
          ),
        );
        return category;
      });
    },

    async updateCategory(
      id: string,
      input: CategoryInput & { archived: boolean },
    ): Promise<AssetCategory> {
      const ctx = context();
      return store.write(async (repos) => {
        const workspace = await requireWorkspace(repos);
        const current = await repos.categories.get(id);
        if (!current) throw new NotFoundError('Category not found.');
        const name = await validateCategory(repos, input, id);
        const next = {
          ...current,
          name,
          usesVehicleFields: input.usesVehicleFields,
          archived: input.archived,
        };
        const changes = diffFields(current, next, ['name', 'usesVehicleFields', 'archived']);
        if (changes.length === 0) return current;
        const saved = { ...next, updatedAt: ctx.at.toISOString() };
        await repos.categories.put(saved);
        await repos.audit.append(
          auditEvent(
            ctx,
            workspace,
            { type: 'category', id },
            'category.updated',
            `Category ${name} updated`,
            changes,
          ),
        );
        return saved;
      });
    },

    /** Every asset with its book position at the end of the current business month. */
    async listAssets(): Promise<{ period: YearMonth; items: AssetSummary[] }> {
      const at = now();
      return store.read(async (repos) => {
        const workspace = await requireWorkspace(repos);
        const period = currentYearMonth(at, workspace.settings.timeZone);
        const categories = new Map((await repos.categories.list()).map((c) => [c.id, c.name]));
        const items: AssetSummary[] = [];
        for (const asset of await repos.assets.list()) {
          const { lines } = await assetLines(repos, asset.id);
          items.push({
            asset,
            categoryName: categories.get(asset.categoryId) ?? 'Unknown category',
            position: positionAt(lines, period, asset.depreciation),
          });
        }
        return { period, items };
      });
    },

    async getAsset(id: string): Promise<AssetDetail> {
      const at = now();
      return store.read(async (repos) => {
        const workspace = await requireWorkspace(repos);
        const asset = await requireAsset(repos, id);
        const category = await repos.categories.get(asset.categoryId);
        if (!category) throw new NotFoundError('Asset category not found.');
        const { schedules, lines } = await assetLines(repos, id);
        const currentPeriod = currentYearMonth(at, workspace.settings.timeZone);
        return {
          asset,
          category,
          schedules,
          lines,
          position: positionAt(lines, currentPeriod, asset.depreciation),
          currentPeriod,
          closedThrough: workspace.depreciationClosedThrough,
          history: await repos.audit.listForEntity('asset', id),
        };
      });
    },

    async createAsset(input: AssetInput): Promise<Asset> {
      const ctx = context();
      return store.write(async (repos) => {
        const workspace = await requireWorkspace(repos);
        return insertAssetWithSchedule(repos, ctx, workspace, input);
      });
    },

    /** Edits descriptive fields. Depreciation assumptions change only via reviseDepreciation. */
    async updateAssetDetails(id: string, input: AssetDetailsInput): Promise<Asset> {
      const ctx = context();
      return store.write(async (repos) => {
        const workspace = await requireWorkspace(repos);
        const current = await requireAsset(repos, id);
        const { details, category } = await validateDetails(repos, input, { existing: current });
        if (details.acquisitionDate > current.depreciation.inServiceDate) {
          throw new AssetValidationError(
            'Acquisition date cannot be after the in-service date.',
            'acquisitionDate',
          );
        }
        const next: Asset = { ...current, ...details };
        const before = detailsAuditView(current, await categoryName(repos, current.categoryId));
        const after = detailsAuditView(next, category.name);
        const changes = diffFields(before, after, Object.keys(before) as (keyof typeof before)[]);
        if (changes.length === 0) return current;
        const saved = { ...next, updatedAt: ctx.at.toISOString() };
        await repos.assets.put(saved);
        await repos.audit.append(
          auditEvent(
            ctx,
            workspace,
            { type: 'asset', id },
            'asset.updated',
            `Asset ${saved.code} details updated`,
            changes,
          ),
        );
        return saved;
      });
    },

    /**
     * Archiving hides an asset from day-to-day lists. It does not stop depreciation and is not a
     * disposal (disposal policy is pending).
     */
    async setAssetStatus(id: string, status: AssetStatus): Promise<Asset> {
      const ctx = context();
      return store.write(async (repos) => {
        const workspace = await requireWorkspace(repos);
        const current = await requireAsset(repos, id);
        if (current.status === status) return current;
        const saved: Asset = { ...current, status, updatedAt: ctx.at.toISOString() };
        await repos.assets.put(saved);
        await repos.audit.append(
          auditEvent(
            ctx,
            workspace,
            { type: 'asset', id },
            status === 'archived' ? 'asset.archived' : 'asset.reactivated',
            `Asset ${saved.code} ${status === 'archived' ? 'archived' : 'reactivated'}`,
            [{ field: 'status', before: current.status, after: status }],
          ),
        );
        return saved;
      });
    },

    /** Computes a revision without saving it. */
    async previewRevision(id: string, next: DepreciationAssumptionsInput): Promise<RevisionPlan> {
      const assumptions = parseAssumptions(next);
      return store.read(async (repos) => (await plan(repos, id, assumptions)).result);
    },

    /** Saves a new schedule version. Closed months keep their existing lines. */
    async reviseDepreciation(
      id: string,
      next: DepreciationAssumptionsInput,
      reason: string,
    ): Promise<Asset> {
      const assumptions = parseAssumptions(next);
      const trimmedReason = reason.trim();
      if (trimmedReason.length < 3) {
        throw new AssetValidationError('Give a reason for the change.', 'reason');
      }
      const ctx = context();
      return store.write(async (repos) => {
        const { workspace, asset, schedules, result } = await plan(repos, id, assumptions);
        if (!result.ok) throw new RevisionRejectedError(result.message);
        if (assumptions.inServiceDate < asset.acquisitionDate) {
          throw new AssetValidationError(
            'In-service date cannot be before the acquisition date.',
            'inServiceDate',
          );
        }
        const timestamp = ctx.at.toISOString();
        const schedule: DepreciationSchedule = {
          id: newId(),
          workspaceId: workspace.id,
          assetId: id,
          version: (schedules.at(-1)?.version ?? 0) + 1,
          effectiveFrom: result.effectiveFrom,
          assumptions,
          reason: trimmedReason.slice(0, 500),
          createdAt: timestamp,
        };
        await repos.depreciation.addSchedule(schedule);
        await repos.depreciation.addLines(
          materialiseLines(
            result.lines,
            { workspaceId: workspace.id, assetId: id, scheduleId: schedule.id },
            newId,
          ),
        );
        const saved: Asset = { ...asset, depreciation: assumptions, updatedAt: timestamp };
        await repos.assets.put(saved);
        await repos.audit.append(
          auditEvent(
            ctx,
            workspace,
            { type: 'asset', id },
            'depreciation.revised',
            `Depreciation schedule v${schedule.version} for ${asset.code} from ${result.effectiveFrom}: ${trimmedReason}`,
            diffAssumptions(asset.depreciation, assumptions),
          ),
        );
        return saved;
      });
    },
  };
}

export type AssetService = ReturnType<typeof createAssetService>;
