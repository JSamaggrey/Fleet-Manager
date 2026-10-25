import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryWorkspaceStore } from '@/persistence/memory/memory-workspace-store';
import { sequentialIds } from '@/test/fixtures';
import type { SavedFile } from '@/ui/backup/download';
import { createQueryClient } from '@/ui/queries';
import { App } from './App';
import { createServices } from './create-services';

// "Today" is 15 June 2026 in Accra.
const NOW = new Date('2026-06-15T09:00:00.000Z');

async function renderDemo(path: string) {
  const saved: SavedFile[] = [];
  const services = createServices(new MemoryWorkspaceStore(), {
    newId: sequentialIds(),
    now: () => NOW,
    saveFile: (file) => saved.push(file),
  });
  await services.workspace.createDemoWorkspace();
  window.location.hash = `#${path}`;
  const user = userEvent.setup();
  render(<App services={services} queryClient={createQueryClient()} />);
  return { user, services, saved };
}

beforeEach(() => {
  window.location.hash = '';
});

describe('reports', () => {
  it('shows the fleet statement, scope and assumptions for the chosen month', async () => {
    const { user } = await renderDemo('/reports?kind=month&from=2026-05-01&to=2026-05-31');
    const scope = await screen.findByRole('region', { name: 'Report scope' });
    expect(within(scope).getByText('Demo workspace')).toBeInTheDocument();
    expect(within(scope).getByText(/2026-05-01 to 2026-05-31, inclusive/)).toBeInTheDocument();
    expect(screen.getByText(/not statutory net profit/)).toBeInTheDocument();
    expect(screen.getByText(/days inside ÷ days in month/)).toBeInTheDocument();
    // May has ended ("today" is 15 June), so no to-date warning.
    expect(screen.queryByText('This period has not ended')).not.toBeInTheDocument();

    const assets = screen.getByRole('table', { name: /Asset management profit, May 2026/ });
    expect(within(assets).getByRole('link', { name: 'DEMO-001' })).toBeInTheDocument();

    // Moving to the previous month changes the period and the figures.
    const profitMay = screen.getByTestId('fleet-profit').textContent;
    await user.click(screen.getByRole('button', { name: 'Previous period' }));
    expect(await screen.findByText(/2026-04-01 to 2026-04-30, inclusive/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('fleet-profit').textContent).not.toBe(profitMay));
  });

  it('shows N/A margin for a period with no revenue', async () => {
    await renderDemo('/reports?kind=year&from=2020-01-01&to=2020-12-31');
    expect(await screen.findByTestId('fleet-margin')).toHaveTextContent('N/A');
    expect(screen.getByText(/2020-01-01 to 2020-12-31/)).toBeInTheDocument();
  });

  it('drills from an asset’s revenue to the matching records', async () => {
    const { user } = await renderDemo('/reports?kind=month&from=2026-05-01&to=2026-05-31');
    const table = await screen.findByRole('table', { name: /Asset management profit/ });
    const row = within(table).getByRole('link', { name: 'DEMO-001' }).closest('tr');
    if (!row) throw new Error('row missing');
    await user.click(within(row).getAllByRole('link')[1] as HTMLElement); // revenue amount
    expect(await screen.findByRole('heading', { name: 'Revenue' })).toBeInTheDocument();
    expect(await screen.findByLabelText('From (service date)')).toHaveValue('2026-05-01');
    expect(screen.getByRole('link', { name: 'TRIP-0101' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'KSI-0202' })).not.toBeInTheDocument();
  });

  it('exports CSV without changing the workspace', async () => {
    const { user, saved, services } = await renderDemo(
      '/reports?kind=month&from=2026-05-01&to=2026-05-31',
    );
    const auditBefore = (await services.workspace.listAuditEvents({ offset: 0, limit: 1 })).total;
    await user.click(await screen.findByRole('button', { name: 'Asset & fleet profit' }));
    expect(await screen.findByText(/Saved fms-demo-workspace-profit/)).toBeInTheDocument();
    expect(saved[0]?.mimeType).toBe('text/csv');
    expect((await services.workspace.listAuditEvents({ offset: 0, limit: 1 })).total).toBe(
      auditBefore,
    );
  });
});

describe('current period', () => {
  it('warns that a period still in progress shows activity to date only', async () => {
    await renderDemo('/reports?kind=month&from=2026-06-01&to=2026-06-30');
    expect(await screen.findByText('This period has not ended')).toBeInTheDocument();
  });
});

describe('exceptions', () => {
  it('lists unassigned records with links to them', async () => {
    await renderDemo('/exceptions');
    expect(await screen.findByText('Revenue without an asset (1)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'JOB-0301' })).toBeInTheDocument();
    expect(screen.getByText('Unclassified expenses (1)')).toBeInTheDocument();
    expect(screen.getByText('Depreciation months not yet closed')).toBeInTheDocument();
  });
});
