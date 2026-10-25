import { CloudOff, HardDrive, RefreshCw, ShieldCheck, Wifi } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { backupStatus, type Workspace } from '@/domain/workspace';
import { FOCUS_RING } from '../components/Button';
import { useOnlineStatus, usePwaStatus, useStorageStatus } from '../device-status';
import { formatDaysAgo } from '../format';
import { useServices } from '../services';

function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'warn' }) {
  const colors =
    tone === 'warn' ? 'bg-amber-100 text-amber-950' : 'bg-white/10 text-white ring-1 ring-white/20';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${colors}`}>
      {children}
    </span>
  );
}

export function StatusIndicators({ workspace }: { workspace: Workspace }) {
  const online = useOnlineStatus();
  const pwa = usePwaStatus();
  const storage = useStorageStatus();
  const { now } = useServices();
  const backup = backupStatus(workspace, now());

  return (
    <ul aria-label="Device status" className="flex flex-wrap items-center gap-2">
      <li>
        <Pill>
          {online ? (
            <Wifi aria-hidden="true" className="size-3.5" />
          ) : (
            <CloudOff aria-hidden="true" className="size-3.5" />
          )}
          {online ? 'Online' : 'Offline — working locally'}
        </Pill>
      </li>
      <li>
        {pwa.updateAvailable && pwa.applyUpdate ? (
          <button
            type="button"
            onClick={pwa.applyUpdate}
            className={`inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-950 ${FOCUS_RING}`}
          >
            <RefreshCw aria-hidden="true" className="size-3.5" />
            Update ready — reload
          </button>
        ) : (
          <Pill tone={pwa.mode === 'installing' ? 'warn' : 'neutral'}>
            <ShieldCheck aria-hidden="true" className="size-3.5" />
            {
              {
                ready: 'Available offline',
                installing: 'Preparing offline use…',
                development: 'Dev mode (no offline cache)',
                unsupported: 'Offline install unsupported',
              }[pwa.mode]
            }
          </Pill>
        )}
      </li>
      <li>
        <Link to="/backup" className={`rounded-full ${FOCUS_RING}`}>
          <Pill tone={storage.data?.persistence === 'persistent' ? 'neutral' : 'warn'}>
            <HardDrive aria-hidden="true" className="size-3.5" />
            {storage.data?.persistence === 'persistent'
              ? 'Storage: persistent'
              : storage.data?.persistence === 'best-effort'
                ? 'Storage: may be cleared'
                : 'Storage: unknown'}
          </Pill>
        </Link>
      </li>
      <li>
        <Link to="/backup" className={`rounded-full ${FOCUS_RING}`}>
          <Pill tone={backup.state === 'current' ? 'neutral' : 'warn'}>
            {backup.state === 'never'
              ? 'No backup yet'
              : `Last backup: ${formatDaysAgo(backup.daysSince)}`}
          </Pill>
        </Link>
      </li>
    </ul>
  );
}
