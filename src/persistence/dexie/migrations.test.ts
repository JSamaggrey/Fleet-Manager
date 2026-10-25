import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ASSET_CATEGORIES } from '@/domain/assets';
import { DEFAULT_EXPENSE_CATEGORIES } from '@/domain/transactions';
import {
  sampleAsset,
  sampleAuditEvent,
  sampleCategory,
  sampleScheduleWithLines,
  sampleWorkspace,
  sequentialIds,
} from '@/test/fixtures';
import { DexieWorkspaceStore } from './dexie-workspace-store';
import { DB_SCHEMA_VERSION, FmsDatabase, SCHEMA_V1, SCHEMA_V2 } from './fms-database';

describe('IndexedDB migration v1 → current', () => {
  it('keeps Phase 1 data and adds the period-close marker and default categories', async () => {
    const name = 'migration-test-v1';
    const full = sampleWorkspace();
    // Phase 1 workspaces had no period-close field.
    const phase1Workspace: Omit<typeof full, 'depreciationClosedThrough'> & {
      depreciationClosedThrough?: string | null;
    } = { ...full };
    delete phase1Workspace.depreciationClosedThrough;
    const event = {
      ...sampleAuditEvent('00000000-0000-4000-8000-0000000000e1', phase1Workspace.id),
      sequence: 1,
    };

    // A database exactly as Phase 1 left it.
    const legacy = new Dexie(name);
    legacy.version(1).stores(SCHEMA_V1);
    await legacy.table('workspace').add(phase1Workspace);
    await legacy.table('auditEvents').add(event);
    legacy.close();

    const store = new DexieWorkspaceStore(new FmsDatabase(name));
    const snapshot = await store.snapshot();

    expect(snapshot.schemaVersion).toBe(DB_SCHEMA_VERSION);
    expect(snapshot.tables.workspace).toEqual([
      { ...phase1Workspace, depreciationClosedThrough: null },
    ]);
    expect(snapshot.tables.auditEvents).toEqual([event]);
    expect(snapshot.tables.assetCategories.map((c) => c.name).sort()).toEqual(
      DEFAULT_ASSET_CATEGORIES.map((c) => c.name).sort(),
    );
    expect(snapshot.tables.assetCategories.every((c) => c.workspaceId === phase1Workspace.id)).toBe(
      true,
    );
    expect(snapshot.tables.assets).toEqual([]);
    expect(snapshot.tables.expenseCategories).toHaveLength(DEFAULT_EXPENSE_CATEGORIES.length);
    expect(snapshot.tables.revenueEntries).toEqual([]);
  });

  it('keeps Phase 2 assets and schedules and adds default expense categories (v2 → v3)', async () => {
    const name = 'migration-test-v2';
    const ids = sequentialIds(5);
    const ws = sampleWorkspace();
    const category = sampleCategory(ids(), ws.id);
    const asset = sampleAsset(ids(), ws.id, category.id);
    const { schedule, lines } = sampleScheduleWithLines(ids, asset);

    const legacy = new Dexie(name);
    legacy.version(2).stores(SCHEMA_V2);
    await legacy.table('workspace').add(ws);
    await legacy.table('assetCategories').add(category);
    await legacy.table('assets').add(asset);
    await legacy.table('depreciationSchedules').add(schedule);
    await legacy.table('depreciationLines').bulkAdd(lines);
    legacy.close();

    const snapshot = await new DexieWorkspaceStore(new FmsDatabase(name)).snapshot();
    expect(snapshot.tables.workspace).toEqual([ws]);
    expect(snapshot.tables.assets).toEqual([asset]);
    expect(snapshot.tables.depreciationSchedules).toEqual([schedule]);
    expect(snapshot.tables.depreciationLines).toHaveLength(lines.length);
    expect(snapshot.tables.expenseCategories.map((c) => c.name).sort()).toEqual(
      [...DEFAULT_EXPENSE_CATEGORIES].sort(),
    );
    expect(snapshot.tables.expenseCategories.every((c) => c.workspaceId === ws.id)).toBe(true);
    expect(snapshot.tables.revenueEntries).toEqual([]);
    expect(snapshot.tables.expenses).toEqual([]);
  });

  it('upgrades an empty Phase 1 database without inventing a workspace', async () => {
    const name = 'migration-test-empty';
    const legacy = new Dexie(name);
    legacy.version(1).stores(SCHEMA_V1);
    await legacy.open();
    legacy.close();

    const store = new DexieWorkspaceStore(new FmsDatabase(name));
    expect(await store.isEmpty()).toBe(true);
  });
});
