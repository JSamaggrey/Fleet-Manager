import { z } from 'zod';
import { idSchema, isoTimestampSchema } from '../common/schemas';

/**
 * Actor recorded on audit events. There are no user profiles yet; every change on a device is
 * attributed to its local user. Local profiles would not be server-grade authorization anyway.
 */
export const LOCAL_ACTOR = 'local-user';

export const auditChangeSchema = z.strictObject({
  field: z.string().min(1).max(100),
  before: z.json(),
  after: z.json(),
});

export const auditEventSchema = z.strictObject({
  id: idSchema,
  workspaceId: idSchema,
  /** Monotonic per workspace; defines audit order independent of device clocks. */
  sequence: z.number().int().positive(),
  occurredAt: isoTimestampSchema,
  actor: z.string().min(1).max(100),
  action: z.string().regex(/^[a-z]+(\.[a-z-]+)+$/, 'Action must look like "entity.verb".'),
  entityType: z.string().min(1).max(50),
  entityId: idSchema,
  summary: z.string().max(500),
  changes: z.array(auditChangeSchema),
});

export type AuditEvent = z.infer<typeof auditEventSchema>;
export type AuditChange = z.infer<typeof auditChangeSchema>;
type Json = AuditChange['before'];

/**
 * Field-level changes between two versions of a record, limited to the listed fields.
 * Nested objects are compared by JSON value, so settings changes are recorded per field path.
 */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: T,
  fields: readonly (keyof T & string)[],
): AuditChange[] {
  const changes: AuditChange[] = [];
  for (const field of fields) {
    const a = before[field];
    const b = after[field];
    if (isPlainObject(a) && isPlainObject(b)) {
      for (const change of diffFields(a, b, Object.keys({ ...a, ...b }))) {
        changes.push({ ...change, field: `${field}.${change.field}` });
      }
    } else if (JSON.stringify(a) !== JSON.stringify(b)) {
      changes.push({ field, before: toJson(a), after: toJson(b) });
    }
  }
  return changes;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toJson(value: unknown): Json {
  return value === undefined ? null : (JSON.parse(JSON.stringify(value)) as Json);
}
