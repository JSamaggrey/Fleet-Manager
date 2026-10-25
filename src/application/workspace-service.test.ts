import { describe, expect, it } from 'vitest';
import { DEFAULT_WORKSPACE_SETTINGS } from '@/domain/workspace';
import { MemoryWorkspaceStore } from '@/persistence/memory/memory-workspace-store';
import { LOCAL_ACTOR } from '@/domain/audit';
import { sequentialIds, steppingClock } from '@/test/fixtures';
import { ConfirmationMismatchError, NoWorkspaceError, WorkspaceAlreadyExistsError } from './errors';
import { createWorkspaceService } from './workspace-service';

function setup() {
  const store = new MemoryWorkspaceStore();
  const service = createWorkspaceService({
    store,
    newId: sequentialIds(),
    now: steppingClock(),
    actor: LOCAL_ACTOR,
  });
  return { store, service };
}

describe('workspace service', () => {
  it('returns null when no workspace exists', async () => {
    expect(await setup().service.getWorkspace()).toBeNull();
  });

  it('creates a workspace with documented defaults and an audit event', async () => {
    const { service } = setup();
    const ws = await service.createWorkspace('  Accra Transport  ');
    expect(ws.name).toBe('Accra Transport');
    expect(ws.kind).toBe('business');
    expect(ws.settings).toEqual(DEFAULT_WORKSPACE_SETTINGS);
    expect(ws.lastBackupAt).toBeNull();

    const audit = await service.listAuditEvents({ offset: 0, limit: 10 });
    expect(audit.total).toBe(1);
    expect(audit.items[0]).toMatchObject({
      action: 'workspace.created',
      entityId: ws.id,
      workspaceId: ws.id,
      actor: LOCAL_ACTOR,
    });
  });

  it('rejects an invalid name without writing anything', async () => {
    const { service, store } = setup();
    await expect(service.createWorkspace('   ')).rejects.toThrow();
    expect(await store.isEmpty()).toBe(true);
  });

  it('never creates a second workspace', async () => {
    const { service } = setup();
    await service.createWorkspace('First');
    await expect(service.createDemoWorkspace()).rejects.toBeInstanceOf(WorkspaceAlreadyExistsError);
    expect((await service.getWorkspace())?.name).toBe('First');
  });

  it('labels demo workspaces', async () => {
    const ws = await setup().service.createDemoWorkspace();
    expect(ws.kind).toBe('demo');
  });

  it('audits settings changes field by field', async () => {
    const { service } = setup();
    const ws = await service.createWorkspace('Fleet');
    const updated = await service.updateWorkspace({
      name: 'Fleet Co',
      settings: { ...ws.settings, weekStartsOn: 0, backupReminderDays: 3 },
    });
    expect(updated.updatedAt > ws.updatedAt).toBe(true);

    const [latest] = (await service.listAuditEvents({ offset: 0, limit: 1 })).items;
    expect(latest?.action).toBe('workspace.updated');
    expect(latest?.changes).toEqual([
      { field: 'name', before: 'Fleet', after: 'Fleet Co' },
      { field: 'settings.weekStartsOn', before: 1, after: 0 },
      { field: 'settings.backupReminderDays', before: 7, after: 3 },
    ]);
  });

  it('does not write or audit an update with no changes', async () => {
    const { service } = setup();
    const ws = await service.createWorkspace('Fleet');
    const same = await service.updateWorkspace({ name: ws.name, settings: ws.settings });
    expect(same).toEqual(ws);
    expect((await service.listAuditEvents({ offset: 0, limit: 10 })).total).toBe(1);
  });

  it('rejects invalid settings', async () => {
    const { service } = setup();
    const ws = await service.createWorkspace('Fleet');
    await expect(
      service.updateWorkspace({
        name: 'Fleet',
        settings: { ...ws.settings, timeZone: 'Mars/Base' },
      }),
    ).rejects.toThrow();
    await expect(
      service.updateWorkspace({
        name: 'Fleet',
        settings: { ...ws.settings, backupReminderDays: 0 },
      }),
    ).rejects.toThrow();
  });

  it('records backup creation', async () => {
    const { service } = setup();
    await service.createWorkspace('Fleet');
    const at = new Date('2026-02-01T10:00:00.000Z');
    const ws = await service.recordBackupCreated('fleet.fmsbackup.json', at);
    expect(ws.lastBackupAt).toBe(at.toISOString());
    const [latest] = (await service.listAuditEvents({ offset: 0, limit: 1 })).items;
    expect(latest?.action).toBe('backup.created');
  });

  it('requires the exact workspace name to erase', async () => {
    const { service, store } = setup();
    await service.createWorkspace('Fleet');
    await expect(service.eraseWorkspace('fleet')).rejects.toBeInstanceOf(ConfirmationMismatchError);
    expect(await store.isEmpty()).toBe(false);
    await service.eraseWorkspace('Fleet');
    expect(await store.isEmpty()).toBe(true);
  });

  it('fails clearly when updating without a workspace', async () => {
    await expect(
      setup().service.updateWorkspace({ name: 'x', settings: DEFAULT_WORKSPACE_SETTINGS }),
    ).rejects.toBeInstanceOf(NoWorkspaceError);
  });
});
