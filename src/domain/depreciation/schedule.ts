import { z } from 'zod';
import { idSchema, isoTimestampSchema } from '../common/schemas';
import { Decimal, money, moneySchema, type Money } from '../money';
import {
  addMonths,
  calendarDateSchema,
  compareYearMonth,
  monthsBetween,
  yearMonthOfDate,
  yearMonthSchema,
  type YearMonth,
} from '../periods';

/**
 * Straight-line depreciation (MVP).
 *
 * Conventions (docs/product-defaults.md; disclosed in the UI):
 * - The month containing the in-service date receives a full monthly charge.
 * - Base monthly charge = depreciable basis / months, rounded half-up to the minor unit.
 * - The final month absorbs rounding, so total depreciation equals the basis exactly and never
 *   exceeds it; book value ends at the residual value.
 */
export const DEPRECIATION_CONVENTION =
  'Straight-line. Full month from the in-service month. Monthly charge rounded half-up to the pesewa; the final month absorbs rounding so total depreciation equals cost minus residual value.';

export const MAX_USEFUL_LIFE_MONTHS = 600;

export const depreciationAssumptionsSchema = z
  .strictObject({
    method: z.literal('straight-line'),
    capitalizedCost: moneySchema,
    residualValue: moneySchema,
    usefulLifeMonths: z
      .number('Enter the useful life in months.')
      .int('Use whole months.')
      .min(1, 'Useful life must be at least 1 month.')
      .max(MAX_USEFUL_LIFE_MONTHS, `Useful life can be at most ${MAX_USEFUL_LIFE_MONTHS} months.`),
    inServiceDate: calendarDateSchema,
  })
  .superRefine((a, ctx) => {
    if (a.capitalizedCost.currency !== a.residualValue.currency) {
      ctx.addIssue({
        code: 'custom',
        path: ['residualValue'],
        message: 'Use the same currency as the cost.',
      });
    }
    if (a.capitalizedCost.amountMinor <= 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['capitalizedCost'],
        message: 'Cost must be greater than zero.',
      });
    }
    if (a.residualValue.amountMinor < 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['residualValue'],
        message: 'Residual value cannot be negative.',
      });
    } else if (a.residualValue.amountMinor > a.capitalizedCost.amountMinor) {
      ctx.addIssue({
        code: 'custom',
        path: ['residualValue'],
        message: 'Residual value cannot exceed cost.',
      });
    }
  });

export type DepreciationAssumptions = z.infer<typeof depreciationAssumptionsSchema>;

export const depreciationScheduleSchema = z.strictObject({
  id: idSchema,
  workspaceId: idSchema,
  assetId: idSchema,
  /** 1 for the first schedule; each revision adds a version. Older versions are kept. */
  version: z.number().int().positive(),
  /** First month this version governs. Earlier months keep the previous version's lines. */
  effectiveFrom: yearMonthSchema,
  assumptions: depreciationAssumptionsSchema,
  reason: z.string().max(500),
  createdAt: isoTimestampSchema,
});

export type DepreciationSchedule = z.infer<typeof depreciationScheduleSchema>;

export const depreciationLineSchema = z.strictObject({
  id: idSchema,
  workspaceId: idSchema,
  assetId: idSchema,
  scheduleId: idSchema,
  period: yearMonthSchema,
  /** 1 = in-service month. */
  periodNumber: z.number().int().positive(),
  openingBookValue: moneySchema,
  charge: moneySchema,
  accumulated: moneySchema,
  closingBookValue: moneySchema,
  remainingMonths: z.number().int().nonnegative(),
});

export type DepreciationLine = z.infer<typeof depreciationLineSchema>;

/** Line values before identifiers are assigned. */
export type PlannedLine = Omit<DepreciationLine, 'id' | 'workspaceId' | 'assetId' | 'scheduleId'>;

interface SegmentInput {
  startPeriod: YearMonth;
  startPeriodNumber: number;
  months: number;
  openingBookValue: Money;
  openingAccumulated: Money;
  residualValue: Money;
}

/** Generates `months` straight-line lines from an opening book value down to the residual. */
export function generateStraightLine(input: SegmentInput): PlannedLine[] {
  const { currency } = input.openingBookValue;
  const depreciable = input.openingBookValue.amountMinor - input.residualValue.amountMinor;
  if (depreciable < 0) throw new Error('Residual value exceeds opening book value.');
  if (!Number.isInteger(input.months) || input.months < 1)
    throw new Error('Months must be at least 1.');

  const base = Number(
    Decimal(String(depreciable))
      .div(Decimal(String(input.months)))
      .round(0, Decimal.roundHalfUp)
      .toFixed(0),
  );

  const lines: PlannedLine[] = [];
  let charged = 0;
  for (let i = 0; i < input.months; i++) {
    const isLast = i === input.months - 1;
    // Never charge beyond the basis; the last month takes whatever remains.
    const charge = isLast ? depreciable - charged : Math.min(base, depreciable - charged);
    const opening = input.openingBookValue.amountMinor - charged;
    charged += charge;
    lines.push({
      period: addMonths(input.startPeriod, i),
      periodNumber: input.startPeriodNumber + i,
      openingBookValue: money(opening, currency),
      charge: money(charge, currency),
      accumulated: money(input.openingAccumulated.amountMinor + charged, currency),
      closingBookValue: money(opening - charge, currency),
      remainingMonths: input.months - i - 1,
    });
  }
  return lines;
}

export function inServicePeriod(assumptions: DepreciationAssumptions): YearMonth {
  return yearMonthOfDate(assumptions.inServiceDate);
}

