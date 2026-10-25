import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryWorkspaceStore } from '@/persistence/memory/memory-workspace-store';
import { sequentialIds } from '@/test/fixtures';
import { createQueryClient } from '@/ui/queries';
import { App } from './App';
import { createServices } from './create-services';

// "Today" is 15 June 2026 in Accra.
const NOW = new Date('2026-06-15T09:00:00.000Z');

async function renderDemo(path: string) {
  const services = createServices(new MemoryWorkspaceStore(), {
    newId: sequentialIds(),
    now: () => NOW,
    saveFile: () => undefined,
  });
  await services.workspace.createDemoWorkspace();
  window.location.hash = `#${path}`;
  const user = userEvent.setup();
  render(<App services={services} queryClient={createQueryClient()} />);
  return { user, services };
}

beforeEach(() => {
  window.location.hash = '';
});

describe('tasks', () => {
  it('lists derived tasks, highest priority first, with links to the fix', async () => {
    await renderDemo('/tasks');
    const list = await screen.findByRole('list', { name: 'Open tasks' });
    const items = within(list).getAllByRole('listitem');
    expect(within(items[0] as HTMLElement).getByText('High')).toBeInTheDocument();
    const fix = within(list).getByRole('link', { name: 'Assign an asset to revenue JOB-0301' });
    expect(fix.getAttribute('href')).toMatch(/#\/revenue\/.+\/edit$/);
    expect(within(list).getByText(/Close depreciation through May 2026/)).toBeInTheDocument();
    expect(screen.getByText(/No due dates are set/)).toBeInTheDocument();
  });

  it('removes a task once its source record is fixed', async () => {
    const { user, services } = await renderDemo('/tasks');
    const unassigned = (await services.revenue.listRevenue()).find(
      (r) => r.entry.reference === 'JOB-0301',
    );
    const demo1 = (await services.assets.listAssets()).items.find(
      (i) => i.asset.code === 'DEMO-001',
    );
    if (!unassigned || !demo1) throw new Error('demo data missing');
    await screen.findByRole('link', { name: 'Assign an asset to revenue JOB-0301' });

    await user.click(screen.getByRole('link', { name: 'Assign an asset to revenue JOB-0301' }));
    await user.selectOptions(
      await screen.findByLabelText('Asset'),
      `DEMO-001 — ${demo1.asset.name}`,
    );
    await user.click(screen.getByRole('button', { name: 'Save correction' }));
    await screen.findByRole('heading', { name: /JOB-0301/ });

    window.location.hash = '#/tasks';
    await screen.findByRole('list', { name: 'Open tasks' });
    // Cached tasks may show for a moment while the list refreshes.
    await waitFor(() =>
      expect(
        screen.queryByRole('link', { name: 'Assign an asset to revenue JOB-0301' }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('link', { name: /Classify the .* expense/ })).toBeInTheDocument();
  });
});

describe('focus after navigation', () => {
  it('moves focus to the main content when the page changes', async () => {
    const { user } = await renderDemo('/');
    await screen.findByRole('heading', { name: 'Dashboard' });
    const nav = screen.getByRole('navigation', { name: 'Main' });
    await user.click(within(nav).getByRole('link', { name: 'Tasks' }));
    await screen.findByRole('heading', { name: 'Tasks' });
    await waitFor(() => expect(document.activeElement?.id).toBe('main'));
  });
});
