import { describe, expect, it } from 'vitest';
import { money, parseMoney } from '../money';
import {
  depreciationAssumptionsSchema,
  effectiveLines,
  generateStraightLine,
  planInitialSchedule,
  planRevision,
  positionAt,
  type DepreciationAssumptions,
  type DepreciationSchedule,
} from './schedule';

const ghs = (amount: string) => parseMoney(amount, 'GHS');

function assumptions(overrides: Partial<DepreciationAssumptions> = {}): DepreciationAssumptions {
  return {
    method: 'straight-line',
    capitalizedCost: ghs('120000.00'),
    residualValue: ghs('20000.00'),
    usefulLifeMonths: 60,
    inServiceDate: '2026-01-20',
    ...overrides,
  };
}

const sumCharges = (lines: { charge: { amountMinor: number } }[]) =>
  lines.reduce((total, l) => total + l.charge.amountMinor, 0);

describe('straight-line schedule', () => {
  it('spreads the depreciable basis evenly from the in-service month (full first month)', () => {
    const lines = planInitialSchedule(assumptions());
    expect(lines).toHaveLength(60);
    expect(lines[0]).toMatchObject({
      period: '2026-01',
      periodNumber: 1,
      openingBookValue: ghs('120000.00'),
      charge: ghs('1666.67'),
      accumulated: ghs('1666.67'),
      closingBookValue: ghs('118333.33'),
      remainingMonths: 59,
    });
    expect(lines.at(-1)?.period).toBe('2030-12');
  });

  it('puts the rounding difference in the final month so totals equal cost − residual exactly', () => {
    const lines = planInitialSchedule(assumptions());
    // 100,000.00 / 60 = 1,666.666… → 59 × 1,666.67 = 98,333.53; final = 1,666.47
    expect(lines.at(-1)?.charge).toEqual(ghs('1666.47'));
    expect(sumCharges(lines)).toBe(ghs('100000.00').amountMinor);
    expect(lines.at(-1)?.closingBookValue).toEqual(ghs('20000.00'));
    expect(lines.at(-1)?.accumulated).toEqual(ghs('100000.00'));
    expect(lines.at(-1)?.remainingMonths).toBe(0);
  });

  it('keeps every line internally consistent', () => {
    const lines = planInitialSchedule(assumptions({ usefulLifeMonths: 37 }));
    lines.forEach((line, i) => {
      expect(line.closingBookValue.amountMinor).toBe(
        line.openingBookValue.amountMinor - line.charge.amountMinor,
      );
      if (i > 0) expect(line.openingBookValue).toEqual(lines[i - 1]?.closingBookValue);
      expect(line.charge.amountMinor).toBeGreaterThanOrEqual(0);
    });
  });

  it.each([
    // [cost, residual, months]: awkward divisions and tiny amounts
    ['0.01', '0.00', 3],
    ['0.02', '0.00', 3],
    ['0.03', '0.00', 2],
    ['0.05', '0.00', 4],
    ['100.00', '33.33', 7],
    ['999999.99', '0.01', 600],
    ['1.00', '1.00', 12],
  ])('never over-depreciates (cost %s, residual %s, %i months)', (cost, residual, months) => {
    const lines = planInitialSchedule(
      assumptions({
        capitalizedCost: ghs(cost),
        residualValue: ghs(residual),
        usefulLifeMonths: months,
      }),
    );
    expect(lines).toHaveLength(months);
    expect(sumCharges(lines)).toBe(ghs(cost).amountMinor - ghs(residual).amountMinor);
    expect(lines.every((l) => l.charge.amountMinor >= 0)).toBe(true);
    expect(lines.every((l) => l.closingBookValue.amountMinor >= ghs(residual).amountMinor)).toBe(
      true,
    );
  });

  it('charges nothing when residual equals cost', () => {
    const lines = planInitialSchedule(
      assumptions({ residualValue: ghs('120000.00'), usefulLifeMonths: 12 }),
    );
    expect(sumCharges(lines)).toBe(0);
  });

  it('handles a one-month life', () => {
    const lines = planInitialSchedule(assumptions({ usefulLifeMonths: 1 }));
    expect(lines).toHaveLength(1);
    expect(lines[0]?.charge).toEqual(ghs('100000.00'));
  });

  it('crosses year boundaries correctly', () => {
    const lines = planInitialSchedule(
      assumptions({ inServiceDate: '2025-11-30', usefulLifeMonths: 3 }),
    );
    expect(lines.map((l) => l.period)).toEqual(['2025-11', '2025-12', '2026-01']);
  });
});

describe('assumption validation', () => {
  it.each([
    ['zero useful life', { usefulLifeMonths: 0 }, 'at least 1 month'],
    ['negative useful life', { usefulLifeMonths: -12 }, 'at least 1 month'],
    ['fractional useful life', { usefulLifeMonths: 12.5 }, 'whole months'],
    ['excessive useful life', { usefulLifeMonths: 601 }, 'at most 600'],
    ['residual above cost', { residualValue: ghs('120000.01') }, 'cannot exceed cost'],
    ['negative residual', { residualValue: ghs('-1.00') }, 'cannot be negative'],
    [
      'zero cost',
      { capitalizedCost: ghs('0.00'), residualValue: ghs('0.00') },
      'greater than zero',
    ],
    ['invalid date', { inServiceDate: '2026-02-30' }, 'YYYY-MM-DD'],
  ])('rejects %s', (_label, override, message) => {
    const result = depreciationAssumptionsSchema.safeParse(assumptions(override));
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message).join(' ')).toContain(message);
  });

  it('refuses to generate a schedule from invalid assumptions', () => {
    expect(() => planInitialSchedule(assumptions({ usefulLifeMonths: 0 }))).toThrow();
  });

  it('rejects a segment whose residual exceeds its opening value', () => {
    expect(() =>
      generateStraightLine({
        startPeriod: '2026-01',
        startPeriodNumber: 1,
        months: 2,
        openingBookValue: money(100, 'GHS'),
        openingAccumulated: money(0, 'GHS'),
        residualValue: money(101, 'GHS'),
      }),
    ).toThrow();
  });
});

