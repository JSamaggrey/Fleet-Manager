import { describe, expect, it } from 'vitest';
import { LOCAL_ACTOR } from '@/domain/audit';
import { parseMoney } from '@/domain/money';
import { MemoryWorkspaceStore } from '@/persistence/memory/memory-workspace-store';
import { sequentialIds, steppingClock } from '@/test/fixtures';
import { createAssetService } from './asset-service';
import { NotFoundError, ValidationError } from './errors';
import { createExpenseService, type ExpenseInput } from './expense-service';
import { createRevenueService, type RevenueInput } from './revenue-service';
import { createWorkspaceService } from './workspace-service';

const ghs = (amount: string) => parseMoney(amount, 'GHS');

async function setup() {
  const store = new MemoryWorkspaceStore();
  // "Today" is 15 June 2026 in Accra.
  const deps = {
    store,
    newId: sequentialIds(),
    now: steppingClock('2026-06-15T09:00:00.000Z'),
    actor: LOCAL_ACTOR,
  };
  const workspace = createWorkspaceService(deps);
  const assets = createAssetService(deps);
  const revenue = createRevenueService(deps);
  const expenses = createExpenseService(deps);
  await workspace.createWorkspace('Fleet');
  const car = (await assets.listCategories()).find((c) => c.name === 'Car');
  if (!car) throw new Error('default categories missing');
  const asset = await assets.createAsset({
    details: {
      code: 'GR-001',
      name: 'Toyota Corolla',
      categoryId: car.id,
      description: null,
      acquisitionDate: '2026-01-10',
      location: null,
      supplier: null,
      notes: null,
      vehicle: null,
    },
    depreciation: {
      method: 'straight-line',
      capitalizedCost: ghs('12000.00'),
      residualValue: ghs('0.00'),
      usefulLifeMonths: 12,
      inServiceDate: '2026-01-15',
    },
  });
  const fuel = (await expenses.listExpenseCategories()).find((c) => c.name === 'Fuel');
  if (!fuel) throw new Error('default expense categories missing');
  return { store, workspace, assets, revenue, expenses, asset, fuel };
}

function trip(assetId: string | null, overrides: Partial<RevenueInput> = {}): RevenueInput {
  return {
    serviceDate: '2026-06-10',
    reference: 'TRIP-0101',
    assetId,
    customer: 'Acme Ltd',
    description: '',
    origin: 'Accra',
    destination: 'Kumasi',
    quantity: '250',
    quantityUnit: 'km',
    rate: ghs('12.00'),
    amount: ghs('3000.00'),
    paymentStatus: 'unpaid',
    notes: '',
    ...overrides,
  };
}

function cost(categoryId: string, overrides: Partial<ExpenseInput> = {}): ExpenseInput {
  return {
    expenseDate: '2026-06-11',
    assignment: 'shared',
    assetId: null,
    categoryId,
    nature: 'operating',
    vendor: 'Depot landlord',
    reference: '',
    description: '',
    amount: ghs('2500.00'),
    paymentStatus: 'paid',
    paymentMethod: 'bank-transfer',
    notes: '',
    ...overrides,
  };
}

async function auditActions(s: Awaited<ReturnType<typeof setup>>) {
  return (await s.workspace.listAuditEvents({ offset: 0, limit: 100 })).items.map((e) => e.action);
}

