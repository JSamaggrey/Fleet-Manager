import { describe, expect, it } from 'vitest';
import { parseMoney } from '@/domain/money';
import type { ExceptionsView } from './report-service';
import { deriveTasks } from './tasks';

const empty: ExceptionsView = {
  unassignedRevenue: [],
  unassignedExpenses: [],
  incompleteAssets: [],
  scheduleReview: [],
  voided: [],
  unclosedMonths: null,
  total: 0,
};
const item = (kind: 'revenue' | 'expense' | 'asset', id: string, date: string | null) => ({
  kind,
  id,
  date,
  label: `L-${id}`,
  amount: kind === 'asset' ? null : parseMoney('10.00', 'GHS'),
  detail: `detail ${id}`,
});

describe('deriveTasks', () => {
  it('returns nothing when there is nothing to fix', () => {
    expect(deriveTasks(empty)).toEqual([]);
  });

  it('orders by priority, then oldest first, and links to the fix', () => {
    const tasks = deriveTasks({
      ...empty,
      unassignedRevenue: [item('revenue', 'r2', '2026-05-10'), item('revenue', 'r1', '2026-04-01')],
      unassignedExpenses: [item('expense', 'e1', '2026-04-20')],
      incompleteAssets: [item('asset', 'a1', null)],
      scheduleReview: [item('asset', 'a2', null)],
      unclosedMonths: { from: '2026-01', to: '2026-05', count: 5 },
    });
    expect(tasks.map((t) => [t.priority, t.category, t.link])).toEqual([
      ['high', 'assignment', '/revenue/r1/edit'],
      ['high', 'assignment', '/expenses/e1/edit'],
      ['high', 'assignment', '/revenue/r2/edit'],
      ['normal', 'asset-setup', '/assets/a1'],
      ['normal', 'period-close', '/depreciation'],
      ['low', 'schedule-review', '/assets/a2'],
    ]);
    expect(tasks.find((t) => t.category === 'period-close')?.title).toBe(
      'Close depreciation through May 2026',
    );
  });

  it('does not turn voided records into tasks', () => {
    expect(deriveTasks({ ...empty, voided: [item('revenue', 'v1', '2026-05-01')] })).toEqual([]);
  });

  it('gives stable ids so the same cause keeps the same task', () => {
    const view = { ...empty, unassignedRevenue: [item('revenue', 'r1', '2026-04-01')] };
    expect(deriveTasks(view)[0]?.id).toBe(deriveTasks(view)[0]?.id);
  });
});
