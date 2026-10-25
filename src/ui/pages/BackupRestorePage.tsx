import { Download } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { Workspace } from '@/domain/workspace';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { Card, DescriptionList, PageHeader } from '../components/Card';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Field, INPUT_CLASS } from '../components/Field';
import { useRequestPersistentStorage, useStorageStatus } from '../device-status';
import { formatBytes, formatDateTime } from '../format';
import { useEraseWorkspace, useExportBackup } from '../queries';

export function BackupRestorePage({ workspace }: { workspace: Workspace }) {
  const exportBackup = useExportBackup();
  const tz = workspace.settings.timeZone;

  return (
    <>
      <PageHeader
        title="Backup & Restore"
        description="Full backups protect this device’s workspace and let you move it to another device."
      />
      <div className="space-y-6">
        <Card
          title="Download a full backup"
          description={
            <>
              <p>
                The backup file contains <strong>every record</strong> in this workspace, including
                the audit history. Use it to recover from data loss or to move the workspace to a
                new device.
              </p>
              <p className="mt-2">
                It is not a report: CSV/spreadsheet exports are separate and cannot be restored.
              </p>
            </>
          }
        >
          <Alert tone="warning" title="Treat backup files as confidential">
            <p>
              They contain your business records unencrypted. Store them somewhere secure (for
              example an encrypted drive or a protected company folder) and do not email them
              casually.
            </p>
          </Alert>
          <p className="text-sm text-slate-700">
            Last backup on this device:{' '}
            <strong>
              {workspace.lastBackupAt ? formatDateTime(workspace.lastBackupAt, tz) : 'never'}
            </strong>
          </p>
          <Button onClick={() => exportBackup.mutate()} disabled={exportBackup.isPending}>
            <Download aria-hidden="true" className="size-4" />
            {exportBackup.isPending ? 'Preparing backup…' : 'Download full backup'}
          </Button>
          {exportBackup.isSuccess && (
            <Alert tone="success" title="Backup file created">
              <p>
                Saved as <code className="text-xs">{exportBackup.data.fileName}</code>. Check your
                downloads, then move the file somewhere safe.
              </p>
            </Alert>
          )}
          {exportBackup.isError && (
            <Alert tone="danger" title="The backup could not be created">
              <p>{exportBackup.error.message}</p>
            </Alert>
          )}
        </Card>

        <Card
          title="Restore from a backup"
          description="Restoring never merges with or overwrites an existing workspace."
        >
          <p className="text-sm text-slate-700">
            This device already has a workspace. To restore a different one here, first download a
            backup of the current workspace, then erase it below. You can then restore from the
            setup screen.
          </p>
        </Card>

        <StorageCard />
        <EraseCard workspace={workspace} onBackup={() => exportBackup.mutate()} />
      </div>
    </>
  );
}

function StorageCard() {
  const storage = useStorageStatus();
  const request = useRequestPersistentStorage();
  const data = storage.data;

  return (
    <Card
      title="Storage on this device"
      description="Data is kept in this browser’s storage for this site. Clearing browsing data, uninstalling the app, or using private browsing removes it."
    >
      {data && (
        <DescriptionList
          items={[
            [
              'Persistence',
              data.persistence === 'persistent'
                ? 'Persistent: the browser agreed not to clear it automatically'
                : data.persistence === 'best-effort'
                  ? 'Best effort: the browser may clear it if the device runs low on space'
                  : 'Not reported by this browser',
            ],
            [
              'Space used',
              data.usageBytes !== null && data.quotaBytes !== null
                ? `${formatBytes(data.usageBytes)} of about ${formatBytes(data.quotaBytes)} available`
                : 'Not reported by this browser',
            ],
          ]}
        />
      )}
      {data?.persistence === 'best-effort' && (
        <div className="space-y-2">
          <Button variant="secondary" onClick={() => request.mutate()} disabled={request.isPending}>
            Ask the browser to keep data
          </Button>
          {request.isSuccess && !request.data && (
            <p className="text-sm text-slate-700" role="status">
              The browser did not grant persistent storage. Installing the app (or adding it to the
              Home Screen on iPad) often helps. Keep making regular backups either way.
            </p>
          )}
        </div>
      )}
      <p className="text-sm text-slate-700">
        On iPad, add the app to the Home Screen and open it from there; Safari may remove data for
        websites that are not used for a while.
      </p>
    </Card>
  );
}

function EraseCard({ workspace, onBackup }: { workspace: Workspace; onBackup: () => void }) {
  const navigate = useNavigate();
  const erase = useEraseWorkspace();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const matches = confirmation.trim() === workspace.name;

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setConfirmation('');
  }

  async function confirmErase() {
    await erase.mutateAsync(confirmation);
    navigate('/');
  }

  return (
    <Card
      tone="danger"
      title="Erase this device’s workspace"
      description="Permanently deletes all workspace data stored on this device. Other devices and backup files are not affected."
    >
      <Button variant="danger" onClick={() => setOpen(true)}>
        Erase workspace…
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Erase this workspace permanently?"
        description={
          <>
            <p>
              All data for <strong>{workspace.name}</strong> on this device will be deleted. This
              cannot be undone without a backup file.
            </p>
            <p>
              <button
                type="button"
                className="font-medium text-blue-800 underline"
                onClick={onBackup}
              >
                Download a backup first
              </button>
            </p>
          </>
        }
        confirmLabel="Erase workspace"
        confirmVariant="danger"
        confirmDisabled={!matches}
        pending={erase.isPending}
        onConfirm={() => void confirmErase()}
      >
        <Field label={`Type the workspace name (${workspace.name}) to confirm`}>
          {(control) => (
            <input
              {...control}
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="off"
              className={INPUT_CLASS}
            />
          )}
        </Field>
        {erase.isError && (
          <div className="mt-3">
            <Alert tone="danger" title="Not erased">
              <p>{erase.error.message}</p>
            </Alert>
          </div>
        )}
      </ConfirmDialog>
    </Card>
  );
}
