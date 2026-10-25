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

async function renderWithWorkspace(path: string, kind: 'business' | 'demo' = 'business') {
  const services = createServices(new MemoryWorkspaceStore(), {
    newId: sequentialIds(),
    now: () => NOW,
    saveFile: () => undefined,
  });
  if (kind === 'demo') await services.workspace.createDemoWorkspace();
  else await services.workspace.createWorkspace('Fleet');
  window.location.hash = `#${path}`;
  const user = userEvent.setup();
  render(<App services={services} queryClient={createQueryClient()} />);
  return { user, services };
}

async function fillNewCar(user: ReturnType<typeof userEvent.setup>, code = 'GR-001') {
  await user.type(await screen.findByLabelText('Asset code'), code);
  await user.type(screen.getByLabelText('Name'), 'Toyota Corolla');
  await user.selectOptions(screen.getByLabelText('Category'), 'Car');
  await user.type(screen.getByLabelText('Acquisition date'), '2026-01-10');
  await user.type(screen.getByLabelText('In-service date'), '2026-01-15');
  await user.clear(screen.getByLabelText('Useful life (months)'));
  await user.type(screen.getByLabelText('Useful life (months)'), '12');
  await user.type(screen.getByLabelText('Capitalised cost (GHS)'), '12,000');
  await user.type(screen.getByLabelText('Registration / plate'), 'GR 1234-22');
}

beforeEach(() => {
  window.location.hash = '';
});

