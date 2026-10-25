import { defaultAssetCategories, normalizeAssetCode } from '@/domain/assets';
import { LOCAL_ACTOR, type AuditEvent } from '@/domain/audit';
import type { WorkspaceKind } from '@/domain/workspace';
import {
  TABLE_NAMES,
  WorkspaceNotEmptyError,
  type TableName,
  type WorkspaceSnapshot,
  type WorkspaceStore,
  type WorkspaceTables,
} from '@/repositories';
import { canonicalJson, sha256Hex } from './checksum';
import {
  BACKUP_FILE_EXTENSION,
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  MAX_BACKUP_BYTES,
  SUPPORTED_SCHEMA_VERSIONS,
  backupDataSchemaV1,
  backupDataSchemaV2,
  backupEnvelopeSchema,
  backupHeaderSchema,
  type BackupDataV1,
  type BackupEnvelope,
} from './format';

export interface AppInfo {
  name: string;
  version: string;
}

export interface BackupFile {
  fileName: string;
  contents: string;
  exportedAt: Date;
}

export interface BackupPreview {
  workspaceId: string;
  workspaceName: string;
  workspaceKind: WorkspaceKind;
  exportedAt: string;
  app: AppInfo;
  formatVersion: number;
  schemaVersion: number;
  /** Set when an older data version was upgraded on import. */
  upgradedFrom: number | null;
  counts: Record<TableName, number>;
  sizeBytes: number;
}

export type BackupErrorCode =
  | 'too-large'
  | 'empty'
  | 'not-json'
  | 'not-a-backup'
  | 'newer-format'
  | 'newer-schema'
  | 'unsupported-schema'
  | 'invalid-envelope'
  | 'checksum-mismatch'
  | 'invalid-data'
  | 'integrity';

export interface BackupProblem {
  code: BackupErrorCode;
  message: string;
  details: string[];
}

/** A backup that passed every check and can be restored. */
export interface ValidatedBackup {
  preview: BackupPreview;
  snapshot: WorkspaceSnapshot;
}

export type BackupInspection =
  { ok: true; backup: ValidatedBackup } | { ok: false; problem: BackupProblem };

export class BackupRejectedError extends Error {
  override name = 'BackupRejectedError';
  readonly problem: BackupProblem;
  constructor(problem: BackupProblem) {
    super(problem.message);
    this.problem = problem;
  }
}

export interface BackupServiceDependencies {
  store: WorkspaceStore;
  app: AppInfo;
  newId: () => string;
  now: () => Date;
}

const fail = (
  code: BackupErrorCode,
  message: string,
  details: string[] = [],
): BackupInspection => ({
  ok: false,
  problem: { code, message, details },
});

