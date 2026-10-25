import { Link } from 'react-router';
import { backupStatus, type Workspace } from '@/domain/workspace';
import { Alert } from '../components/Alert';
import { FOCUS_RING } from '../components/Button';
import { Card, DescriptionList, PageHeader } from '../components/Card';
import { useStorageStatus } from '../device-status';
import { formatDateTime, formatDaysAgo } from '../format';
import { useServices } from '../services';

export function DashboardPage({ workspace }: { workspace: Workspace }) {
  const { now } = useServices();
  const storage = useStorageStatus();
  const backup = backupStatus(workspace, now());
  const tz = workspace.settings.timeZone;

  return (
    <>
      <PageHeader title="Dashboard" description="Overview of this device’s local workspace." />
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
        <Alert tone="info" title="What’s next">
          <p>
            Assets, depreciation schedules, trip revenue, expenses and management reports will
            appear here as they are built. Figures will always be for this device’s workspace only.
          </p>
        </Alert>
      </div>
    </>
  );
}
