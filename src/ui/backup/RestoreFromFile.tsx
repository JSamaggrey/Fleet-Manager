import { useState, type ChangeEvent } from 'react';
import type { BackupProblem, ValidatedBackup } from '@/backup/backup-service';
import { BACKUP_FILE_EXTENSION } from '@/backup/format';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { DescriptionList } from '../components/Card';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Field, INPUT_CLASS } from '../components/Field';
import { formatBytes, formatDateTime } from '../format';
import { useInspectBackup, useRestoreBackup } from '../queries';

/** Validate → preview → explicit confirmation → atomic restore into an empty workspace. */
export function RestoreFromFile({ onRestored }: { onRestored: () => void }) {
  const inspect = useInspectBackup();
  const restore = useRestoreBackup();
  const [backup, setBackup] = useState<ValidatedBackup | null>(null);
  const [problem, setProblem] = useState<BackupProblem | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [inputKey, setInputKey] = useState(0);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setBackup(null);
    setProblem(null);
    restore.reset();
    if (!file) return;
    const result = await inspect.mutateAsync(file);
    if (result.ok) setBackup(result.backup);
    else setProblem(result.problem);
  }

  function chooseAnother() {
    setBackup(null);
    setProblem(null);
    setInputKey((k) => k + 1);
  }

  async function confirmRestore() {
    if (!backup) return;
    try {
      await restore.mutateAsync(backup);
      setConfirming(false);
      onRestored();
    } catch {
      setConfirming(false);
    }
  }

  const preview = backup?.preview;
  const backupTimeZone = backup?.snapshot.tables.workspace[0]?.settings.timeZone ?? 'UTC';

  return (
    <div className="space-y-4">
      <Field
        label="Backup file"
        hint={`Choose a full workspace backup (${BACKUP_FILE_EXTENSION}). It is checked before anything is restored.`}
      >
        {(control) => (
          <input
            key={inputKey}
            {...control}
            type="file"
            accept=".json,application/json"
            onChange={(e) => void handleFile(e)}
            className={`${INPUT_CLASS} file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-sm`}
          />
        )}
      </Field>

      {inspect.isPending && <p role="status">Checking backup file…</p>}

      {inspect.isError && (
        <Alert tone="danger" title="The file could not be read">
          <p>{inspect.error.message}</p>
        </Alert>
      )}

      {problem && (
        <Alert tone="danger" title="This file cannot be restored">
          <p>{problem.message}</p>
          {problem.details.length > 0 && (
            <ul className="list-disc pl-5 text-xs">
              {problem.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          )}
          <p>Nothing on this device was changed.</p>
        </Alert>
      )}

      {preview && (
        <div className="space-y-4 rounded-md border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">Backup checked: ready to restore</p>
          <DescriptionList
            items={[
              ['Workspace', preview.workspaceName],
              ['Type', preview.workspaceKind === 'demo' ? 'Demo workspace' : 'Business workspace'],
              [
                'Workspace ID',
                <code key="id" className="text-xs">
                  {preview.workspaceId}
                </code>,
              ],
              ['Exported', formatDateTime(preview.exportedAt, backupTimeZone)],
              ['Made with', `${preview.app.name} ${preview.app.version}`],
              [
                'Data version',
                preview.upgradedFrom === null
                  ? `${preview.schemaVersion} (format ${preview.formatVersion})`
                  : `${preview.schemaVersion}, from an earlier app version: upgraded on restore (the file is not changed)`,
              ],
              [
                'Records',
                `${preview.counts.assets} assets, ${preview.counts.assetCategories} categories, ${preview.counts.depreciationSchedules} schedule versions (${preview.counts.depreciationLines} monthly lines), ${preview.counts.auditEvents} audit events`,
              ],
              ['File size', formatBytes(preview.sizeBytes)],
            ]}
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setConfirming(true)}>Restore this workspace…</Button>
            <Button variant="secondary" onClick={chooseAnother}>
              Choose a different file
            </Button>
          </div>
        </div>
      )}

      {restore.isError && (
        <Alert tone="danger" title="Restore failed">
          <p>{restore.error.message}</p>
          <p>Nothing was restored.</p>
        </Alert>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Restore “${preview?.workspaceName ?? ''}” on this device?`}
        description={
          <>
            <p>
              This device’s workspace will become a copy of the backup. Restore only works into an
              empty workspace, so nothing is merged or overwritten.
            </p>
            <p>
              Later changes on this device are <strong>not</strong> shared with other devices.
            </p>
          </>
        }
        confirmLabel="Restore workspace"
        pending={restore.isPending}
        onConfirm={() => void confirmRestore()}
      />
    </div>
  );
}
