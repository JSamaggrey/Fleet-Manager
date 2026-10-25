import { formatYearMonth } from '@/domain/periods';
import type { ExceptionItem, ExceptionsView } from './report-service';

/**
 * Tasks are derived from captured data each time they are shown; nothing is stored. A task
 * disappears when its source record is fixed. Categories, priorities and due dates are the
 * defaults in docs/product-defaults.md (row 5) until the product owner decides otherwise.
 */
export type TaskCategory = 'assignment' | 'asset-setup' | 'schedule-review' | 'period-close';
export type TaskPriority = 'high' | 'normal' | 'low';

export interface Task {
  /** Stable while the cause exists, e.g. "assignment:revenue:<id>". */
  id: string;
  category: TaskCategory;
  priority: TaskPriority;
  title: string;
  detail: string;
  /** Where to fix it. */
  link: string;
  /** The source record's own date, when it has one. */
  since: string | null;
}

export const TASK_CATEGORY_LABEL: Record<TaskCategory, string> = {
  assignment: 'Needs assignment',
  'asset-setup': 'Incomplete asset setup',
  'schedule-review': 'Depreciation review',
  'period-close': 'Period close',
};

export const TASK_RULES = [
  'High: revenue or expenses without an asset or classification. Asset results are incomplete until they are fixed.',
  'Normal: incomplete asset records, and ended depreciation months not yet closed.',
  'Low: fully depreciated assets that are still active.',
  'No due dates are set: the app does not collect them. Registration, insurance, inspection and maintenance reminders need those dates on assets first.',
] as const;

const PRIORITY_ORDER: Record<TaskPriority, number> = { high: 0, normal: 1, low: 2 };

const PATH: Record<ExceptionItem['kind'], string> = {
  revenue: '/revenue',
  expense: '/expenses',
  asset: '/assets',
};

function fromItem(
  item: ExceptionItem,
  category: TaskCategory,
  priority: TaskPriority,
  title: string,
): Task {
  return {
    id: `${category}:${item.kind}:${item.id}:${item.detail}`,
    category,
    priority,
    title,
    detail: item.detail,
    link: item.kind === 'asset' ? `${PATH.asset}/${item.id}` : `${PATH[item.kind]}/${item.id}/edit`,
    since: item.date,
  };
}

export function deriveTasks(exceptions: ExceptionsView): Task[] {
  const tasks: Task[] = [
    ...exceptions.unassignedRevenue.map((i) =>
      fromItem(i, 'assignment', 'high', `Assign an asset to revenue ${i.label}`),
    ),
    ...exceptions.unassignedExpenses.map((i) =>
      fromItem(i, 'assignment', 'high', `Classify the ${i.label} expense`),
    ),
    ...exceptions.incompleteAssets.map((i) =>
      fromItem(i, 'asset-setup', 'normal', `Complete the record for ${i.label}`),
    ),
    ...exceptions.scheduleReview.map((i) =>
      fromItem(i, 'schedule-review', 'low', `Review ${i.label}`),
    ),
  ];
  const months = exceptions.unclosedMonths;
  if (months) {
    tasks.push({
      id: `period-close:${months.from}:${months.to}`,
      category: 'period-close',
      priority: 'normal',
      title: `Close depreciation through ${formatYearMonth(months.to)}`,
      detail: `${months.count} ended month${months.count === 1 ? '' : 's'} (from ${formatYearMonth(months.from)}) can still be revised. Close them once figures are final.`,
      link: '/depreciation',
      since: null,
    });
  }
  return tasks.sort(
    (a, b) =>
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
      (a.since ?? '9999').localeCompare(b.since ?? '9999'),
  );
}
