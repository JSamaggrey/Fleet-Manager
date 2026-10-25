import Dexie, { type EntityTable } from 'dexie';
import type { AuditEvent } from '@/domain/audit';
import type { Workspace } from '@/domain/workspace';

export const DEFAULT_DATABASE_NAME = 'fms';

/**
 * IndexedDB schema version. Bump it with a new `this.version(n)` block (never edit an old one) and
 * add an upgrade function plus a test when existing data must be transformed.
 */
export const DB_SCHEMA_VERSION = 1;

export class FmsDatabase extends Dexie {
  declare workspace: EntityTable<Workspace, 'id'>;
  declare auditEvents: EntityTable<AuditEvent, 'id'>;

  constructor(name = DEFAULT_DATABASE_NAME) {
    super(name);
    this.version(1).stores({
      workspace: 'id',
      auditEvents: 'id, &sequence, [entityType+entityId], occurredAt',
    });
  }
}
