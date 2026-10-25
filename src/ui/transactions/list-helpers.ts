import type { AssetSummary } from '@/application/asset-service';
import { calendarDateInTimeZone } from '@/domain/periods';
import type { Workspace } from '@/domain/workspace';
import { useServices } from '../services';

/** Today's calendar date in the workspace's business time zone. */
export function useToday(workspace: Workspace): string {
  const { now } = useServices();
  return calendarDateInTimeZone(now(), workspace.settings.timeZone);
}

/** Options for an asset picker: active assets first, archived ones labelled. */
export function assetOptions(items: readonly AssetSummary[]) {
  return [...items]
    .sort(
      (a, b) =>
        Number(a.asset.status === 'archived') - Number(b.asset.status === 'archived') ||
        a.asset.code.localeCompare(b.asset.code),
    )
    .map(({ asset }) => ({
      value: asset.id,
      label: `${asset.code} — ${asset.name}${asset.status === 'archived' ? ' (archived)' : ''}`,
    }));
}
