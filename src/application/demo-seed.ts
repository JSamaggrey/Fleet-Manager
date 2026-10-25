import type { Asset, AssetCategory } from '@/domain/assets';
import { parseMoney } from '@/domain/money';
import { addMonths, calendarDateInTimeZone, yearMonthOfDate } from '@/domain/periods';
import type { ExpenseCategory } from '@/domain/transactions';
import type { Workspace } from '@/domain/workspace';
import type { Repositories } from '@/repositories';
import { insertAssetWithSchedule, type AssetInput, type RecordContext } from './asset-records';
import { insertExpense, type ExpenseInput } from './expense-service';
import { insertRevenue, type RevenueInput } from './revenue-service';

/** Fictional sample assets for the clearly labelled demo workspace (no real records). */
async function seedDemoAssets(
  repos: Repositories,
  ctx: RecordContext,
  workspace: Workspace,
  categories: readonly AssetCategory[],
): Promise<Asset[]> {
  const categoryId = (name: string) => {
    const category = categories.find((c) => c.name === name);
    if (!category) throw new Error(`Missing default category ${name}.`);
    return category.id;
  };
  const thisMonth = yearMonthOfDate(calendarDateInTimeZone(ctx.at, workspace.settings.timeZone));
  const monthStart = (offset: number) => `${addMonths(thisMonth, offset)}-01`;
  const ghs = (amount: string) => parseMoney(amount, 'GHS');
  const vehicle = (make: string, model: string, year: number, registration: string) => ({
    make,
    model,
    year,
    registration,
    vin: null,
  });

  const demo: AssetInput[] = [
    {
      details: {
        code: 'DEMO-001',
        name: 'Toyota Corolla (demo)',
        categoryId: categoryId('Car'),
        description: 'Sample vehicle for exploring the app.',
        acquisitionDate: monthStart(-14),
        location: 'Accra depot',
        supplier: null,
        notes: null,
        vehicle: vehicle('Toyota', 'Corolla', 2022, 'DEMO 1001-22'),
      },
      depreciation: {
        method: 'straight-line',
        capitalizedCost: ghs('185000.00'),
        residualValue: ghs('35000.00'),
        usefulLifeMonths: 60,
        inServiceDate: monthStart(-14),
      },
    },
    {
      details: {
        code: 'DEMO-002',
        name: 'Toyota HiAce minibus (demo)',
        categoryId: categoryId('Minibus / bus'),
        description: null,
        acquisitionDate: monthStart(-6),
        location: 'Kumasi route',
        supplier: null,
        notes: null,
        vehicle: vehicle('Toyota', 'HiAce', 2021, 'DEMO 2002-21'),
      },
      depreciation: {
        method: 'straight-line',
        capitalizedCost: ghs('420000.00'),
        residualValue: ghs('60000.00'),
        usefulLifeMonths: 72,
        inServiceDate: monthStart(-5),
      },
    },
    {
      details: {
        code: 'DEMO-003',
        name: 'Workshop generator (demo)',
        categoryId: categoryId('Equipment'),
        description: 'Shows a non-vehicle asset without vehicle fields.',
        acquisitionDate: monthStart(-2),
        location: 'Accra depot',
        supplier: null,
        notes: null,
        vehicle: null,
      },
      depreciation: {
        method: 'straight-line',
        capitalizedCost: ghs('36000.00'),
        residualValue: ghs('0.00'),
        usefulLifeMonths: 36,
        inServiceDate: monthStart(-2),
      },
    },
  ];

  const assets = [];
  for (const input of demo) {
    assets.push(await insertAssetWithSchedule(repos, ctx, workspace, input));
  }
  return assets;
}

/**
 * Fictional trips and expenses for the demo assets. Shows a shared expense, a capital item, and
 * unassigned records (exceptions). All dates are in the past or today.
 */
