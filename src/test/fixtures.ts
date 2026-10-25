import type { Asset, AssetCategory } from '@/domain/assets';
import { LOCAL_ACTOR } from '@/domain/audit';
import {
  planInitialSchedule,
  type DepreciationLine,
  type DepreciationSchedule,
} from '@/domain/depreciation';
import { parseMoney } from '@/domain/money';
import { newWorkspace, type Workspace } from '@/domain/workspace';
import type { NewAuditEvent } from '@/repositories';

/** Deterministic, schema-valid v4-shaped UUIDs for tests. */
export function sequentialIds(prefix = 0): () => string {
  let n = 0;
  return () => {
    n += 1;
    const tail = (prefix * 1_000_000 + n).toString(16).padStart(12, '0');
    return `00000000-0000-4000-8000-${tail}`;
  };
}

/** A clock that starts at `start` and advances one minute per call. */
export function steppingClock(start = '2026-01-15T09:00:00.000Z'): () => Date {
  let t = Date.parse(start);
  return () => {
    const now = new Date(t);
    t += 60_000;
    return now;
  };
}

export function sampleWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    ...newWorkspace({
      id: '00000000-0000-4000-8000-00000000aaaa',
      name: 'Accra Transport Ltd',
      kind: 'business',
      now: new Date('2026-01-15T09:00:00.000Z'),
    }),
    ...overrides,
  };
}

export function sampleAuditEvent(
  id: string,
  workspaceId: string,
  overrides: Partial<NewAuditEvent> = {},
): NewAuditEvent {
  return {
    id,
    workspaceId,
    occurredAt: '2026-01-15T09:00:00.000Z',
    actor: LOCAL_ACTOR,
    action: 'workspace.created',
    entityType: 'workspace',
    entityId: workspaceId,
    summary: 'Workspace created',
    changes: [],
    ...overrides,
  };
}

export function sampleCategory(
  id: string,
  workspaceId: string,
  overrides: Partial<AssetCategory> = {},
): AssetCategory {
  return {
    id,
    workspaceId,
    name: 'Car',
    usesVehicleFields: true,
    archived: false,
    createdAt: '2026-01-15T09:00:00.000Z',
    updatedAt: '2026-01-15T09:00:00.000Z',
    ...overrides,
  };
}

export function sampleAsset(
  id: string,
  workspaceId: string,
  categoryId: string,
  overrides: Partial<Asset> = {},
): Asset {
  return {
    id,
    workspaceId,
    code: 'A-1',
    name: 'Toyota Corolla',
    categoryId,
    description: null,
    acquisitionDate: '2026-01-10',
    location: null,
    supplier: null,
    notes: null,
    vehicle: {
      make: 'Toyota',
      model: 'Corolla',
      year: 2022,
      registration: 'GR 1234-22',
      vin: null,
    },
    depreciation: {
      method: 'straight-line',
      capitalizedCost: parseMoney('12000.00', 'GHS'),
      residualValue: parseMoney('0.00', 'GHS'),
      usefulLifeMonths: 12,
      inServiceDate: '2026-01-15',
    },
    status: 'active',
    createdAt: '2026-01-15T09:00:00.000Z',
    updatedAt: '2026-01-15T09:00:00.000Z',
    ...overrides,
  };
}

/** Version-1 schedule and lines for an asset, as the asset service would store them. */
export function sampleScheduleWithLines(newId: () => string, asset: Asset) {
  const schedule: DepreciationSchedule = {
    id: newId(),
    workspaceId: asset.workspaceId,
    assetId: asset.id,
    version: 1,
    effectiveFrom: asset.depreciation.inServiceDate.slice(0, 7),
    assumptions: asset.depreciation,
    reason: 'Initial schedule',
    createdAt: asset.createdAt,
  };
  const lines: DepreciationLine[] = planInitialSchedule(asset.depreciation).map((line) => ({
    id: newId(),
    workspaceId: asset.workspaceId,
    assetId: asset.id,
    scheduleId: schedule.id,
    ...line,
  }));
  return { schedule, lines };
}
