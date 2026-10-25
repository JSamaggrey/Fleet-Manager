import {
  Car,
  DatabaseBackup,
  History,
  LayoutDashboard,
  Menu,
  Settings,
  TrendingDown,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import { backupStatus, type Workspace } from '@/domain/workspace';
import { Alert } from '../components/Alert';
import { Badge } from '../components/Card';
import { FOCUS_RING } from '../components/Button';
import { useServices } from '../services';
import { StatusIndicators } from './StatusIndicators';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', Icon: LayoutDashboard, end: true },
  { to: '/assets', label: 'Assets', Icon: Car, end: false },
  { to: '/depreciation', label: 'Depreciation', Icon: TrendingDown, end: false },
  { to: '/backup', label: 'Backup & Restore', Icon: DatabaseBackup, end: false },
  { to: '/settings', label: 'Settings', Icon: Settings, end: false },
  { to: '/audit', label: 'Audit log', Icon: History, end: false },
];

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Main">
      <ul className="space-y-1">
        {NAV_ITEMS.map(({ to, label, Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${FOCUS_RING} ${
                  isActive ? 'bg-blue-50 text-blue-900' : 'text-slate-700 hover:bg-slate-100'
                }`
              }
            >
              <Icon aria-hidden="true" className="size-4" />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function BackupReminder({ workspace }: { workspace: Workspace }) {
  const { now } = useServices();
  const status = backupStatus(workspace, now());
  if (status.state === 'current') return null;
  return (
    <div className="mb-6">
      <Alert
        tone="warning"
        title={status.state === 'never' ? 'No backup yet' : 'Backup overdue'}
        action={
          <Link
            to="/backup"
            className={`inline-flex min-h-10 items-center rounded-md bg-white px-3 text-sm font-medium text-amber-950 ring-1 ring-amber-400 hover:bg-amber-100 ${FOCUS_RING}`}
          >
            Back up now
          </Link>
        }
      >
        <p>
          {status.state === 'never'
            ? 'This workspace exists only in this browser on this device.'
            : `The last full backup was ${status.daysSince} days ago.`}{' '}
          Browser storage can be cleared, so download a full backup and keep it somewhere safe.
        </p>
      </Alert>
    </div>
  );
}

export function AppShell({ workspace }: { workspace: Workspace }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* A button, not an #anchor: hash routing would treat the anchor as a route change. */}
      <button
        type="button"
        onClick={() => document.getElementById('main')?.focus()}
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-slate-900"
      >
        Skip to content
      </button>
      <header className="bg-[#1e3a5f] text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <button
            type="button"
            className={`rounded-md p-2 hover:bg-white/10 lg:hidden ${FOCUS_RING}`}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? (
              <X aria-hidden="true" className="size-5" />
            ) : (
              <Menu aria-hidden="true" className="size-5" />
            )}
            <span className="sr-only">{menuOpen ? 'Close menu' : 'Open menu'}</span>
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-xs tracking-wide text-blue-100 uppercase">
              Local workspace on this device
            </p>
            <p className="flex items-center gap-2 truncate text-lg font-semibold">
              <span className="truncate" data-testid="workspace-name">
                {workspace.name}
              </span>
              {workspace.kind === 'demo' && <Badge tone="demo">DEMO</Badge>}
            </p>
          </div>
          <StatusIndicators workspace={workspace} />
        </div>
        {menuOpen && (
          <div id="mobile-nav" className="border-t border-white/10 bg-white p-3 lg:hidden">
            <Navigation onNavigate={() => setMenuOpen(false)} />
          </div>
        )}
      </header>

      <div className="mx-auto flex max-w-7xl gap-8 px-4 py-6">
        <aside className="hidden w-56 shrink-0 lg:block">
          <Navigation />
        </aside>
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">
          <BackupReminder workspace={workspace} />
          <Outlet />
        </main>
      </div>
    </div>
  );
}
