import { describe, expect, it } from 'vitest';
import { createAssetService } from '@/application/asset-service';
import { createWorkspaceService } from '@/application/workspace-service';
import { LOCAL_ACTOR } from '@/domain/audit';
import { MemoryWorkspaceStore } from '@/persistence/memory/memory-workspace-store';
import type { WorkspaceStore } from '@/repositories';
import { sequentialIds, steppingClock } from '@/test/fixtures';
import { createBackupService, type BackupInspection } from './backup-service';
import { canonicalJson, sha256Hex } from './checksum';

const APP = { name: 'fms', version: 'test' };

function services(store: WorkspaceStore, prefix: number) {
  const deps = {
    store,
    newId: sequentialIds(prefix),
    now: steppingClock('2026-06-15T09:00:00.000Z'),
    actor: LOCAL_ACTOR,
  };
  return {
    workspace: createWorkspaceService(deps),
    assets: createAssetService(deps),
    backup: createBackupService({ ...deps, app: APP }),
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any -- tests edit arbitrary parsed JSON */
async function resign(contents: string, edit: (envelope: Record<string, any>) => void) {
  const envelope = JSON.parse(contents) as Record<string, any>;
  edit(envelope);
  envelope.checksum.value = await sha256Hex(canonicalJson(envelope.data));
  return JSON.stringify(envelope);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function expectProblem(result: BackupInspection, code: string, detail?: RegExp) {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.problem.code).toBe(code);
  if (detail) expect(result.problem.details.join(' | ')).toMatch(detail);
}

/** A Phase 1 (data version 1) backup file, built exactly as that release wrote it. */
async function phase1Backup() {
  const workspace = {
    id: '00000000-0000-4000-8000-000000000a01',
    name: 'Phase One Transport',
    kind: 'business',
    settings: {
      weekStartsOn: 1,
      timeZone: 'Africa/Accra',
      reportingCurrency: 'GHS',
      backupReminderDays: 7,
    },
    createdAt: '2026-01-01T08:00:00.000Z',
    updatedAt: '2026-01-01T08:00:00.000Z',
    lastBackupAt: null,
  };
  const auditEvents = [
    {
      id: '00000000-0000-4000-8000-000000000a02',
      workspaceId: workspace.id,
      sequence: 1,
      occurredAt: '2026-01-01T08:00:00.000Z',
      actor: 'local-user',
      action: 'workspace.created',
      entityType: 'workspace',
      entityId: workspace.id,
      summary: 'Workspace created',
      changes: [],
    },
  ];
  const data = { workspace: [workspace], auditEvents };
  return JSON.stringify({
    format: 'fms.workspace-backup',
    formatVersion: 1,
    schemaVersion: 1,
    app: { name: 'fms', version: '0.1.0' },
    exportedAt: '2026-02-01T10:00:00.000Z',
    workspace: { id: workspace.id, name: workspace.name, kind: workspace.kind },
    counts: { workspace: 1, auditEvents: 1 },
    checksum: { algorithm: 'SHA-256', value: await sha256Hex(canonicalJson(data)) },
    data,
  });
}

async function sourceWithAssets() {
  const s = services(new MemoryWorkspaceStore(), 1);
  await s.workspace.createDemoWorkspace();
  return s;
}

describe('older backups stay restorable', () => {
  it('restores a Phase 1 (data version 1) backup, upgrading it in memory', async () => {
    const target = services(new MemoryWorkspaceStore(), 2);
    const result = await target.backup.inspectText(await phase1Backup());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.backup.preview).toMatchObject({
      schemaVersion: 1,
      upgradedFrom: 1,
      workspaceName: 'Phase One Transport',
      counts: { workspace: 1, auditEvents: 1, assets: 0, assetCategories: 6 },
    });

    await target.backup.restore(result.backup);
    const ws = await target.workspace.getWorkspace();
    expect(ws).toMatchObject({
      id: '00000000-0000-4000-8000-000000000a01',
      depreciationClosedThrough: null,
    });
    expect((await target.assets.listCategories()).length).toBe(6);
    // Existing audit history is kept, with the restore appended.
    const audit = await target.workspace.listAuditEvents({ offset: 0, limit: 10 });
    expect(audit.items.map((e) => e.action)).toEqual(['backup.restored', 'workspace.created']);
  });
});

describe('version 2 round trip with assets and schedules', () => {
  it('preserves assets, schedule versions and every depreciation line', async () => {
    const source = await sourceWithAssets();
    const file = await source.backup.createBackup();
    const original = JSON.parse(file.contents).data;
    expect(original.assets).toHaveLength(3);

    const target = services(new MemoryWorkspaceStore(), 2);
    const result = await target.backup.inspectText(file.contents);
    if (!result.ok) throw new Error(result.problem.message);
    expect(result.backup.preview.upgradedFrom).toBeNull();
    await target.backup.restore(result.backup);

    const restored = JSON.parse((await target.backup.createBackup()).contents).data;
    for (const table of [
      'assetCategories',
      'assets',
      'depreciationSchedules',
      'depreciationLines',
    ]) {
      expect(restored[table]).toEqual(original[table]);
    }
  });
});

describe('cross-table integrity', () => {
  async function file() {
    return (await (await sourceWithAssets()).backup.createBackup()).contents;
  }
  const target = () => services(new MemoryWorkspaceStore(), 2);

  it('rejects an asset whose category is missing', async () => {
    const text = await resign(await file(), (e) => {
      e.data.assets[0].categoryId = '00000000-0000-4000-8000-00000000ffff';
    });
    expectProblem(await target().backup.inspectText(text), 'integrity', /unknown category/);
  });

  it('rejects duplicate asset codes (case-insensitive)', async () => {
    const text = await resign(await file(), (e) => {
      e.data.assets[1].code = e.data.assets[0].code.toLowerCase();
    });
    expectProblem(await target().backup.inspectText(text), 'integrity', /used more than once/);
  });

  it('rejects depreciation lines that do not match a schedule', async () => {
    const text = await resign(await file(), (e) => {
      e.data.depreciationLines[0].scheduleId = '00000000-0000-4000-8000-00000000fffe';
    });
    expectProblem(await target().backup.inspectText(text), 'integrity', /do not match a schedule/);
  });

  it('rejects an asset whose assumptions differ from its latest schedule', async () => {
    const text = await resign(await file(), (e) => {
      e.data.assets[0].depreciation.usefulLifeMonths = 99;
    });
    expectProblem(
      await target().backup.inspectText(text),
      'integrity',
      /latest depreciation schedule/,
    );
  });

  it('rejects a residual above cost inside the file', async () => {
    const text = await resign(await file(), (e) => {
      e.data.assets[0].depreciation.residualValue.amountMinor = 999_999_999;
    });
    expectProblem(await target().backup.inspectText(text), 'invalid-data');
  });

  it('rejects money in an unsupported currency', async () => {
    const text = await resign(await file(), (e) => {
      e.data.depreciationLines[0].charge.currency = 'USD';
    });
    expectProblem(await target().backup.inspectText(text), 'invalid-data');
  });

  it('rejects counts that omit a table', async () => {
    const text = await resign(await file(), (e) => {
      delete e.counts.depreciationLines;
    });
    expectProblem(await target().backup.inspectText(text), 'integrity', /depreciationLines/);
  });
});