describe('revenue service', () => {
  it('records revenue against an asset with an audit event', async () => {
    const s = await setup();
    const entry = await s.revenue.recordRevenue(trip(s.asset.id));
    expect(entry).toMatchObject({ assetId: s.asset.id, amount: ghs('3000.00'), void: null });
    expect(entry.description).toBeNull();

    const detail = await s.revenue.getRevenue(entry.id);
    expect(detail.asset?.code).toBe('GR-001');
    expect(detail.history.map((e) => e.action)).toEqual(['revenue.recorded']);
    expect(detail.history[0]?.changes).toContainEqual({
      field: 'amount',
      before: null,
      after: 'GHS 3000.00',
    });
  });

  it('allows explicitly unassigned revenue', async () => {
    const s = await setup();
    await s.revenue.recordRevenue(trip(null));
    const [row] = await s.revenue.listRevenue();
    expect(row?.asset).toBeNull();
    expect(row?.entry.assetId).toBeNull();
  });

  it('rejects unknown assets, future dates and non-positive amounts without writing', async () => {
    const s = await setup();
    const before = await auditActions(s);
    await expect(
      s.revenue.recordRevenue(trip('00000000-0000-4000-8000-00000000ffff')),
    ).rejects.toMatchObject({ field: 'assetId' });
    await expect(
      s.revenue.recordRevenue(trip(s.asset.id, { serviceDate: '2026-06-16' })),
    ).rejects.toMatchObject({ field: 'serviceDate' });
    await expect(
      s.revenue.recordRevenue(trip(s.asset.id, { amount: ghs('0.00') })),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await s.revenue.listRevenue()).toEqual([]);
    expect(await auditActions(s)).toEqual(before);
  });

  it('audits each corrected field and skips no-op updates', async () => {
    const s = await setup();
    const entry = await s.revenue.recordRevenue(trip(null));
    const same = await s.revenue.updateRevenue(entry.id, trip(null));
    expect(same).toEqual(entry);

    const corrected = await s.revenue.updateRevenue(
      entry.id,
      trip(s.asset.id, { amount: ghs('3100.00') }),
    );
    expect(corrected.assetId).toBe(s.asset.id);
    const { history } = await s.revenue.getRevenue(entry.id);
    expect(history.map((e) => e.action)).toEqual(['revenue.updated', 'revenue.recorded']);
    expect(history[0]?.changes).toEqual([
      { field: 'asset', before: 'Unassigned', after: 'GR-001' },
      { field: 'amount', before: 'GHS 3000.00', after: 'GHS 3100.00' },
    ]);
  });

  it('voids with a reason, keeps the record, and then refuses changes', async () => {
    const s = await setup();
    const entry = await s.revenue.recordRevenue(trip(s.asset.id));
    await expect(s.revenue.voidRevenue(entry.id, ' ')).rejects.toMatchObject({ field: 'reason' });

    const voided = await s.revenue.voidRevenue(entry.id, 'Entered twice');
    expect(voided.void).toEqual({ voidedAt: expect.any(String), reason: 'Entered twice' });
    expect(voided.amount).toEqual(entry.amount);
    expect(await s.revenue.listRevenue()).toHaveLength(1);

    await expect(s.revenue.voidRevenue(entry.id, 'Again')).rejects.toBeInstanceOf(ValidationError);
    await expect(s.revenue.updateRevenue(entry.id, trip(s.asset.id))).rejects.toBeInstanceOf(
      ValidationError,
    );
    const { history } = await s.revenue.getRevenue(entry.id);
    expect(history.map((e) => e.action)).toEqual(['revenue.voided', 'revenue.recorded']);
    expect(history[0]?.summary).toContain('Entered twice');
  });

  it('reports a missing entry', async () => {
    const s = await setup();
    await expect(
      s.revenue.getRevenue('00000000-0000-4000-8000-00000000ffff'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('lists newest service date first', async () => {
    const s = await setup();
    await s.revenue.recordRevenue(trip(null, { reference: 'OLD', serviceDate: '2026-05-01' }));
    await s.revenue.recordRevenue(trip(null, { reference: 'NEW', serviceDate: '2026-06-01' }));
    expect((await s.revenue.listRevenue()).map((r) => r.entry.reference)).toEqual(['NEW', 'OLD']);
  });
});

describe('expense service', () => {
  it('records shared and direct expenses separately', async () => {
    const s = await setup();
    const shared = await s.expenses.recordExpense(cost(s.fuel.id));
    const direct = await s.expenses.recordExpense(
      cost(s.fuel.id, { assignment: 'asset', assetId: s.asset.id, amount: ghs('620.00') }),
    );
    expect(shared).toMatchObject({ assignment: 'shared', assetId: null });
    expect(direct).toMatchObject({ assignment: 'asset', assetId: s.asset.id });
    const rows = await s.expenses.listExpenses();
    expect(rows.find((r) => r.expense.id === direct.id)?.asset?.code).toBe('GR-001');
    expect(rows.every((r) => r.categoryName === 'Fuel')).toBe(true);
  });

  it('requires an asset only for direct expenses', async () => {
    const s = await setup();
    await expect(
      s.expenses.recordExpense(cost(s.fuel.id, { assignment: 'asset', assetId: null })),
    ).rejects.toMatchObject({ field: 'assetId' });
    await expect(
      s.expenses.recordExpense(cost(s.fuel.id, { assignment: 'shared', assetId: s.asset.id })),
    ).rejects.toMatchObject({ field: 'assetId' });
  });

  it('rejects unknown and archived categories for new expenses', async () => {
    const s = await setup();
    await expect(
      s.expenses.recordExpense(cost('00000000-0000-4000-8000-00000000ffff')),
    ).rejects.toMatchObject({ field: 'categoryId' });
    const expense = await s.expenses.recordExpense(cost(s.fuel.id));
    await s.expenses.updateExpenseCategory(s.fuel.id, { name: 'Fuel', archived: true });
    await expect(s.expenses.recordExpense(cost(s.fuel.id))).rejects.toMatchObject({
      field: 'categoryId',
    });
    // An existing expense keeps its archived category when corrected.
    const corrected = await s.expenses.updateExpense(
      expense.id,
      cost(s.fuel.id, { amount: ghs('2600.00') }),
    );
    expect(corrected.amount).toEqual(ghs('2600.00'));
  });

  it('reclassifies an unassigned expense with a field-level audit trail', async () => {
    const s = await setup();
    const expense = await s.expenses.recordExpense(cost(s.fuel.id, { assignment: 'unassigned' }));
    await s.expenses.updateExpense(
      expense.id,
      cost(s.fuel.id, { assignment: 'asset', assetId: s.asset.id }),
    );
    const { history } = await s.expenses.getExpense(expense.id);
    expect(history[0]?.changes).toEqual([
      { field: 'assignment', before: 'Unassigned', after: 'Direct (asset)' },
      { field: 'asset', before: null, after: 'GR-001' },
    ]);
  });

  it('voids an expense permanently with a reason', async () => {
    const s = await setup();
    const expense = await s.expenses.recordExpense(cost(s.fuel.id));
    const voided = await s.expenses.voidExpense(expense.id, 'Wrong supplier invoice');
    expect(voided.void?.reason).toBe('Wrong supplier invoice');
    await expect(s.expenses.updateExpense(expense.id, cost(s.fuel.id))).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(await auditActions(s)).toContain('expense.voided');
  });

  it('manages expense categories with unique names', async () => {
    const s = await setup();
    const created = await s.expenses.createExpenseCategory('Security');
    await expect(s.expenses.createExpenseCategory('security')).rejects.toMatchObject({
      field: 'name',
    });
    const renamed = await s.expenses.updateExpenseCategory(created.id, {
      name: 'Security guards',
      archived: false,
    });
    expect(renamed.name).toBe('Security guards');
    expect(await auditActions(s)).toEqual(
      expect.arrayContaining(['expense.category-created', 'expense.category-updated']),
    );
  });
});

describe('workspace creation', () => {
  it('seeds default expense categories, and the demo seeds sample activity', async () => {
    const store = new MemoryWorkspaceStore();
    const deps = {
      store,
      newId: sequentialIds(3),
      now: steppingClock('2026-06-15T09:00:00.000Z'),
      actor: LOCAL_ACTOR,
    };
    await createWorkspaceService(deps).createDemoWorkspace();
    const revenue = await createRevenueService(deps).listRevenue();
    const expenses = await createExpenseService(deps).listExpenses();
    expect(revenue.length).toBeGreaterThan(0);
    expect(revenue.some((r) => r.entry.assetId === null)).toBe(true);
    expect(expenses.some((e) => e.expense.assignment === 'shared')).toBe(true);
    expect(expenses.some((e) => e.expense.nature === 'capital')).toBe(true);
    // Nothing is dated in the future.
    expect(revenue.every((r) => r.entry.serviceDate <= '2026-06-15')).toBe(true);
    expect(expenses.every((e) => e.expense.expenseDate <= '2026-06-15')).toBe(true);
  });
});
