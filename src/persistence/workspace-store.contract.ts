import { beforeEach, describe, expect, it } from 'vitest';
import {
  WorkspaceNotEmptyError,
  emptyTables,
  type WorkspaceSnapshot,
  type WorkspaceStore,
} from '@/repositories';
import {
  sampleAsset,
  sampleAuditEvent,
  sampleCategory,
  sampleScheduleWithLines,
  sampleWorkspace,
  sequentialIds,
} from '@/test/fixtures';

/**
 * Behaviour every WorkspaceStore adapter must provide. Run it from an adapter's test file so a
 * replacement adapter (SQLite, API) is held to the same rules as IndexedDB.
 */
export function describeWorkspaceStoreContract(
  adapterName: string,
  createStore: () => Promise<WorkspaceStore> | WorkspaceStore,
): void {
  describe(`WorkspaceStore contract: ${adapterName}`, () => {
    let store: WorkspaceStore;
    const ws = sampleWorkspace();
    let nextId: () => string;

    beforeEach(async () => {
      store = await createStore();
      nextId = sequentialIds(7);
    });

    it('starts empty', async () => {
      expect(await store.isEmpty()).toBe(true);
      expect(await store.read((r) => r.workspace.get())).toBeUndefined();
    });

    it('persists a workspace and reads it back unchanged', async () => {
      await store.write((r) => r.workspace.put(ws));
      expect(await store.read((r) => r.workspace.get())).toEqual(ws);
      expect(await store.isEmpty()).toBe(false);
    });

    it('assigns increasing audit sequence numbers and lists newest first', async () => {
      const [first, second] = await store.write(async (r) => [
        await r.audit.append(sampleAuditEvent(nextId(), ws.id)),
        await r.audit.append(sampleAuditEvent(nextId(), ws.id, { action: 'workspace.updated' })),
      ]);
      expect(first?.sequence).toBe(1);
      expect(second?.sequence).toBe(2);
      const listed = await store.read((r) => r.audit.list({ offset: 0, limit: 10 }));
      expect(listed.map((e) => e.sequence)).toEqual([2, 1]);
      expect(await store.read((r) => r.audit.count())).toBe(2);
      expect(await store.read((r) => r.audit.list({ offset: 1, limit: 10 }))).toHaveLength(1);
    });

    it('rolls back every write when the unit of work fails', async () => {
      await expect(
        store.write(async (r) => {
          await r.workspace.put(ws);
          await r.audit.append(sampleAuditEvent(nextId(), ws.id));
          throw new Error('simulated failure');
        }),
      ).rejects.toThrow('simulated failure');
      expect(await store.isEmpty()).toBe(true);
    });

    it('produces a snapshot that restores into an empty store identically', async () => {
      await store.write(async (r) => {
        await r.workspace.put(ws);
        await r.audit.append(sampleAuditEvent(nextId(), ws.id));
        await r.audit.append(sampleAuditEvent(nextId(), ws.id, { action: 'workspace.updated' }));
      });
      const snapshot = await store.snapshot();
      expect(snapshot.schemaVersion).toBe(store.schemaVersion);

      const target = await createStore();
      await target.restore(snapshot);
      expect(await target.snapshot()).toEqual(snapshot);
    });

    it('refuses to restore into a non-empty store and leaves it unchanged', async () => {
      await store.write((r) => r.workspace.put(ws));
      const before = await store.snapshot();
      const other: WorkspaceSnapshot = {
        schemaVersion: store.schemaVersion,
        tables: { ...emptyTables(), workspace: [sampleWorkspace({ name: 'Other' })] },
      };
      await expect(store.restore(other)).rejects.toBeInstanceOf(WorkspaceNotEmptyError);
      expect(await store.snapshot()).toEqual(before);
    });

    it('restores atomically: a duplicate key leaves the store empty', async () => {
      const id = nextId();
      const event = { ...sampleAuditEvent(id, ws.id), sequence: 1 };
      const bad: WorkspaceSnapshot = {
        schemaVersion: store.schemaVersion,
        tables: {
          ...emptyTables(),
          workspace: [ws],
          auditEvents: [event, { ...event, sequence: 2 }],
        },
      };
      await expect(store.restore(bad)).rejects.toThrow();
      expect(await store.isEmpty()).toBe(true);
    });

    it('erases all data', async () => {
      await store.write(async (r) => {
        await r.workspace.put(ws);
        await r.audit.append(sampleAuditEvent(nextId(), ws.id));
      });
      await store.erase();
      expect(await store.isEmpty()).toBe(true);
    });

    it('stores categories, assets, schedules and lines, and queries them by asset and period', async () => {
      const category = sampleCategory(nextId(), ws.id);
      const asset = sampleAsset(nextId(), ws.id, category.id);
      const other = sampleAsset(nextId(), ws.id, category.id, { code: 'B-2' });
      const a = sampleScheduleWithLines(nextId, asset);
      const b = sampleScheduleWithLines(nextId, other);
      await store.write(async (r) => {
        await r.workspace.put(ws);
        await r.categories.put(category);
        await r.assets.put(asset);
        await r.assets.put(other);
        for (const x of [a, b]) {
          await r.depreciation.addSchedule(x.schedule);
          await r.depreciation.addLines(x.lines);
        }
      });
      await store.read(async (r) => {
        expect(await r.categories.get(category.id)).toEqual(category);
        expect(await r.assets.get(asset.id)).toEqual(asset);
        expect((await r.assets.list()).map((x) => x.id).sort()).toEqual(
          [asset.id, other.id].sort(),
        );
        expect(await r.depreciation.listSchedules(asset.id)).toEqual([a.schedule]);
        expect(await r.depreciation.listAllSchedules()).toHaveLength(2);
        const lines = await r.depreciation.listLines(asset.id);
        expect(lines.map((l) => l.period)).toEqual(a.lines.map((l) => l.period));
        const period = a.lines[1]?.period ?? '';
        expect(
          (await r.depreciation.listLinesForPeriod(period)).map((l) => l.assetId).sort(),
        ).toEqual([asset.id, other.id].sort());
      });
    });

    it('updates an existing asset in place', async () => {
      const category = sampleCategory(nextId(), ws.id);
      const asset = sampleAsset(nextId(), ws.id, category.id);
      await store.write(async (r) => {
        await r.assets.put(asset);
        await r.assets.put({ ...asset, name: 'Renamed' });
      });
      const assets = await store.read((r) => r.assets.list());
      expect(assets).toHaveLength(1);
      expect(assets[0]?.name).toBe('Renamed');
    });

    it('rejects duplicate depreciation line ids and keeps nothing from that write', async () => {
      const category = sampleCategory(nextId(), ws.id);
      const asset = sampleAsset(nextId(), ws.id, category.id);
      const { schedule, lines } = sampleScheduleWithLines(nextId, asset);
      const [first] = lines;
      if (!first) throw new Error('expected lines');
      await expect(
        store.write(async (r) => {
          await r.assets.put(asset);
          await r.depreciation.addSchedule(schedule);
          await r.depreciation.addLines([first, first]);
        }),
      ).rejects.toThrow();
      expect(await store.isEmpty()).toBe(true);
    });

    it('lists audit events for one entity, newest first', async () => {
      const assetId = nextId();
      await store.write(async (r) => {
        await r.audit.append(sampleAuditEvent(nextId(), ws.id));
        await r.audit.append(
          sampleAuditEvent(nextId(), ws.id, {
            entityType: 'asset',
            entityId: assetId,
            action: 'asset.created',
          }),
        );
        await r.audit.append(
          sampleAuditEvent(nextId(), ws.id, {
            entityType: 'asset',
            entityId: assetId,
            action: 'asset.updated',
          }),
        );
      });
      const events = await store.read((r) => r.audit.listForEntity('asset', assetId));
      expect(events.map((e) => e.action)).toEqual(['asset.updated', 'asset.created']);
    });

    it('erases every table including assets and schedules', async () => {
      const category = sampleCategory(nextId(), ws.id);
      const asset = sampleAsset(nextId(), ws.id, category.id);
      const { schedule, lines } = sampleScheduleWithLines(nextId, asset);
      await store.write(async (r) => {
        await r.workspace.put(ws);
        await r.categories.put(category);
        await r.assets.put(asset);
        await r.depreciation.addSchedule(schedule);
        await r.depreciation.addLines(lines);
      });
      await store.erase();
      expect(await store.isEmpty()).toBe(true);
    });

    it('returns copies so callers cannot mutate stored data', async () => {
      await store.write((r) => r.workspace.put(ws));
      const read = await store.read((r) => r.workspace.get());
      if (read) read.name = 'Mutated';
      expect((await store.read((r) => r.workspace.get()))?.name).toBe(ws.name);
    });
  });
}
