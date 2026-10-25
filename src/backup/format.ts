import { z } from 'zod';
import { assetCategorySchema, assetSchema } from '@/domain/assets';
import { auditEventSchema } from '@/domain/audit';
import { idSchema, isoTimestampSchema } from '@/domain/common/schemas';
import { depreciationLineSchema, depreciationScheduleSchema } from '@/domain/depreciation';
import { workspaceKindSchema, workspaceSchema } from '@/domain/workspace';

/**
 * Full-workspace backup file format. Documented in docs/backup-format.md; any change to the
 * envelope or the data tables must bump BACKUP_FORMAT_VERSION or the database schema version.
 */
export const BACKUP_FORMAT = 'fms.workspace-backup';
export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_FILE_EXTENSION = '.fmsbackup.json';
/** Larger files are rejected before being read into memory. */
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
/** Data (database schema) versions this app can restore. Older ones are upgraded on import. */
export const SUPPORTED_SCHEMA_VERSIONS = [1, 2] as const;

/** First pass: identifies the file and its versions without trusting the data section. */
export const backupHeaderSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  formatVersion: z.number().int().positive(),
  schemaVersion: z.number().int().positive(),
});

export const backupEnvelopeSchema = z.strictObject({
  format: z.literal(BACKUP_FORMAT),
  formatVersion: z.literal(BACKUP_FORMAT_VERSION),
  schemaVersion: z.number().int().positive(),
  app: z.strictObject({ name: z.string(), version: z.string() }),
  exportedAt: isoTimestampSchema,
  workspace: z.strictObject({ id: idSchema, name: z.string(), kind: workspaceKindSchema }),
  /** Row count per table present in this data version. */
  counts: z.record(z.string(), z.number().int().nonnegative()),
  checksum: z.strictObject({
    algorithm: z.literal('SHA-256'),
    value: z.string().regex(/^[0-9a-f]{64}$/),
  }),
  data: z.unknown(),
});

const oneWorkspace = <T extends z.ZodType>(schema: T) =>
  z.array(schema).length(1, 'A backup must contain exactly one workspace.');

/** Data version 1 (Phase 1): workspace and audit only; no period-close marker. Frozen. */
export const backupDataSchemaV1 = z.strictObject({
  workspace: oneWorkspace(workspaceSchema.omit({ depreciationClosedThrough: true })),
  auditEvents: z.array(auditEventSchema),
});

/** Data version 2 (Phase 2): adds asset categories, assets, and depreciation schedules/lines. */
export const backupDataSchemaV2 = z.strictObject({
  workspace: oneWorkspace(workspaceSchema),
  auditEvents: z.array(auditEventSchema),
  assetCategories: z.array(assetCategorySchema),
  assets: z.array(assetSchema),
  depreciationSchedules: z.array(depreciationScheduleSchema),
  depreciationLines: z.array(depreciationLineSchema),
});

export type BackupEnvelope = z.infer<typeof backupEnvelopeSchema>;
export type BackupDataV1 = z.infer<typeof backupDataSchemaV1>;
