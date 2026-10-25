import { describe, expect, it } from 'vitest';
import { createAssetService } from '@/application/asset-service';
import { createExpenseService } from '@/application/expense-service';
import { createRevenueService } from '@/application/revenue-service';
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
    revenue: createRevenueService(deps),
    expenses: createExpenseService(deps),
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

/** A Phase 2 (data version 2) file: today's demo backup without the version 3 tables. */
async function phase2Backup() {
  const contents = (await (await sourceWithAssets()).backup.createBackup()).contents;
  return resign(contents, (e) => {
    e.schemaVersion = 2;
    delete e.data.expenseCategories;
    delete e.data.revenueEntries;
    delete e.data.expenses;
    delete e.counts.expenseCategories;
    delete e.counts.revenueEntries;
    delete e.counts.expenses;
  });
}

describe('Phase 2 backups stay restorable', () => {
  it('restores a data version 2 file, adding default expense categories', async () => {
    const target = services(new MemoryWorkspaceStore(), 2);
    const result = await target.backup.inspectText(await phase2Backup());
    if (!result.ok) throw new Error(result.problem.message);
    expect(result.backup.preview).toMatchObject({
      schemaVersion: 2,
      upgradedFrom: 2,
      counts: { assets: 3, revenueEntries: 0, expenses: 0, expenseCategories: 11 },
    });
    await target.backup.restore(result.backup);
    expect(await target.expenses.listExpenseCategories()).toHaveLength(11);
    expect(await target.revenue.listRevenue()).toEqual([]);
    expect((await target.assets.listAssets()).items).toHaveLength(3);
  });

  it('rejects a version 2 file that already contains version 3 tables', async () => {
    const text = await resign(
      (await (await sourceWithAssets()).backup.createBackup()).contents,
      (e) => {
        e.schemaVersion = 2;
      },
    );
    expectProblem(
      await services(new MemoryWorkspaceStore(), 2).backup.inspectText(text),
      'invalid-data',
    );
  });
});

describe('version 3 round trip with revenue and expenses', () => {
  it('preserves revenue, expenses, voids, categories and audit history', async () => {
    const source = await sourceWithAssets();
    const [first] = await source.revenue.listRevenue();
    if (!first) throw new Error('demo revenue missing');
    await source.revenue.voidRevenue(first.entry.id, 'Duplicate trip');
    const file = await source.backup.createBackup();
    const original = JSON.parse(file.contents).data;
    expect(original.revenueEntries.length).toBeGreaterThan(0);
    expect(original.expenses.length).toBeGreaterThan(0);

    const target = services(new MemoryWorkspaceStore(), 2);
    const result = await target.backup.inspectText(file.contents);
    if (!result.ok) throw new Error(result.problem.message);
    await target.backup.restore(result.backup);

    const restored = JSON.parse((await target.backup.createBackup()).contents).data;
    for (const table of ['expenseCategories', 'revenueEntries', 'expenses']) {
      expect(restored[table]).toEqual(original[table]);
    }
    // The restore appends one audit event; everything before it is identical.
    expect(restored.auditEvents.slice(0, -1)).toEqual(original.auditEvents);
    expect((await target.revenue.getRevenue(first.entry.id)).entry.void?.reason).toBe(
      'Duplicate trip',
    );
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

  it('rejects revenue that refers to an unknown asset', async () => {
    const text = await resign(await file(), (e) => {
      const entry = e.data.revenueEntries.find((r: { assetId: string | null }) => r.assetId);
      entry.assetId = '00000000-0000-4000-8000-00000000fffd';
    });
    expectProblem(await target().backup.inspectText(text), 'integrity', /revenue.*unknown asset/);
  });

  it('rejects an expense whose category is missing', async () => {
    const text = await resign(await file(), (e) => {
      e.data.expenses[0].categoryId = '00000000-0000-4000-8000-00000000fffc';
    });
    expectProblem(await target().backup.inspectText(text), 'integrity', /unknown expense category/);
  });

  it('rejects a shared expense that names an asset', async () => {
    const text = await resign(await file(), (e) => {
      const shared = e.data.expenses.find((x: { assignment: string }) => x.assignment === 'shared');
      shared.assetId = e.data.assets[0].id;
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
