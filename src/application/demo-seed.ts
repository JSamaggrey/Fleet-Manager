import type { AssetCategory } from '@/domain/assets';
import { parseMoney } from '@/domain/money';
import { addMonths, calendarDateInTimeZone, yearMonthOfDate } from '@/domain/periods';
import type { Workspace } from '@/domain/workspace';
import type { Repositories } from '@/repositories';
import { insertAssetWithSchedule, type AssetInput, type RecordContext } from './asset-records';

/** Fictional sample assets for the clearly labelled demo workspace (no real records). */
export async function seedDemoAssets(
  repos: Repositories,
  ctx: RecordContext,
  workspace: Workspace,
  categories: readonly AssetCategory[],
): Promise<void> {
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

  for (const input of demo) {
    await insertAssetWithSchedule(repos, ctx, workspace, input);
  }
}
