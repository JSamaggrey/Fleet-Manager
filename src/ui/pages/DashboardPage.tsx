import { Link } from 'react-router';
import { formatMoney, sum } from '@/domain/money';
import { currentYearMonth, formatYearMonth } from '@/domain/periods';
import { isDateInRange, summarizeActivity } from '@/domain/transactions';
import { backupStatus, type Workspace } from '@/domain/workspace';
import { Alert } from '../components/Alert';
import { FOCUS_RING } from '../components/Button';
import { Card, DescriptionList, PageHeader } from '../components/Card';
import { useStorageStatus } from '../device-status';
import { formatDateTime, formatDaysAgo } from '../format';
import { useAssets, useExpenseList, usePeriodReport, useRevenueList } from '../queries';
import { useServices } from '../services';

export function DashboardPage({ workspace }: { workspace: Workspace }) {
  const { now } = useServices();
  const storage = useStorageStatus();
  const backup = backupStatus(workspace, now());
  const tz = workspace.settings.timeZone;

  return (
    <>
      <PageHeader title="Dashboard" description="Overview of this device’s local workspace." />
      <AssetsSummary workspace={workspace} />
      <ActivitySummary workspace={workspace} />
      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Workspace">
          <DescriptionList
            items={[
              ['Name', workspace.name],
              ['Type', workspace.kind === 'demo' ? 'Demo workspace' : 'Business workspace'],
              ['Reporting currency', workspace.settings.reportingCurrency],
              ['Created', formatDateTime(workspace.createdAt, tz)],
              [
                'Workspace ID',
                <code key="id" className="text-xs">
                  {workspace.id}
                </code>,
              ],
            ]}
          />
        </Card>

        <Card title="Backup and storage">
          <DescriptionList
            items={[
              [
                'Last full backup',
                backup.state === 'never'
                  ? 'Never'
                  : `${formatDateTime(workspace.lastBackupAt ?? '', tz)} (${formatDaysAgo(backup.daysSince)})`,
              ],
              ['Reminder', `Every ${workspace.settings.backupReminderDays} days`],
              [
                'Browser storage',
                storage.data?.persistence === 'persistent'
                  ? 'Persistent (browser agreed to keep data)'
                  : storage.data?.persistence === 'best-effort'
                    ? 'Best effort (may be cleared by the browser)'
                    : 'Status unavailable in this browser',
              ],
            ]}
          />
          <Link
            to="/backup"
            className={`inline-flex min-h-10 items-center rounded-md bg-blue-700 px-4 text-sm font-medium text-white hover:bg-blue-800 ${FOCUS_RING}`}
          >
            Go to Backup &amp; Restore
          </Link>
        </Card>
      </div>

      <div className="mt-6">
        <Alert tone="info" title="Reports">
          <p>
            Management profit and margin reports by asset and period are not built yet. Figures are
            always for this device’s workspace only.
          </p>
        </Alert>
      </div>
    </>
  );
}

function ActivitySummary({ workspace }: { workspace: Workspace }) {
  const { now } = useServices();
  const period = currentYearMonth(now(), workspace.settings.timeZone);
  const revenue = useRevenueList();
  const expenses = useExpenseList();
  if (!revenue.data || !expenses.data) return null;
  const inMonth = { from: `${period}-01`, to: `${period}-31` };
  const month = summarizeActivity(
    revenue.data.map((r) => r.entry).filter((e) => isDateInRange(e.serviceDate, inMonth)),
    expenses.data.map((r) => r.expense).filter((e) => isDateInRange(e.expenseDate, inMonth)),
    'GHS',
  );
  // Exceptions are not limited to this month.
  const all = summarizeActivity(
    revenue.data.map((r) => r.entry),
    expenses.data.map((r) => r.expense),
    'GHS',
  );
  const label = formatYearMonth(period);
  return (
    <section aria-label="Revenue and expenses this month" className="mb-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={`Revenue in ${label}`} value={formatMoney(month.revenue)} />
        <Stat label={`Direct expenses in ${label}`} value={formatMoney(month.directExpenses)} />
        <Stat label={`Shared expenses in ${label}`} value={formatMoney(month.sharedExpenses)} />
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-600">Needs attention (all dates)</p>
          <p className="mt-1 text-xl font-semibold text-slate-900 tabular-nums">
            {all.unassignedCount} unassigned
          </p>
          {all.unassignedCount > 0 && (
            <p className="mt-1 flex gap-3 text-sm">
              <Link to="/revenue?asset=unassigned" className={`underline ${FOCUS_RING}`}>
                Revenue
              </Link>
              <Link to="/expenses?asset=unassigned" className={`underline ${FOCUS_RING}`}>
                Expenses
              </Link>
            </p>
          )}
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-600">
        GHS, service-date / incurred basis; voided records excluded. Shared expenses are not
        allocated to assets. Capital items ({formatMoney(month.capitalItems)} this month) are not
        operating expenses.
      </p>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-600">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900 tabular-nums">{value}</p>
    </div>
  );
}

function AssetsSummary({ workspace }: { workspace: Workspace }) {
  const { now } = useServices();
  const period = currentYearMonth(now(), workspace.settings.timeZone);
  const assets = useAssets();
  const report = usePeriodReport(period);
  const active = assets.data?.items.filter((i) => i.asset.status === 'active') ?? [];
  const stat = (label: string, value: string) => (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-600">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900 tabular-nums">{value}</p>
    </div>
  );
  if (!assets.data || !report.data) return null;
  return (
    <section aria-label="Asset summary" className="mb-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stat('Active assets', String(active.length))}
        {stat(
          'Capitalised cost (active)',
          formatMoney(
            sum(
              active.map((i) => i.asset.depreciation.capitalizedCost),
              'GHS',
            ),
          ),
        )}
        {stat(
          `Book value, end of ${formatYearMonth(period)}`,
          formatMoney(
            sum(
              active.map((i) => i.position.bookValue),
              'GHS',
            ),
          ),
        )}
        {stat(`Depreciation in ${formatYearMonth(period)}`, formatMoney(report.data.totalCharge))}
      </div>
      <p className="mt-2 text-xs text-slate-600">
        GHS, management basis. Depreciation is a non-cash cost and includes archived assets.{' '}
        <Link to="/assets" className={`underline ${FOCUS_RING}`}>
          View assets
        </Link>
      </p>
    </section>
  );
}
