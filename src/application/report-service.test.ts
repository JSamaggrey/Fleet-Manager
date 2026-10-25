import { describe, expect, it } from 'vitest';
import { createBackupService } from '@/backup/backup-service';
import { LOCAL_ACTOR } from '@/domain/audit';
import { parseMoney } from '@/domain/money';
import { MemoryWorkspaceStore } from '@/persistence/memory/memory-workspace-store';
import { sequentialIds, steppingClock } from '@/test/fixtures';
import { createAssetService } from './asset-service';
import { ValidationError } from './errors';
import { createExpenseService } from './expense-service';
import { createReportService } from './report-service';
import { createRevenueService } from './revenue-service';
import { createWorkspaceService } from './workspace-service';

const ghs = (v: string) => parseMoney(v, 'GHS');

/** Demo workspace "today" = 15 June 2026: activity in Apr, May and June. */
async function demo() {
  const deps = {
    store: new MemoryWorkspaceStore(),
    newId: sequentialIds(),
    now: steppingClock('2026-06-15T09:00:00.000Z'),
    actor: LOCAL_ACTOR,
  };
  await createWorkspaceService(deps).createDemoWorkspace();
  return {
    reports: createReportService(deps),
    revenue: createRevenueService(deps),
    expenses: createExpenseService(deps),
    assets: createAssetService(deps),
  };
}

const MAY = { from: '2026-05-01', to: '2026-05-31' };

describe('profit report', () => {
  it('reports every asset and the fleet for a month of demo data', async () => {
    const s = await demo();
    const report = await s.reports.profitReport(MAY);
    expect(report.workspaceName).toBe('Demo workspace');
    expect(report.rows.map((r) => r.asset.code)).toEqual(['DEMO-001', 'DEMO-002', 'DEMO-003']);
    // May demo revenue: 450 + 3000 + 380 + 1800 (unassigned).
    expect(report.fleet.revenue).toEqual(ghs('5630.00'));
    expect(report.fleet.unassignedRevenue).toEqual(ghs('1800.00'));
    expect(report.fleet.sharedExpenses).toEqual(ghs('2500.00'));
    const demo1 = report.rows.find((r) => r.asset.code === 'DEMO-001');
    // DEMO-001: (185,000 − 35,000) / 60 = 2,500 per month.
    expect(demo1).toMatchObject({
      revenue: ghs('830.00'),
      directExpenses: ghs('620.00'),
      depreciation: ghs('2500.00'),
      profit: ghs('-2290.00'),
    });
    const f = report.fleet;
    expect(
      f.sumOfAssetProfits.amountMinor +
        f.unassignedRevenue.amountMinor -
        f.sharedExpenses.amountMinor -
        f.unassignedExpenses.amountMinor,
    ).toBe(f.profit.amountMinor);
  });

  it('rejects an inverted range', async () => {
    const s = await demo();
    await expect(
      s.reports.profitReport({ from: '2026-05-31', to: '2026-05-01' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('exceptions', () => {
  it('lists unassigned records, incomplete assets and voids from real data only', async () => {
    const s = await demo();
    const before = await s.reports.exceptions();
    expect(before.unassignedRevenue.map((i) => i.label)).toEqual(['JOB-0301']);
    expect(before.unassignedExpenses).toHaveLength(1);
    expect(before.incompleteAssets).toEqual([]);
    expect(before.voided).toEqual([]);
    expect(before.unclosedMonths).toMatchObject({ to: '2026-05' });

    const [first] = await s.revenue.listRevenue();
    if (!first) throw new Error('demo revenue missing');
    await s.revenue.voidRevenue(first.entry.id, 'Duplicate entry');
    const after = await s.reports.exceptions();
    expect(after.voided).toHaveLength(1);
    expect(after.voided[0]?.detail).toBe('Voided: Duplicate entry');
  });
});

describe('CSV exports', () => {
  it('exports asset rows plus a fleet row with plain decimal amounts', async () => {
    const s = await demo();
    const file = await s.reports.profitCsv(MAY);
    expect(file.fileName).toBe('fms-demo-workspace-profit-2026-05-01_2026-05-31.csv');
    expect(file.mimeType).toBe('text/csv');
    const lines = file.contents.slice(1).trim().split('\r\n');
    expect(lines[0]).toMatch(/^row_type,period_from,period_to,asset_code/);
    expect(lines).toHaveLength(5); // header + 3 assets + fleet
    expect(lines[1]).toContain('asset,2026-05-01,2026-05-31,DEMO-001');
    expect(lines[1]).toContain(',830.00,620.00,,,2500.00,-2290.00,-275.9,');
    expect(lines.at(-1)).toMatch(/^fleet,.*,5630\.00,/);
  });

  it('produces files that restore refuses (CSV is never a backup)', async () => {
    const s = await demo();
    const csv = await s.reports.profitCsv(MAY);
    const backup = createBackupService({
      store: new MemoryWorkspaceStore(),
      app: { name: 'fms', version: 'test' },
      newId: sequentialIds(9),
      now: () => new Date('2026-06-15T09:00:00.000Z'),
    });
    const result = await backup.inspectText(csv.contents);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(['not-json', 'not-a-backup']).toContain(result.problem.code);
  });

  it('exports revenue and expense detail, flagging voided and unassigned rows', async () => {
    const s = await demo();
    const [first] = await s.revenue.listRevenue();
    if (!first) throw new Error('demo revenue missing');
    await s.revenue.voidRevenue(first.entry.id, 'Duplicate entry');
    const revenue = await s.reports.revenueCsv({ from: '2026-01-01', to: '2026-06-30' });
    expect(revenue.contents).toContain('UNASSIGNED');
    expect(revenue.contents).toContain('voided,Duplicate entry');
    const expenses = await s.reports.expenseCsv(MAY);
    expect(expenses.contents).toContain('shared');
    expect(expenses.contents).not.toContain('capital'); // the capital item is in April
  });
});