async function seedDemoActivity(
  repos: Repositories,
  ctx: RecordContext,
  workspace: Workspace,
  assets: readonly Asset[],
  expenseCategories: readonly ExpenseCategory[],
): Promise<void> {
  const today = calendarDateInTimeZone(ctx.at, workspace.settings.timeZone);
  const thisMonth = yearMonthOfDate(today);
  const day = (monthOffset: number, d: number) =>
    monthOffset === 0
      ? today
      : `${addMonths(thisMonth, monthOffset)}-${String(d).padStart(2, '0')}`;
  const ghs = (amount: string) => parseMoney(amount, 'GHS');
  const assetId = (code: string) => {
    const asset = assets.find((a) => a.code === code);
    if (!asset) throw new Error(`Missing demo asset ${code}.`);
    return asset.id;
  };
  const categoryId = (name: string) => {
    const category = expenseCategories.find((c) => c.name === name);
    if (!category) throw new Error(`Missing default expense category ${name}.`);
    return category.id;
  };
  const trip = (
    serviceDate: string,
    reference: string,
    code: string | null,
    amount: string,
    extra: Partial<RevenueInput> = {},
  ): RevenueInput => ({
    serviceDate,
    reference,
    assetId: code === null ? null : assetId(code),
    customer: 'Demo customer',
    description: null,
    origin: null,
    destination: null,
    quantity: null,
    quantityUnit: null,
    rate: null,
    amount: ghs(amount),
    paymentStatus: 'paid',
    notes: null,
    ...extra,
  });
  const expense = (
    expenseDate: string,
    category: string,
    target: { asset: string } | 'shared' | 'unassigned',
    amount: string,
    extra: Partial<ExpenseInput> = {},
  ): ExpenseInput => ({
    expenseDate,
    assignment: typeof target === 'string' ? target : 'asset',
    assetId: typeof target === 'string' ? null : assetId(target.asset),
    categoryId: categoryId(category),
    nature: 'operating',
    vendor: 'Demo supplier',
    reference: null,
    description: null,
    amount: ghs(amount),
    paymentStatus: 'paid',
    paymentMethod: 'cash',
    notes: null,
    ...extra,
  });
  const route = { origin: 'Accra', destination: 'Kumasi', quantity: '250', quantityUnit: 'km' };

  const revenue: RevenueInput[] = [
    trip(day(-2, 8), 'KSI-0201', 'DEMO-002', '3000.00', { ...route, rate: ghs('12.00') }),
    trip(day(-1, 5), 'TRIP-0101', 'DEMO-001', '450.00', { description: 'Airport transfer' }),
    trip(day(-1, 12), 'KSI-0202', 'DEMO-002', '3000.00', { ...route, rate: ghs('12.00') }),
    trip(day(-1, 19), 'TRIP-0102', 'DEMO-001', '380.00'),
    trip(day(-1, 24), 'JOB-0301', null, '1800.00', {
      description: 'Charter; vehicle to be confirmed (shows an unassigned exception)',
      paymentStatus: 'unpaid',
    }),
    trip(day(0, 1), 'TRIP-0103', 'DEMO-001', '420.00', { paymentStatus: 'unpaid' }),
  ];
  const expenses: ExpenseInput[] = [
    expense(day(-2, 9), 'Licensing and permits', 'unassigned', '1200.00', {
      description: 'Road permits; vehicles to be confirmed',
    }),
    expense(day(-2, 15), 'Other', { asset: 'DEMO-003' }, '1500.00', {
      nature: 'capital',
      description: 'Generator installation (capital, not an operating expense)',
    }),
    expense(day(-1, 6), 'Fuel', { asset: 'DEMO-001' }, '620.00'),
    expense(day(-1, 14), 'Maintenance and repairs', { asset: 'DEMO-002' }, '1450.00', {
      paymentMethod: 'mobile-money',
    }),
    expense(day(-1, 28), 'Rent and utilities', 'shared', '2500.00', {
      description: 'Depot rent (shared fleet cost)',
      paymentMethod: 'bank-transfer',
    }),
    expense(day(0, 1), 'Fuel', { asset: 'DEMO-002' }, '980.00'),
  ];

  for (const input of revenue) await insertRevenue(repos, ctx, workspace, input);
  for (const input of expenses) await insertExpense(repos, ctx, workspace, input);
}

/** Fills the clearly labelled demo workspace with fictional assets and activity. */
export async function seedDemoWorkspace(
  repos: Repositories,
  ctx: RecordContext,
  workspace: Workspace,
  categories: readonly AssetCategory[],
  expenseCategories: readonly ExpenseCategory[],
): Promise<void> {
  const assets = await seedDemoAssets(repos, ctx, workspace, categories);
  await seedDemoActivity(repos, ctx, workspace, assets, expenseCategories);
}
