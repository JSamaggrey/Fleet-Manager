import type { Asset } from '@/domain/assets';
import type { DepreciationLine, DepreciationSchedule } from '@/domain/depreciation';
import { REPORTING_CURRENCY, sum, type Money } from '@/domain/money';
import {
  compareYearMonth,
  currentYearMonth,
  formatYearMonth,
  yearMonthSchema,
  type YearMonth,
} from '@/domain/periods';
import {
  AssetValidationError,
  auditEvent,
  requireWorkspace,
  type RecordContext,
} from './asset-records';
import type { ServiceDependencies } from './dependencies';

export interface PeriodRow {
  asset: Asset;
  categoryName: string;
  line: DepreciationLine;
}

export interface PeriodReport {
  period: YearMonth;
  closed: boolean;
  closedThrough: YearMonth | null;
  currentPeriod: YearMonth;
  rows: PeriodRow[];
  totalCharge: Money;
}

/** The schedule version governing `period` for each asset: the latest with effectiveFrom ≤ period. */
function governingScheduleIds(
  schedules: readonly DepreciationSchedule[],
  period: YearMonth,
): Set<string> {
  const byAsset = new Map<string, DepreciationSchedule>();
  for (const schedule of schedules) {
    if (compareYearMonth(schedule.effectiveFrom, period) > 0) continue;
    const best = byAsset.get(schedule.assetId);
    if (!best || schedule.version > best.version) byAsset.set(schedule.assetId, schedule);
  }
  return new Set([...byAsset.values()].map((s) => s.id));
}

export function createDepreciationService(deps: ServiceDependencies) {
  const { store, newId, now, actor } = deps;

  return {
    /** Depreciation charged in one month across all assets (including archived assets). */
    async periodReport(period: YearMonth): Promise<PeriodReport> {
      const validPeriod = yearMonthSchema.parse(period);
      const at = now();
      return store.read(async (repos) => {
        const workspace = await requireWorkspace(repos);
        const governing = governingScheduleIds(
          await repos.depreciation.listAllSchedules(),
          validPeriod,
        );
        const lines = (await repos.depreciation.listLinesForPeriod(validPeriod)).filter((l) =>
          governing.has(l.scheduleId),
        );
        const assets = new Map((await repos.assets.list()).map((a) => [a.id, a]));
        const categories = new Map((await repos.categories.list()).map((c) => [c.id, c.name]));
        const rows: PeriodRow[] = [];
        for (const line of lines) {
          const asset = assets.get(line.assetId);
          if (!asset) continue;
          rows.push({
            asset,
            categoryName: categories.get(asset.categoryId) ?? 'Unknown category',
            line,
          });
        }
        rows.sort((a, b) => a.asset.code.localeCompare(b.asset.code));
        const closedThrough = workspace.depreciationClosedThrough;
        return {
          period: validPeriod,
          closed: closedThrough !== null && compareYearMonth(validPeriod, closedThrough) <= 0,
          closedThrough,
          currentPeriod: currentYearMonth(at, workspace.settings.timeZone),
          rows,
          totalCharge: sum(
            rows.map((r) => r.line.charge),
            REPORTING_CURRENCY,
          ),
        };
      });
    },

    /**
     * Closes depreciation months through `through` (inclusive). Closed lines are never rewritten;
     * later revisions apply from the first open month. Only ended months can be closed, and closing
     * cannot be undone.
     */
    async closePeriods(through: YearMonth): Promise<YearMonth> {
      const period = yearMonthSchema.parse(through);
      const ctx: RecordContext = { newId, actor, at: now() };
      return store.write(async (repos) => {
        const workspace = await requireWorkspace(repos);
        const current = currentYearMonth(ctx.at, workspace.settings.timeZone);
        if (compareYearMonth(period, current) >= 0) {
          throw new AssetValidationError(
            `Only months that have ended can be closed (before ${formatYearMonth(current)}).`,
          );
        }
        const previous = workspace.depreciationClosedThrough;
        if (previous !== null && compareYearMonth(period, previous) <= 0) {
          throw new AssetValidationError(
            `Months through ${formatYearMonth(previous)} are already closed.`,
          );
        }
        await repos.workspace.put({
          ...workspace,
          depreciationClosedThrough: period,
          updatedAt: ctx.at.toISOString(),
        });
        await repos.audit.append(
          auditEvent(
            ctx,
            workspace,
            { type: 'workspace', id: workspace.id },
            'depreciation.periods-closed',
            `Depreciation closed through ${formatYearMonth(period)}`,
            [{ field: 'depreciationClosedThrough', before: previous, after: period }],
          ),
        );
        return period;
      });
    },
  };
}

export type DepreciationService = ReturnType<typeof createDepreciationService>;