export function createBackupService(deps: BackupServiceDependencies) {
  const { store, app, newId, now } = deps;

  return {
    /** Builds the complete backup file. Recording that a backup was made is the caller's job. */
    async createBackup(): Promise<BackupFile> {
      const snapshot = await store.snapshot();
      const workspace = snapshot.tables.workspace[0];
      if (!workspace) {
        throw new Error('There is no workspace to back up.');
      }
      const exportedAt = now();
      const data = snapshot.tables;
      const envelope: BackupEnvelope = {
        format: BACKUP_FORMAT,
        formatVersion: BACKUP_FORMAT_VERSION,
        schemaVersion: snapshot.schemaVersion,
        app,
        exportedAt: exportedAt.toISOString(),
        workspace: { id: workspace.id, name: workspace.name, kind: workspace.kind },
        counts: countRows(data),
        checksum: { algorithm: 'SHA-256', value: await sha256Hex(canonicalJson(data)) },
        data,
      };
      return {
        fileName: backupFileName(workspace.name, exportedAt),
        contents: JSON.stringify(envelope, null, 2),
        exportedAt,
      };
    },

    /** Checks size before reading so an oversized file is never loaded into memory. */
    async inspectFile(file: Blob): Promise<BackupInspection> {
      if (file.size > MAX_BACKUP_BYTES) {
        return tooLarge(file.size);
      }
      return this.inspectText(await file.text());
    },

    /** Validates a backup completely without touching the workspace. */
    async inspectText(text: string): Promise<BackupInspection> {
      const sizeBytes = new TextEncoder().encode(text).byteLength;
      if (sizeBytes > MAX_BACKUP_BYTES) return tooLarge(sizeBytes);
      if (text.trim() === '') return fail('empty', 'The file is empty.');

      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        return fail('not-json', 'The file is not valid JSON, so it is not a workspace backup.');
      }

      const header = backupHeaderSchema.safeParse(raw);
      if (!header.success) {
        return fail(
          'not-a-backup',
          'This file is not a full workspace backup. CSV/report exports cannot be restored.',
        );
      }
      if (header.data.formatVersion > BACKUP_FORMAT_VERSION) {
        return fail(
          'newer-format',
          'This backup was made by a newer version of the app. Update the app on this device first.',
        );
      }
      if (header.data.schemaVersion > store.schemaVersion) {
        return fail(
          'newer-schema',
          'This backup uses a newer data version than this app supports. Update the app first.',
        );
      }
      if (!(SUPPORTED_SCHEMA_VERSIONS as readonly number[]).includes(header.data.schemaVersion)) {
        return fail(
          'unsupported-schema',
          `Backup data version ${header.data.schemaVersion} is not supported.`,
        );
      }

      const envelope = backupEnvelopeSchema.safeParse(raw);
      if (!envelope.success) {
        return fail(
          'invalid-envelope',
          'The backup header is incomplete or damaged.',
          issues(envelope.error),
        );
      }

      const expected = envelope.data.checksum.value;
      const actual = await sha256Hex(canonicalJson(envelope.data.data));
      if (actual !== expected) {
        return fail(
          'checksum-mismatch',
          'The backup contents do not match their checksum. The file may be damaged or edited.',
        );
      }

      const dataSchema =
        envelope.data.schemaVersion === 1 ? backupDataSchemaV1 : backupDataSchemaV2;
      const data = dataSchema.safeParse(envelope.data.data);
      if (!data.success) {
        return fail('invalid-data', 'The backup contains invalid records.', issues(data.error));
      }

      const countProblems = checkCounts(envelope.data, data.data);
      if (countProblems.length > 0) {
        return fail('integrity', 'The backup failed consistency checks.', countProblems);
      }

      // Older data versions are upgraded in memory; the file itself is never modified.
      const tables =
        envelope.data.schemaVersion === 1
          ? upgradeV1ToV2(data.data as BackupDataV1, newId, envelope.data.exportedAt)
          : (data.data as WorkspaceTables);

      const integrityProblems = checkIntegrity(envelope.data, tables);
      if (integrityProblems.length > 0) {
        return fail('integrity', 'The backup failed consistency checks.', integrityProblems);
      }

      const workspace = tables.workspace[0];
      if (!workspace) return fail('invalid-data', 'The backup has no workspace.');
      return {
        ok: true,
        backup: {
          preview: {
            workspaceId: workspace.id,
            workspaceName: workspace.name,
            workspaceKind: workspace.kind,
            exportedAt: envelope.data.exportedAt,
            app: envelope.data.app,
            formatVersion: envelope.data.formatVersion,
            schemaVersion: envelope.data.schemaVersion,
            upgradedFrom:
              envelope.data.schemaVersion < store.schemaVersion
                ? envelope.data.schemaVersion
                : null,
            counts: countRows(tables),
            sizeBytes,
          },
          snapshot: { schemaVersion: store.schemaVersion, tables },
        },
      };
    },

    /**
     * Restores a validated backup into an EMPTY workspace in one atomic write, recording the
     * restore in the audit trail. Never merges with or overwrites existing data.
     */
    async restore(backup: ValidatedBackup): Promise<void> {
      if (!(await store.isEmpty())) {
        throw new WorkspaceNotEmptyError();
      }
      const tables = structuredClone(backup.snapshot.tables);
      const [workspace] = tables.workspace;
      if (!workspace) throw new Error('Backup has no workspace.');
      const restoredAt = now();
      const lastSequence = tables.auditEvents.reduce((max, e) => Math.max(max, e.sequence), 0);
      const restoreEvent: AuditEvent = {
        id: newId(),
        workspaceId: workspace.id,
        sequence: lastSequence + 1,
        occurredAt: restoredAt.toISOString(),
        actor: LOCAL_ACTOR,
        action: 'backup.restored',
        entityType: 'workspace',
        entityId: workspace.id,
        summary: `Workspace restored from backup exported ${backup.preview.exportedAt}`,
        changes: [],
      };
      // The restored data is exactly the backup's content, so it counts as backed up at export time.
      workspace.lastBackupAt = backup.preview.exportedAt;
      tables.auditEvents.push(restoreEvent);
      await store.restore({ schemaVersion: backup.snapshot.schemaVersion, tables });
    },
  };
}

export type BackupService = ReturnType<typeof createBackupService>;

export function backupFileName(workspaceName: string, at: Date): string {
  const slug =
    workspaceName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'workspace';
  const stamp = at.toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
  return `fms-${slug}-${stamp}${BACKUP_FILE_EXTENSION}`;
}

function countRows(tables: WorkspaceTables): Record<TableName, number> {
  return Object.fromEntries(TABLE_NAMES.map((name) => [name, tables[name].length])) as Record<
    TableName,
    number
  >;
}

