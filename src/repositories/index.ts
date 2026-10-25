import type { AuditEvent } from '@/domain/audit';
import type { Workspace } from '@/domain/workspace';

/**
 * Storage-agnostic repository interfaces. Every adapter (IndexedDB today; SQLite or an API later)
 * must pass the shared contract tests in src/persistence/workspace-store.contract.ts.
 */

export interface PageRequest {
  offset: number;
  limit: number;
}

export interface WorkspaceRepository {
  /** MVP holds exactly zero or one workspace per device. */
  get(): Promise<Workspace | undefined>;
  put(workspace: Workspace): Promise<void>;
}

export type NewAuditEvent = Omit<AuditEvent, 'sequence'>;

export interface AuditRepository {
  /** Appends an event, assigning the next sequence number. */
  append(event: NewAuditEvent): Promise<AuditEvent>;
  /** Newest first. */
  list(page: PageRequest): Promise<AuditEvent[]>;
  count(): Promise<number>;
}

export interface Repositories {
  workspace: WorkspaceRepository;
  audit: AuditRepository;
}

/** Every persisted table. Adding an entity means adding it here, which the backup format follows. */
export interface WorkspaceTables {
  workspace: Workspace[];
  auditEvents: AuditEvent[];
}

export type TableName = keyof WorkspaceTables;

export const TABLE_NAMES = ['workspace', 'auditEvents'] as const satisfies readonly TableName[];

export interface WorkspaceSnapshot {
  schemaVersion: number;
  tables: WorkspaceTables;
}

export class WorkspaceNotEmptyError extends Error {
  override name = 'WorkspaceNotEmptyError';
  constructor() {
    super('This device already has a workspace. Restore only works into an empty workspace.');
  }
}

export interface WorkspaceStore {
  readonly schemaVersion: number;
  read<T>(work: (repos: Repositories) => Promise<T>): Promise<T>;
  /**
   * Runs `work` atomically: if it throws, nothing it wrote is kept.
   * Only await repository calls inside `work`; other async work (e.g. crypto) can end an
   * IndexedDB transaction early.
   */
  write<T>(work: (repos: Repositories) => Promise<T>): Promise<T>;
  /** Consistent copy of every table. */
  snapshot(): Promise<WorkspaceSnapshot>;
  /** Atomically loads a snapshot. Throws WorkspaceNotEmptyError unless every table is empty. */
  restore(snapshot: WorkspaceSnapshot): Promise<void>;
  isEmpty(): Promise<boolean>;
  /** Permanently deletes all local workspace data. */
  erase(): Promise<void>;
}