export function planInitialSchedule(assumptions: DepreciationAssumptions): PlannedLine[] {
  const valid = depreciationAssumptionsSchema.parse(assumptions);
  return generateStraightLine({
    startPeriod: inServicePeriod(valid),
    startPeriodNumber: 1,
    months: valid.usefulLifeMonths,
    openingBookValue: valid.capitalizedCost,
    openingAccumulated: money(0, valid.capitalizedCost.currency),
    residualValue: valid.residualValue,
  });
}

/**
 * The lines that apply to each month: each version governs from its `effectiveFrom` until the
 * next version takes over. Superseded projections stay stored for history but are not effective.
 */
export function effectiveLines<L extends PlannedLine & { scheduleId: string }>(
  schedules: readonly DepreciationSchedule[],
  lines: readonly L[],
): L[] {
  const ordered = [...schedules].sort((a, b) => a.version - b.version);
  const result: L[] = [];
  ordered.forEach((schedule, i) => {
    const next = ordered[i + 1];
    for (const line of lines) {
      if (line.scheduleId !== schedule.id) continue;
      if (compareYearMonth(line.period, schedule.effectiveFrom) < 0) continue;
      if (next && compareYearMonth(line.period, next.effectiveFrom) >= 0) continue;
      result.push(line);
    }
  });
  return result.sort((a, b) => compareYearMonth(a.period, b.period));
}

export interface BookPosition {
  accumulated: Money;
  bookValue: Money;
  state: 'not-started' | 'depreciating' | 'fully-depreciated';
}

/** Accumulated depreciation and book value at the end of `period`. */
export function positionAt(
  lines: readonly PlannedLine[],
  period: YearMonth,
  assumptions: DepreciationAssumptions,
): BookPosition {
  const { capitalizedCost } = assumptions;
  const upTo = lines.filter((l) => compareYearMonth(l.period, period) <= 0);
  const last = upTo.at(-1);
  if (!last) {
    return {
      accumulated: money(0, capitalizedCost.currency),
      bookValue: capitalizedCost,
      state: 'not-started',
    };
  }
  return {
    accumulated: last.accumulated,
    bookValue: last.closingBookValue,
    state: last === lines.at(-1) ? 'fully-depreciated' : 'depreciating',
  };
}

export type RevisionProblem =
  'no-change' | 'locked-fields' | 'life-too-short' | 'residual-above-book-value';

export type RevisionPlan =
  | {
      ok: true;
      effectiveFrom: YearMonth;
      /** Months kept unchanged because they are closed (or precede the new schedule). */
      preserved: PlannedLine[];
      lines: PlannedLine[];
      fullReplacement: boolean;
    }
  | { ok: false; problem: RevisionProblem; message: string };

/**
 * Plans a change of depreciation assumptions.
 *
 * - No closed months yet for this asset: the whole schedule is regenerated (setup correction).
 * - Some months closed: those lines are preserved exactly; only residual value and useful life may
 *   change, and the remaining book value is spread over the remaining life from the first open month
 *   (a prospective change in estimate). Cost and in-service date are locked.
 */
export function planRevision(input: {
  current: DepreciationAssumptions;
  currentLines: readonly PlannedLine[];
  next: DepreciationAssumptions;
  /** First month not closed, or null when nothing is closed. */
  firstOpenPeriod: YearMonth | null;
}): RevisionPlan {
  const next = depreciationAssumptionsSchema.parse(input.next);
  const { current, currentLines, firstOpenPeriod } = input;

  if (JSON.stringify(current) === JSON.stringify(next)) {
    return { ok: false, problem: 'no-change', message: 'The assumptions are unchanged.' };
  }

  const hasClosedLines =
    firstOpenPeriod !== null && compareYearMonth(inServicePeriod(current), firstOpenPeriod) < 0;

  if (!hasClosedLines) {
    return {
      ok: true,
      effectiveFrom: inServicePeriod(next),
      preserved: [],
      lines: planInitialSchedule(next),
      fullReplacement: true,
    };
  }

  if (
    current.capitalizedCost.amountMinor !== next.capitalizedCost.amountMinor ||
    current.inServiceDate !== next.inServiceDate
  ) {
    return {
      ok: false,
      problem: 'locked-fields',
      message:
        'Cost and in-service date cannot change after depreciation periods are closed. Only residual value and useful life can be revised.',
    };
  }

  const effectiveFrom = firstOpenPeriod;
  const preserved = currentLines.filter((l) => compareYearMonth(l.period, effectiveFrom) < 0);
  const lastPreserved = preserved.at(-1);
  const elapsed = monthsBetween(inServicePeriod(current), effectiveFrom);
  const remaining = next.usefulLifeMonths - elapsed;
  if (remaining < 1) {
    return {
      ok: false,
      problem: 'life-too-short',
      message: `${elapsed} months are already closed, so the useful life must be at least ${elapsed + 1} months.`,
    };
  }
  const openingBookValue = lastPreserved?.closingBookValue ?? current.capitalizedCost;
  if (next.residualValue.amountMinor > openingBookValue.amountMinor) {
    return {
      ok: false,
      problem: 'residual-above-book-value',
      message: 'Residual value cannot exceed the book value at the end of the last closed month.',
    };
  }
  return {
    ok: true,
    effectiveFrom,
    preserved,
    lines: generateStraightLine({
      startPeriod: effectiveFrom,
      startPeriodNumber: elapsed + 1,
      months: remaining,
      openingBookValue,
      openingAccumulated: lastPreserved?.accumulated ?? money(0, current.capitalizedCost.currency),
      residualValue: next.residualValue,
    }),
    fullReplacement: false,
  };
}
