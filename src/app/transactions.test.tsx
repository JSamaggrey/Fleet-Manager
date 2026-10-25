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

describe('recording revenue', () => {
  it('records a trip against an asset, suggesting quantity × rate', async () => {
    const { user, services } = await renderDemo('/revenue/new');
    await user.type(await screen.findByLabelText('Trip / job / contract reference'), 'KSI-9001');
    await user.selectOptions(
      screen.getByLabelText('Asset'),
      'DEMO-002 — Toyota HiAce minibus (demo)',
    );
    await user.type(screen.getByLabelText('Distance / quantity'), '250');
    await user.type(screen.getByLabelText('Rate per unit (GHS)'), '12.50');
    expect(screen.getByText(/Quantity × rate = GHS 3125\.00/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Use as amount' }));
    expect(screen.getByLabelText('Amount (GHS)')).toHaveValue('3125.00');
    await user.click(screen.getByRole('button', { name: 'Record revenue' }));

    expect(await screen.findByRole('heading', { name: /KSI-9001/ })).toBeInTheDocument();
    const saved = (await services.revenue.listRevenue()).find(
      (r) => r.entry.reference === 'KSI-9001',
    );
    expect(saved?.entry.amount).toEqual({ amountMinor: 312500, currency: 'GHS' });
    expect(saved?.asset?.code).toBe('DEMO-002');
  });

  it('requires an explicit asset or "Unassigned" choice and rejects future dates', async () => {
    const { user, services } = await renderDemo('/revenue/new');
    const before = (await services.revenue.listRevenue()).length;
    await user.type(await screen.findByLabelText('Trip / job / contract reference'), 'X-1');
    await user.type(screen.getByLabelText('Amount (GHS)'), '100');
    await user.click(screen.getByRole('button', { name: 'Record revenue' }));
    expect(await screen.findByText(/Choose the asset, or choose "Unassigned"/)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Asset'), 'Unassigned — assign later');
    expect(screen.getByText('Unassigned revenue')).toBeInTheDocument();
    const date = screen.getByLabelText('Service date');
    await user.clear(date);
    await user.type(date, '2026-06-20');
    await user.click(screen.getByRole('button', { name: 'Record revenue' }));
    expect(await screen.findByText(/cannot be in the future/)).toBeInTheDocument();
    expect(await services.revenue.listRevenue()).toHaveLength(before);
  });

  it('voids an entry with a reason and excludes it from the total', async () => {
    const { user, services } = await renderDemo('/revenue');
    const rows = await services.revenue.listRevenue();
    const target = rows.find((r) => r.entry.reference === 'TRIP-0103');
    if (!target) throw new Error('demo revenue missing');
    const totalBefore = await screen.findByTestId('revenue-total');
    const before = totalBefore.textContent;

    window.location.hash = `#/revenue/${target.entry.id}`;
    await user.click(await screen.findByRole('button', { name: 'Void' }));
    const dialog = await screen.findByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Void revenue entry' });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Reason (required)'), 'Customer cancelled');
    await user.click(confirm);

    expect(await screen.findByText('Voided — excluded from all totals')).toBeInTheDocument();
    // Shown in the void notice and in the audit history.
    expect(screen.getAllByText(/Reason: Customer cancelled/)).toHaveLength(2);
    expect(screen.queryByRole('link', { name: 'Correct' })).not.toBeInTheDocument();

    window.location.hash = '#/revenue';
    await waitFor(() => expect(screen.getByTestId('revenue-total').textContent).not.toBe(before));
    // 420.00 less than before.
    expect(screen.getByTestId('revenue-total').textContent).toMatch(/8,630\.00/);
  });
});

describe('recording expenses', () => {
  it('records a shared fleet expense and shows it separately from direct costs', async () => {
    const { user, services } = await renderDemo('/expenses/new');
    await user.click(await screen.findByLabelText(/Shared \/ fleet/));
    await user.selectOptions(screen.getByLabelText('Category'), 'Office and administration');
    await user.type(screen.getByLabelText('Amount (GHS)'), '350');
    await user.click(screen.getByRole('button', { name: 'Record expense' }));

    expect(await screen.findByText(/deducted only in fleet profit/)).toBeInTheDocument();
    const saved = (await services.expenses.listExpenses()).find(
      (r) => r.categoryName === 'Office and administration',
    );
    expect(saved?.expense).toMatchObject({ assignment: 'shared', assetId: null });
  });

  it('asks for the asset when the expense is direct', async () => {
    const { user } = await renderDemo('/expenses/new');
    await user.click(await screen.findByLabelText(/Direct — one asset/));
    await user.selectOptions(screen.getByLabelText('Category'), 'Fuel');
    await user.type(screen.getByLabelText('Amount (GHS)'), '200');
    await user.click(screen.getByRole('button', { name: 'Record expense' }));
    expect(await screen.findByText('Choose the asset.')).toBeInTheDocument();
  });

  it('lists totals by treatment, with capital kept out of operating costs', async () => {
    await renderDemo('/expenses');
    const totals = await screen.findByLabelText('Totals for the expenses shown');
    // Demo: direct 620 + 1,450 + 980; shared 2,500; unassigned 1,200; capital 1,500.
    expect(within(totals).getByText(/3,050\.00/)).toBeInTheDocument();
    expect(within(totals).getByText(/2,500\.00/)).toBeInTheDocument();
    expect(within(totals).getByText(/1,200\.00/)).toBeInTheDocument();
    expect(within(totals).getByText(/1,500\.00/)).toBeInTheDocument();
  });
});

describe('dashboard', () => {
  it('shows this month’s activity and the unassigned count', async () => {
    await renderDemo('/');
    const section = await screen.findByRole('region', { name: 'Revenue and expenses this month' });
    // Demo this month: revenue TRIP-0103 420 + KSI is not in June; direct fuel 980.
    expect(within(section).getByText(/420\.00/)).toBeInTheDocument();
    expect(within(section).getByText(/980\.00/)).toBeInTheDocument();
    expect(within(section).getByText('2 unassigned')).toBeInTheDocument();
  });
});
