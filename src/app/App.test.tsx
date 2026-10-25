import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackupFile } from '@/backup/backup-service';
import { MemoryWorkspaceStore } from '@/persistence/memory/memory-workspace-store';
import { sequentialIds } from '@/test/fixtures';
import { createQueryClient } from '@/ui/queries';
import { App } from './App';
import { createServices } from './create-services';

const NOW = new Date('2026-03-10T09:00:00.000Z');

function renderApp(store = new MemoryWorkspaceStore(), idPrefix = 1, applyAccept = true) {
  const saved: BackupFile[] = [];
  const services = createServices(store, {
    newId: sequentialIds(idPrefix),
    now: () => NOW,
    saveFile: (file) => saved.push(file),
  });
  const user = userEvent.setup({ applyAccept });
  render(<App services={services} queryClient={createQueryClient()} />);
  return { user, saved, services, store };
}

async function createWorkspace(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.type(await screen.findByLabelText('Workspace name'), name);
  await user.click(screen.getByRole('button', { name: 'Create workspace' }));
  await screen.findByRole('heading', { name: 'Dashboard' });
}

beforeEach(() => {
  window.location.hash = '';
});

describe('onboarding', () => {
  it('explains local-only storage and creates a workspace', async () => {
    const { user } = renderApp();
    expect(
      await screen.findByText(/each device has its own separate workspace/i),
    ).toBeInTheDocument();

    await createWorkspace(user, 'Accra Transport');
    expect(screen.getByTestId('workspace-name')).toHaveTextContent('Accra Transport');
    expect(screen.getByText('No backup yet', { selector: 'p' })).toBeInTheDocument();
  });

  it('validates the workspace name', async () => {
    const { user, store } = renderApp();
    await user.click(await screen.findByRole('button', { name: 'Create workspace' }));
    expect(await screen.findByText('Enter a workspace name.')).toBeInTheDocument();
    expect(screen.getByLabelText('Workspace name')).toHaveAttribute('aria-invalid', 'true');
    expect(await store.isEmpty()).toBe(true);
  });

  it('labels a demo workspace', async () => {
    const { user } = renderApp();
    await user.click(await screen.findByRole('button', { name: 'Open demo workspace' }));
    expect(await screen.findByText('DEMO')).toBeInTheDocument();
  });
});

describe('settings and audit', () => {
  it('saves settings, updates the header and records the change in the audit log', async () => {
    const { user } = renderApp();
    await createWorkspace(user, 'Fleet');

    await user.click(screen.getByRole('link', { name: 'Settings' }));
    const name = await screen.findByLabelText('Workspace name');
    await user.clear(name);
    await user.type(name, 'Fleet Co');
    await user.selectOptions(screen.getByLabelText('Week starts on'), 'Sunday');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(await screen.findByText('Settings saved')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-name')).toHaveTextContent('Fleet Co');

    await user.click(screen.getByRole('link', { name: 'Audit log' }));
    const table = await screen.findByRole('table');
    expect(within(table).getByText('Workspace settings updated')).toBeInTheDocument();
    expect(within(table).getByText(/Fleet → Fleet Co/)).toBeInTheDocument();
    expect(within(table).getByText(/1 → 0/)).toBeInTheDocument();
  });

  it('rejects an out-of-range reminder without saving', async () => {
    const { user, services } = renderApp();
    await createWorkspace(user, 'Fleet');
    await user.click(screen.getByRole('link', { name: 'Settings' }));
    const days = await screen.findByLabelText('Backup reminder (days)');
    await user.clear(days);
    await user.type(days, '500');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(await screen.findByText('Use at most 90 days.')).toBeInTheDocument();
    expect((await services.workspace.getWorkspace())?.settings.backupReminderDays).toBe(7);
  });
});

describe('backup, erase and restore', () => {
  it('downloads a backup, erases the workspace, and restores it after preview and confirmation', async () => {
    const { user, saved, store } = renderApp();
    await createWorkspace(user, 'Accra Transport');
    const original = await store.snapshot();

    await user.click(screen.getByRole('link', { name: 'Backup & Restore' }));
    await user.click(await screen.findByRole('button', { name: 'Download full backup' }));
    expect(await screen.findByText('Backup file created')).toBeInTheDocument();
    expect(saved).toHaveLength(1);
    expect(screen.queryByText('No backup yet', { selector: 'p' })).not.toBeInTheDocument();

    // Erase requires the exact name.
    await user.click(screen.getByRole('button', { name: 'Erase workspace…' }));
    const dialog = await screen.findByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Erase workspace' });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByRole('textbox'), 'Accra Transport');
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    expect(await screen.findByRole('heading', { name: 'Set up this device' })).toBeInTheDocument();
    expect(await store.isEmpty()).toBe(true);

    // Restore: choose file → preview → confirm.
    const [backup] = saved;
    if (!backup) throw new Error('expected a saved backup file');
    const file = new File([backup.contents], backup.fileName, { type: 'application/json' });
    await user.upload(screen.getByLabelText('Backup file'), file);
    expect(await screen.findByText('Backup checked: ready to restore')).toBeInTheDocument();
    expect(screen.getByText('Accra Transport')).toBeInTheDocument();
    expect(await store.isEmpty()).toBe(true); // nothing written before confirmation

    await user.click(screen.getByRole('button', { name: 'Restore this workspace…' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Restore workspace' }),
    );

    await screen.findByRole('heading', { name: 'Dashboard' });
    expect(screen.getByTestId('workspace-name')).toHaveTextContent('Accra Transport');
    const restored = await store.snapshot();
    expect(restored.tables.workspace[0]?.id).toBe(original.tables.workspace[0]?.id);
  });

  it('shows why a bad file is rejected and changes nothing', async () => {
    // The picker filters to .json, but users can pick any file via "All files".
    const { user, store } = renderApp(new MemoryWorkspaceStore(), 1, false);
    const file = new File(['date,amount\n2026-01-01,10.00'], 'report.csv', { type: 'text/csv' });
    await user.upload(await screen.findByLabelText('Backup file'), file);
    expect(await screen.findByText('This file cannot be restored')).toBeInTheDocument();
    expect(screen.getByText(/not valid JSON/)).toBeInTheDocument();
    await waitFor(async () => expect(await store.isEmpty()).toBe(true));
  });
});

describe('device status', () => {
  it('shows offline state as normal operation', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { user } = renderApp();
    await createWorkspace(user, 'Fleet');
    expect(screen.getByText('Offline — working locally')).toBeInTheDocument();
    online.mockRestore();
  });
});
