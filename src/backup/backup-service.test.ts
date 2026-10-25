import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createWorkspaceService } from '@/application/workspace-service';
import { LOCAL_ACTOR } from '@/domain/audit';
import { DexieWorkspaceStore } from '@/persistence/dexie/dexie-workspace-store';
import { FmsDatabase } from '@/persistence/dexie/fms-database';
import { MemoryWorkspaceStore } from '@/persistence/memory/memory-workspace-store';
import { WorkspaceNotEmptyError, type WorkspaceStore } from '@/repositories';
import { sequentialIds, steppingClock } from '@/test/fixtures';
import { createBackupService, backupFileName, type BackupInspection } from './backup-service';
import { canonicalJson, sha256Hex } from './checksum';
import { MAX_BACKUP_BYTES } from './format';

const APP = { name: 'fms', version: '0.1.0-test' };
let dbCount = 0;

const adapters: [string, () => WorkspaceStore][] = [
  ['memory', () => new MemoryWorkspaceStore()],
  ['dexie', () => new DexieWorkspaceStore(new FmsDatabase(`backup-test-${++dbCount}`))],
];

function services(store: WorkspaceStore, idPrefix = 1) {
  const deps = { store, newId: sequentialIds(idPrefix), now: steppingClock(), actor: LOCAL_ACTOR };
  return {
    workspace: createWorkspaceService(deps),
    backup: createBackupService({ ...deps, app: APP }),
  };
}

async function populatedSource(createStore: () => WorkspaceStore) {
  const store = createStore();
  const s = services(store);
  const ws = await s.workspace.createWorkspace('Accra Transport');
  await s.workspace.updateWorkspace({
    name: 'Accra Transport Ltd',
    settings: { ...ws.settings, backupReminderDays: 3 },
  });
  return { store, ...s };
}

function expectProblem(result: BackupInspection, code: string) {
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.problem.code).toBe(code);
}

