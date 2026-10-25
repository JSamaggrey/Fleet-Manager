import { z } from 'zod';
import { idSchema, isoTimestampSchema, isValidTimeZone } from '../common/schemas';
import { REPORTING_CURRENCY } from '../money';
import { yearMonthSchema } from '../periods';

export const WORKSPACE_NAME_MAX_LENGTH = 80;

export const workspaceNameSchema = z
  .string()
  .trim()
  .min(1, 'Enter a workspace name.')
  .max(WORKSPACE_NAME_MAX_LENGTH, `Use at most ${WORKSPACE_NAME_MAX_LENGTH} characters.`);

export const workspaceSettingsSchema = z.strictObject({
  /** 0 = Sunday … 6 = Saturday. */
  weekStartsOn: z.number().int().min(0).max(6),
  timeZone: z.string().refine(isValidTimeZone, 'Choose a valid time zone.'),
  reportingCurrency: z.literal(REPORTING_CURRENCY),
  backupReminderDays: z
    .number('Enter a number of days.')
    .int('Use whole days.')
    .min(1, 'Use at least 1 day.')
    .max(90, 'Use at most 90 days.'),
});

export const workspaceKindSchema = z.enum(['business', 'demo']);

export const workspaceSchema = z.strictObject({
  id: idSchema,
  name: workspaceNameSchema,
  kind: workspaceKindSchema,
  settings: workspaceSettingsSchema,
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
  /** When this device last produced a full backup file (or the restored backup's export time). */
  lastBackupAt: isoTimestampSchema.nullable(),
  /** Depreciation lines up to and including this month are closed and never rewritten. */
  depreciationClosedThrough: yearMonthSchema.nullable(),
});

export type Workspace = z.infer<typeof workspaceSchema>;
export type WorkspaceSettings = z.infer<typeof workspaceSettingsSchema>;
export type WorkspaceKind = z.infer<typeof workspaceKindSchema>;

/** Defaults documented in docs/product-defaults.md. */
export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  weekStartsOn: 1,
  timeZone: 'Africa/Accra',
  reportingCurrency: REPORTING_CURRENCY,
  backupReminderDays: 7,
};

export const DEMO_WORKSPACE_NAME = 'Demo workspace';

export function newWorkspace(input: {
  id: string;
  name: string;
  kind: WorkspaceKind;
  now: Date;
}): Workspace {
  const timestamp = input.now.toISOString();
  return workspaceSchema.parse({
    id: input.id,
    name: input.name,
    kind: input.kind,
    settings: DEFAULT_WORKSPACE_SETTINGS,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastBackupAt: null,
    depreciationClosedThrough: null,
  });
}

export type BackupStatus =
  | { state: 'never' }
  | { state: 'current'; daysSince: number }
  | { state: 'overdue'; daysSince: number };

const DAY_MS = 24 * 60 * 60 * 1000;

export function backupStatus(workspace: Workspace, now: Date): BackupStatus {
  if (workspace.lastBackupAt === null) {
    return { state: 'never' };
  }
  const daysSince = Math.max(
    0,
    Math.floor((now.getTime() - Date.parse(workspace.lastBackupAt)) / DAY_MS),
  );
  return daysSince >= workspace.settings.backupReminderDays
    ? { state: 'overdue', daysSince }
    : { state: 'current', daysSince };
}
