import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ASSET_CATEGORIES } from '@/domain/assets';
import { sampleAuditEvent, sampleWorkspace } from '@/test/fixtures';
import { DexieWorkspaceStore } from './dexie-workspace-store';
import { FmsDatabase, SCHEMA_V1 } from './fms-database';

describe('IndexedDB migration v1 → v2', () => {
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

    expect(snapshot.schemaVersion).toBe(2);
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
