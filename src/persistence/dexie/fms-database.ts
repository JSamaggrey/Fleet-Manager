import Dexie, { type EntityTable } from 'dexie';
import { defaultAssetCategories, type Asset, type AssetCategory } from '@/domain/assets';
import type { AuditEvent } from '@/domain/audit';
import type { DepreciationLine, DepreciationSchedule } from '@/domain/depreciation';
import type { Workspace } from '@/domain/workspace';

export const DEFAULT_DATABASE_NAME = 'fms';

/**
 * IndexedDB schema version. Bump it with a new `this.version(n)` block (never edit an old one) and
 * add an upgrade function plus a test when existing data must be transformed.
 */
export const DB_SCHEMA_VERSION = 2;

/** Table definitions per version, exported so migration tests can build older databases. */
export const SCHEMA_V1 = {
  workspace: 'id',
  auditEvents: 'id, &sequence, [entityType+entityId], occurredAt',
};

export const SCHEMA_V2 = {
  ...SCHEMA_V1,
  assetCategories: 'id',
  assets: 'id, categoryId, status',
  depreciationSchedules: 'id, assetId, [assetId+version]',
  depreciationLines: 'id, scheduleId, assetId, period, [assetId+period]',
};

export class FmsDatabase extends Dexie {
  declare workspace: EntityTable<Workspace, 'id'>;
  declare auditEvents: EntityTable<AuditEvent, 'id'>;
  declare assetCategories: EntityTable<AssetCategory, 'id'>;
  declare assets: EntityTable<Asset, 'id'>;
  declare depreciationSchedules: EntityTable<DepreciationSchedule, 'id'>;
  declare depreciationLines: EntityTable<DepreciationLine, 'id'>;

  constructor(name = DEFAULT_DATABASE_NAME) {
    super(name);
    this.version(1).stores(SCHEMA_V1);
    this.version(2)
      .stores(SCHEMA_V2)
      .upgrade(async (tx) => {
        // Phase 2: period close marker on the workspace, plus default asset categories.
        await tx
          .table('workspace')
          .toCollection()
          .modify((ws: Partial<Workspace>) => {
            ws.depreciationClosedThrough ??= null;
          });
        const workspace = await tx.table<Workspace>('workspace').toCollection().first();
        if (workspace && (await tx.table('assetCategories').count()) === 0) {
          await tx
            .table('assetCategories')
            .bulkAdd(defaultAssetCategories(workspace.id, new Date(), () => crypto.randomUUID()));
        }
      });
  }
}