function tooLarge(size: number): BackupInspection {
  const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
  return fail(
    'too-large',
    `The file is ${mb(size)} MB; backups larger than ${mb(MAX_BACKUP_BYTES)} MB are not accepted.`,
  );
}

function issues(error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] }) {
  return error.issues
    .slice(0, 20)
    .map((issue) => `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`);
}

/** Header counts must match the records actually present for this data version. */
function checkCounts(envelope: BackupEnvelope, data: Record<string, readonly unknown[]>): string[] {
  const problems: string[] = [];
  const names = new Set([...Object.keys(data), ...Object.keys(envelope.counts)]);
  for (const name of names) {
    const actual = data[name]?.length;
    if (actual !== envelope.counts[name]) {
      problems.push(
        `Header count for ${name} (${envelope.counts[name] ?? 'missing'}) does not match ${actual ?? 'no'} records.`,
      );
    }
  }
  return problems;
}

/** Version 1 had no assets: add the period-close marker and the default categories. */
function upgradeV1ToV2(
  data: BackupDataV1,
  newId: () => string,
  exportedAt: string,
): WorkspaceTables {
  const workspace = data.workspace.map((w) => ({ ...w, depreciationClosedThrough: null }));
  const workspaceId = workspace[0]?.id ?? '';
  return {
    workspace,
    auditEvents: data.auditEvents,
    assetCategories: defaultAssetCategories(workspaceId, new Date(exportedAt), newId),
    assets: [],
    depreciationSchedules: [],
    depreciationLines: [],
  };
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const value of values) (seen.has(value) ? dupes : seen).add(value);
  return [...dupes];
}

function checkIntegrity(envelope: BackupEnvelope, tables: WorkspaceTables): string[] {
  const problems: string[] = [];
  const [workspace] = tables.workspace;
  if (!workspace) return ['Missing workspace record.'];

  // The header sits outside the checksum, so it must agree with the verified data.
  if (
    workspace.id !== envelope.workspace.id ||
    workspace.name !== envelope.workspace.name ||
    workspace.kind !== envelope.workspace.kind
  ) {
    problems.push('Header workspace details do not match the workspace record.');
  }

  for (const name of TABLE_NAMES) {
    const rows: readonly { id: string; workspaceId?: string }[] = tables[name];
    if (duplicates(rows.map((r) => r.id)).length > 0) problems.push(`Duplicate ids in ${name}.`);
    if (name === 'workspace') continue;
    const foreign = rows.filter((r) => r.workspaceId !== workspace.id).length;
    if (foreign > 0)
      problems.push(`${foreign} record(s) in ${name} belong to a different workspace.`);
  }
  if (new Set(tables.auditEvents.map((e) => e.sequence)).size !== tables.auditEvents.length) {
    problems.push('Duplicate audit sequence numbers.');
  }

  const categoryIds = new Set(tables.assetCategories.map((c) => c.id));
  const assetIds = new Set(tables.assets.map((a) => a.id));
  for (const asset of tables.assets) {
    if (!categoryIds.has(asset.categoryId))
      problems.push(`Asset ${asset.code} has an unknown category.`);
  }
  for (const code of duplicates(tables.assets.map((a) => normalizeAssetCode(a.code)))) {
    problems.push(`Asset code ${code} is used more than once.`);
  }

  const schedulesById = new Map(tables.depreciationSchedules.map((s) => [s.id, s]));
  for (const key of duplicates(
    tables.depreciationSchedules.map((s) => `${s.assetId}#${s.version}`),
  )) {
    problems.push(`Duplicate schedule version ${key}.`);
  }
  if (tables.depreciationSchedules.some((s) => !assetIds.has(s.assetId))) {
    problems.push('A depreciation schedule refers to an unknown asset.');
  }
  for (const asset of tables.assets) {
    const latest = tables.depreciationSchedules
      .filter((s) => s.assetId === asset.id)
      .sort((a, b) => b.version - a.version)[0];
    if (!latest) problems.push(`Asset ${asset.code} has no depreciation schedule.`);
    else if (JSON.stringify(latest.assumptions) !== JSON.stringify(asset.depreciation)) {
      problems.push(`Asset ${asset.code} does not match its latest depreciation schedule.`);
    }
  }
  const orphanLines = tables.depreciationLines.filter((line) => {
    const schedule = schedulesById.get(line.scheduleId);
    return !schedule || schedule.assetId !== line.assetId;
  }).length;
  if (orphanLines > 0)
    problems.push(`${orphanLines} depreciation line(s) do not match a schedule.`);

  return problems.slice(0, 20);
}
