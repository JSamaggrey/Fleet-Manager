import { useSearchParams } from 'react-router';
import {
  isValidRange,
  periodContaining,
  shiftPeriod,
  type CalendarRange,
  type PeriodKind,
} from '@/domain/periods';
import type { Workspace } from '@/domain/workspace';
import { useToday } from '../transactions/list-helpers';

const KINDS: readonly PeriodKind[] = ['week', 'month', 'quarter', 'year', 'custom'];

export interface ReportPeriod {
  kind: PeriodKind;
  range: CalendarRange;
  setKind: (kind: PeriodKind) => void;
  setCustom: (range: CalendarRange) => void;
  shift: (direction: -1 | 1) => void;
}

/** Period held in the URL (?kind=&from=&to=) so drill-through and Back keep it. */
export function useReportPeriod(workspace: Workspace): ReportPeriod {
  const [params, setParams] = useSearchParams();
  const today = useToday(workspace);
  const weekStartsOn = workspace.settings.weekStartsOn;
  const rawKind = params.get('kind') as PeriodKind | null;
  const kind: PeriodKind = rawKind && KINDS.includes(rawKind) ? rawKind : 'month';
  const fromParam = { from: params.get('from') ?? '', to: params.get('to') ?? '' };
  const range =
    kind === 'custom'
      ? isValidRange(fromParam)
        ? fromParam
        : periodContaining('month', today, weekStartsOn)
      : periodContaining(kind, isValidRange(fromParam) ? fromParam.from : today, weekStartsOn);

  const write = (next: PeriodKind, r: CalendarRange) =>
    setParams({ kind: next, from: r.from, to: r.to }, { replace: true });

  return {
    kind,
    range,
    setKind: (next) =>
      write(next, next === 'custom' ? range : periodContaining(next, range.from, weekStartsOn)),
    setCustom: (r) => write('custom', r),
    shift: (direction) => {
      if (kind !== 'custom') write(kind, shiftPeriod(kind, range, direction, weekStartsOn));
    },
  };
}
