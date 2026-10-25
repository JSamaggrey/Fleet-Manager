import { beforeEach, describe, expect, it } from 'vitest';
import {
  WorkspaceNotEmptyError,
  type WorkspaceSnapshot,
  type WorkspaceStore,
} from '@/repositories';
import { sampleAuditEvent, sampleWorkspace, sequentialIds } from '@/test/fixtures';

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
        tables: { workspace: [sampleWorkspace({ name: 'Other' })], auditEvents: [] },
      };
      await expect(store.restore(other)).rejects.toBeInstanceOf(WorkspaceNotEmptyError);
      expect(await store.snapshot()).toEqual(before);
    });

    it('restores atomically: a duplicate key leaves the store empty', async () => {
      const id = nextId();
      const event = { ...sampleAuditEvent(id, ws.id), sequence: 1 };
      const bad: WorkspaceSnapshot = {
        schemaVersion: store.schemaVersion,
        tables: { workspace: [ws], auditEvents: [event, { ...event, sequence: 2 }] },
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

    it('returns copies so callers cannot mutate stored data', async () => {
      await store.write((r) => r.workspace.put(ws));
      const read = await store.read((r) => r.workspace.get());
      if (read) read.name = 'Mutated';
      expect((await store.read((r) => r.workspace.get()))?.name).toBe(ws.name);
    });
  });
}