describe('positionAt', () => {
  const a = assumptions({ usefulLifeMonths: 12 });
  const lines = planInitialSchedule(a);

  it('is cost before the schedule starts', () => {
    expect(positionAt(lines, '2025-12', a)).toEqual({
      accumulated: ghs('0.00'),
      bookValue: ghs('120000.00'),
      state: 'not-started',
    });
  });

  it('reflects closing values within and after the schedule', () => {
    expect(positionAt(lines, '2026-03', a).accumulated.amountMinor).toBe(3 * 833333);
    expect(positionAt(lines, '2026-03', a).state).toBe('depreciating');
    expect(positionAt(lines, '2030-01', a)).toMatchObject({
      bookValue: ghs('20000.00'),
      state: 'fully-depreciated',
    });
  });
});

describe('planRevision', () => {
  const current = assumptions({
    usefulLifeMonths: 12,
    residualValue: ghs('0.00'),
    capitalizedCost: ghs('12000.00'),
  });
  const currentLines = planInitialSchedule(current);

  it('regenerates the whole schedule when no months are closed (setup correction)', () => {
    const plan = planRevision({
      current,
      currentLines,
      next: { ...current, capitalizedCost: ghs('24000.00'), inServiceDate: '2026-03-01' },
      firstOpenPeriod: null,
    });
    expect(plan.ok && plan.fullReplacement).toBe(true);
    if (!plan.ok) return;
    expect(plan.effectiveFrom).toBe('2026-03');
    expect(plan.preserved).toEqual([]);
    expect(plan.lines[0]?.charge).toEqual(ghs('2000.00'));
  });

  it('treats closed months before the asset started as no closed lines', () => {
    const plan = planRevision({
      current,
      currentLines,
      next: { ...current, capitalizedCost: ghs('6000.00') },
      firstOpenPeriod: '2026-01', // closed through 2025-12
    });
    expect(plan.ok && plan.fullReplacement).toBe(true);
  });

  it('preserves closed months and spreads remaining book value over the remaining life', () => {
    // Closed through 2026-03: 3 months × 1,000 charged, book value 9,000.
    const plan = planRevision({
      current,
      currentLines,
      next: { ...current, usefulLifeMonths: 6, residualValue: ghs('3000.00') },
      firstOpenPeriod: '2026-04',
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.fullReplacement).toBe(false);
    expect(plan.preserved).toEqual(currentLines.slice(0, 3));
    expect(plan.effectiveFrom).toBe('2026-04');
    expect(plan.lines).toHaveLength(3);
    expect(plan.lines[0]).toMatchObject({
      period: '2026-04',
      periodNumber: 4,
      openingBookValue: ghs('9000.00'),
      charge: ghs('2000.00'),
      accumulated: ghs('5000.00'),
    });
    expect(plan.lines.at(-1)?.closingBookValue).toEqual(ghs('3000.00'));
    // Closed history + revised future still never exceeds the basis.
    expect(sumCharges([...plan.preserved, ...plan.lines])).toBe(ghs('9000.00').amountMinor);
  });

  it('locks cost and in-service date once months are closed', () => {
    const plan = planRevision({
      current,
      currentLines,
      next: { ...current, capitalizedCost: ghs('15000.00') },
      firstOpenPeriod: '2026-04',
    });
    expect(plan).toMatchObject({ ok: false, problem: 'locked-fields' });
  });

  it('requires the new life to extend past the closed months', () => {
    const plan = planRevision({
      current,
      currentLines,
      next: { ...current, usefulLifeMonths: 3 },
      firstOpenPeriod: '2026-04',
    });
    expect(plan).toMatchObject({ ok: false, problem: 'life-too-short' });
  });

  it('rejects a residual above the closed book value', () => {
    const plan = planRevision({
      current,
      currentLines,
      next: { ...current, residualValue: ghs('9500.00') },
      firstOpenPeriod: '2026-04',
    });
    expect(plan).toMatchObject({ ok: false, problem: 'residual-above-book-value' });
  });

  it('reports no change', () => {
    expect(
      planRevision({ current, currentLines, next: current, firstOpenPeriod: null }),
    ).toMatchObject({
      ok: false,
      problem: 'no-change',
    });
  });
});

describe('effectiveLines', () => {
  it('uses each version only from its effective month until the next version', () => {
    const v1 = planInitialSchedule(assumptions({ usefulLifeMonths: 4 })).map((l) => ({
      ...l,
      scheduleId: 'v1',
    }));
    const v2 = v1.slice(2).map((l) => ({ ...l, scheduleId: 'v2', charge: ghs('1.00') }));
    const schedule = (id: string, version: number, effectiveFrom: string) =>
      ({ id, version, effectiveFrom }) as DepreciationSchedule;

    const result = effectiveLines(
      [schedule('v2', 2, '2026-03'), schedule('v1', 1, '2026-01')],
      [...v1, ...v2],
    );
    expect(result.map((l) => `${l.period}:${l.scheduleId}`)).toEqual([
      '2026-01:v1',
      '2026-02:v1',
      '2026-03:v2',
      '2026-04:v2',
    ]);
  });
});