/**
 * Re-signs edited data so a test can reach validation stages after the checksum.
 * `any` is deliberate: tests poke arbitrary, possibly invalid values into the parsed file.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
async function resign(contents: string, edit: (envelope: Record<string, any>) => void) {
  const envelope = JSON.parse(contents) as Record<string, any>;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  edit(envelope);
  envelope.checksum.value = await sha256Hex(canonicalJson(envelope.data));
  return JSON.stringify(envelope);
}

describe.each(adapters)('backup round trip (%s)', (_name, createStore) => {
  it('restores identifiers, records and audit history into an empty workspace', async () => {
    const source = await populatedSource(createStore);
    const original = await source.store.snapshot();
    const file = await source.backup.createBackup();

    const target = services(createStore(), 2);
    const inspection = await target.backup.inspectText(file.contents);
    expect(inspection.ok).toBe(true);
    if (!inspection.ok) return;

    expect(inspection.backup.preview).toMatchObject({
      workspaceId: original.tables.workspace[0]?.id,
      workspaceName: 'Accra Transport Ltd',
      counts: { workspace: 1, auditEvents: 2 },
      app: APP,
    });

    await target.backup.restore(inspection.backup);
    const restored = await target.backup.createBackup().then((f) => JSON.parse(f.contents));

    // Every original record survives unchanged, apart from the backup timestamp.
    const [ws] = restored.data.workspace;
    expect({ ...ws, lastBackupAt: null }).toEqual({
      ...original.tables.workspace[0],
      lastBackupAt: null,
    });
    expect(ws.lastBackupAt).toBe(file.exportedAt.toISOString());
    expect(restored.data.auditEvents.slice(0, 2)).toEqual(original.tables.auditEvents);

    // The restore itself is audited, appended after the original history.
    expect(restored.data.auditEvents[2]).toMatchObject({ action: 'backup.restored', sequence: 3 });
  });

  it('rejects restoring the same backup twice (no silent merge or overwrite)', async () => {
    const source = await populatedSource(createStore);
    const file = await source.backup.createBackup();
    const target = services(createStore(), 2);
    const inspection = await target.backup.inspectText(file.contents);
    if (!inspection.ok) throw new Error('expected valid backup');

    await target.backup.restore(inspection.backup);
    const afterFirst = await target.backup.createBackup();
    await expect(target.backup.restore(inspection.backup)).rejects.toBeInstanceOf(
      WorkspaceNotEmptyError,
    );
    expect(JSON.parse((await target.backup.createBackup()).contents).data).toEqual(
      JSON.parse(afterFirst.contents).data,
    );
  });

  it('refuses to restore over an existing different workspace', async () => {
    const source = await populatedSource(createStore);
    const file = await source.backup.createBackup();
    const target = services(createStore(), 2);
    await target.workspace.createWorkspace('Existing business');
    const inspection = await target.backup.inspectText(file.contents);
    if (!inspection.ok) throw new Error('expected valid backup');

    await expect(target.backup.restore(inspection.backup)).rejects.toBeInstanceOf(
      WorkspaceNotEmptyError,
    );
    expect((await target.workspace.getWorkspace())?.name).toBe('Existing business');
  });
});

describe('backup inspection rejects bad files without touching the workspace', () => {
  async function setup() {
    const source = await populatedSource(() => new MemoryWorkspaceStore());
    const file = await source.backup.createBackup();
    const target = services(new MemoryWorkspaceStore(), 2);
    return { file, target };
  }

  it.each([
    ['empty', ''],
    ['not-json', '{ this is not json'],
    ['not-a-backup', '{"name":"report","rows":[]}'],
    ['not-a-backup', '[{"date":"2026-01-01","amount":"100.00"}]'],
    ['not-json', 'date,amount\n2026-01-01,100.00'],
  ])('rejects %s input', async (code, text) => {
    const { target } = await setup();
    expectProblem(await target.backup.inspectText(text), code);
  });

  it('rejects files from a newer app format', async () => {
    const { file, target } = await setup();
    const text = file.contents.replace('"formatVersion": 1', '"formatVersion": 2');
    expectProblem(await target.backup.inspectText(text), 'newer-format');
  });

  it('rejects data from a newer schema version', async () => {
    const { file, target } = await setup();
    const text = file.contents.replace(/"schemaVersion": \d+/, '"schemaVersion": 99');
    expectProblem(await target.backup.inspectText(text), 'newer-schema');
  });

  it('detects edited or corrupted contents through the checksum', async () => {
    const { file, target } = await setup();
    const text = file.contents.replaceAll('Accra Transport Ltd', 'Tampered Ltd');
    expectProblem(await target.backup.inspectText(text), 'checksum-mismatch');
  });

  it('rejects a header that disagrees with the verified data', async () => {
    const { file, target } = await setup();
    // Only the header (outside the checksum) is edited.
    const text = file.contents.replace('Accra Transport Ltd', 'Tampered Ltd');
    expectProblem(await target.backup.inspectText(text), 'integrity');
  });

  it('detects a truncated file', async () => {
    const { file, target } = await setup();
    expectProblem(await target.backup.inspectText(file.contents.slice(0, -40)), 'not-json');
  });

  it('rejects invalid records even with a valid checksum', async () => {
    const { file, target } = await setup();
    const text = await resign(file.contents, (e) => {
      e.data.workspace[0].id = 'not-a-uuid';
    });
    expectProblem(await target.backup.inspectText(text), 'invalid-data');
  });

  it('rejects unexpected extra fields', async () => {
    const { file, target } = await setup();
    const text = await resign(file.contents, (e) => {
      e.data.workspace[0].injected = '<script>';
    });
    expectProblem(await target.backup.inspectText(text), 'invalid-data');
  });

  it('rejects audit events that belong to another workspace', async () => {
    const { file, target } = await setup();
    const text = await resign(file.contents, (e) => {
      e.data.auditEvents[0].workspaceId = '00000000-0000-4000-8000-0000000fffff';
    });
    expectProblem(await target.backup.inspectText(text), 'integrity');
  });

  it('rejects duplicate audit identifiers', async () => {
    const { file, target } = await setup();
    const text = await resign(file.contents, (e) => {
      e.data.auditEvents[1].id = e.data.auditEvents[0].id;
    });
    expectProblem(await target.backup.inspectText(text), 'integrity');
  });

  it('rejects header counts that do not match the records', async () => {
    const { file, target } = await setup();
    const text = await resign(file.contents, (e) => {
      e.counts.auditEvents = 5;
    });
    expectProblem(await target.backup.inspectText(text), 'integrity');
  });

  it('rejects oversized files before reading them', async () => {
    const { target } = await setup();
    const huge = { size: MAX_BACKUP_BYTES + 1, text: () => Promise.reject(new Error('read')) };
    expectProblem(await target.backup.inspectFile(huge as unknown as Blob), 'too-large');
  });

  it('accepts a reformatted (pretty-printed differently) but unchanged file', async () => {
    const { file, target } = await setup();
    const compact = JSON.stringify(JSON.parse(file.contents));
    expect((await target.backup.inspectText(compact)).ok).toBe(true);
  });
});

describe('createBackup', () => {
  it('fails when there is no workspace', async () => {
    await expect(services(new MemoryWorkspaceStore()).backup.createBackup()).rejects.toThrow();
  });

  it('names files safely and recognisably', () => {
    expect(backupFileName('Accra Transport / Ltd!', new Date('2026-02-03T04:05:00.000Z'))).toBe(
      'fms-accra-transport-ltd-20260203-0405.fmsbackup.json',
    );
    expect(backupFileName('***', new Date('2026-02-03T04:05:00.000Z'))).toMatch(/^fms-workspace-/);
  });
});