describe('creating an asset', () => {
  it('saves the asset and shows its monthly depreciation schedule', async () => {
    const { user } = await renderWithWorkspace('/assets/new');
    await fillNewCar(user);
    await user.click(screen.getByRole('button', { name: 'Create asset' }));

    expect(await screen.findByRole('heading', { name: /GR-001/ })).toBeInTheDocument();
    const schedule = screen.getByRole('table', { name: /Depreciation schedule for GR-001/ });
    const rows = within(schedule).getAllByRole('row');
    expect(rows).toHaveLength(13); // header + 12 months
    expect(within(rows[1] as HTMLElement).getByText('Jan 2026')).toBeInTheDocument();
    expect(within(schedule).getAllByText(/1,000\.00/).length).toBeGreaterThan(0);
    // Book value at the end of June = 12,000 − 6 × 1,000.
    expect(screen.getAllByText(/6,000\.00/).length).toBeGreaterThan(0);
  });

  it('shows vehicle fields only for vehicle categories', async () => {
    const { user } = await renderWithWorkspace('/assets/new');
    await user.selectOptions(await screen.findByLabelText('Category'), 'Equipment');
    expect(screen.queryByLabelText('Registration / plate')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Category'), 'Car');
    expect(screen.getByLabelText('Registration / plate')).toBeInTheDocument();
  });

  it('validates money, residual value and dates before saving', async () => {
    const { user, services } = await renderWithWorkspace('/assets/new');
    await fillNewCar(user);
    await user.clear(screen.getByLabelText('Residual value (GHS)'));
    await user.type(screen.getByLabelText('Residual value (GHS)'), '13000');
    await user.clear(screen.getByLabelText('In-service date'));
    await user.type(screen.getByLabelText('In-service date'), '2026-01-01');
    await user.click(screen.getByRole('button', { name: 'Create asset' }));
    expect(await screen.findByText('Residual value cannot exceed cost.')).toBeInTheDocument();
    expect(
      screen.getByText('In-service date cannot be before the acquisition date.'),
    ).toBeInTheDocument();
    expect((await services.assets.listAssets()).items).toHaveLength(0);
  });

  it('shows a duplicate code error on the code field', async () => {
    const { user } = await renderWithWorkspace('/assets/new', 'demo');
    await fillNewCar(user, 'demo-001');
    await user.click(screen.getByRole('button', { name: 'Create asset' }));
    expect(await screen.findByText(/already used by/)).toBeInTheDocument();
    expect(screen.getByLabelText('Asset code')).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('asset list', () => {
  it('searches, filters and shows totals', async () => {
    const { user } = await renderWithWorkspace('/assets', 'demo');
    const table = await screen.findByRole('table', { name: /Assets/ });
    expect(within(table).getAllByRole('row')).toHaveLength(4);

    await user.type(screen.getByLabelText('Search'), 'hiace');
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(2));
    expect(within(table).getByText('DEMO-002')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Search'));
    await user.selectOptions(screen.getByLabelText('Category'), 'Equipment');
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(2));
    expect(screen.getByText(/1 asset · total book value/)).toBeInTheDocument();
  });

  it('sorts by a column', async () => {
    const { user } = await renderWithWorkspace('/assets', 'demo');
    const table = await screen.findByRole('table', { name: /Assets/ });
    await user.click(within(table).getByRole('button', { name: /Cost/ }));
    const codes = () =>
      within(table)
        .getAllByRole('link')
        .map((l) => l.textContent);
    // Money columns sort highest first on the first click.
    expect(codes()).toEqual(['DEMO-002', 'DEMO-001', 'DEMO-003']);
    await user.click(within(table).getByRole('button', { name: /Cost/ }));
    expect(codes()).toEqual(['DEMO-003', 'DEMO-001', 'DEMO-002']);
  });
});

describe('revising depreciation', () => {
  it('previews before saving and creates a new schedule version', async () => {
    const { user, services } = await renderWithWorkspace('/assets', 'demo');
    const { items } = await services.assets.listAssets();
    const generator = items.find((i) => i.asset.code === 'DEMO-003');
    if (!generator) throw new Error('missing demo asset');
    window.location.hash = `#/assets/${generator.asset.id}/revise`;

    const life = await screen.findByLabelText(/Useful life/);
    await user.clear(life);
    await user.type(life, '24');
    await user.type(screen.getByLabelText('Reason for the change'), 'Heavier use than planned');
    await user.click(screen.getByRole('button', { name: 'Preview new schedule' }));

    expect(await screen.findByText('Nothing has been saved yet.')).toBeInTheDocument();
    expect(screen.getByText('GH₵1,500.00', { selector: 'dd' })).toBeInTheDocument();
    expect((await services.assets.getAsset(generator.asset.id)).schedules).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Save revision…' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Save revision' }),
    );
    expect(await screen.findByText('v2 · from Apr 2026')).toBeInTheDocument();
    expect((await services.assets.getAsset(generator.asset.id)).schedules).toHaveLength(2);
  });

  it('requires a fresh preview after the assumptions change', async () => {
    const { user, services } = await renderWithWorkspace('/assets', 'demo');
    const { items } = await services.assets.listAssets();
    const id = items[0]?.asset.id ?? '';
    window.location.hash = `#/assets/${id}/revise`;
    const life = await screen.findByLabelText(/Useful life/);
    await user.clear(life);
    await user.type(life, '48');
    await user.click(screen.getByRole('button', { name: 'Preview new schedule' }));
    expect(await screen.findByRole('button', { name: 'Save revision…' })).toBeInTheDocument();
    await user.type(life, '0');
    expect(screen.queryByRole('button', { name: 'Save revision…' })).not.toBeInTheDocument();
  });

  it('asks for a reason only when saving', async () => {
    const { user, services } = await renderWithWorkspace('/assets', 'demo');
    const { items } = await services.assets.listAssets();
    window.location.hash = `#/assets/${items[0]?.asset.id ?? ''}/revise`;
    const life = await screen.findByLabelText(/Useful life/);
    await user.clear(life);
    await user.type(life, '48');
    await user.click(screen.getByRole('button', { name: 'Preview new schedule' }));
    await user.click(await screen.findByRole('button', { name: 'Save revision…' }));
    expect(await screen.findByText('Give a reason for the change.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('depreciation page', () => {
  it('shows the month total and closes ended months after confirmation', async () => {
    const { user, services } = await renderWithWorkspace('/depreciation', 'demo');
    expect(await screen.findByText(/· total depreciation/)).toBeInTheDocument();
    const table = screen.getByRole('table', { name: /Depreciation for Jun 2026/ });
    expect(within(table).getAllByRole('row')).toHaveLength(5); // header + 3 assets + total

    await user.click(screen.getByRole('button', { name: /Close months/ }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Close months' }),
    );
    expect(await screen.findByText('Closed through May 2026')).toBeInTheDocument();
    expect((await services.workspace.getWorkspace())?.depreciationClosedThrough).toBe('2026-05');
  });
});
