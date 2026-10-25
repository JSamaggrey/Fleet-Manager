import { z } from 'zod';
import { auditEventSchema } from '@/domain/audit';
import { idSchema, isoTimestampSchema } from '@/domain/common/schemas';
import { workspaceKindSchema, workspaceSchema } from '@/domain/workspace';
import { TABLE_NAMES, type TableName } from '@/repositories';

/**
 * Full-workspace backup file format. Documented in docs/backup-format.md; any change to the
 * envelope or the data tables must bump BACKUP_FORMAT_VERSION or the database schema version.
 */
export const BACKUP_FORMAT = 'fms.workspace-backup';
export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_FILE_EXTENSION = '.fmsbackup.json';
/** Larger files are rejected before being read into memory. */
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;

const countsSchema = z.strictObject(
  Object.fromEntries(TABLE_NAMES.map((name) => [name, z.number().int().nonnegative()])) as Record<
    TableName,
    z.ZodNumber
  >,
);

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
  counts: countsSchema,
  checksum: z.strictObject({
    algorithm: z.literal('SHA-256'),
    value: z.string().regex(/^[0-9a-f]{64}$/),
  }),
  data: z.unknown(),
});

/** Data tables for database schema version 1. */
export const backupDataSchemaV1 = z.strictObject({
  workspace: z.array(workspaceSchema).length(1, 'A backup must contain exactly one workspace.'),
  auditEvents: z.array(auditEventSchema),
});

export type BackupEnvelope = z.infer<typeof backupEnvelopeSchema>;
