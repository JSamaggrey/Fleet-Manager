import type { Asset, AssetCategory } from '@/domain/assets';
import type { AuditEvent } from '@/domain/audit';
import type { DepreciationLine, DepreciationSchedule } from '@/domain/depreciation';
import type { YearMonth } from '@/domain/periods';
import type { Expense, ExpenseCategory, RevenueEntry } from '@/domain/transactions';
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
  /** Newest first. */
  listForEntity(entityType: string, entityId: string): Promise<AuditEvent[]>;
  count(): Promise<number>;
}

export interface AssetCategoryRepository {
  list(): Promise<AssetCategory[]>;
  get(id: string): Promise<AssetCategory | undefined>;
  put(category: AssetCategory): Promise<void>;
}

export interface AssetRepository {
  list(): Promise<Asset[]>;
  get(id: string): Promise<Asset | undefined>;
  put(asset: Asset): Promise<void>;
}

export interface DepreciationRepository {
  /** All versions for an asset, oldest first. */
  listSchedules(assetId: string): Promise<DepreciationSchedule[]>;
  listAllSchedules(): Promise<DepreciationSchedule[]>;
  addSchedule(schedule: DepreciationSchedule): Promise<void>;
  /** Lines of every version for an asset, ordered by period. */
  listLines(assetId: string): Promise<DepreciationLine[]>;
  /** Lines of every version for every asset in one month. */
  listLinesForPeriod(period: YearMonth): Promise<DepreciationLine[]>;
  addLines(lines: readonly DepreciationLine[]): Promise<void>;
}

export interface ExpenseCategoryRepository {
  list(): Promise<ExpenseCategory[]>;
  get(id: string): Promise<ExpenseCategory | undefined>;
  put(category: ExpenseCategory): Promise<void>;
}

/** Records are never deleted; voiding is an update. */
export interface RevenueRepository {
  list(): Promise<RevenueEntry[]>;
  get(id: string): Promise<RevenueEntry | undefined>;
  put(entry: RevenueEntry): Promise<void>;
}

/** Records are never deleted; voiding is an update. */
export interface ExpenseRepository {
  list(): Promise<Expense[]>;
  get(id: string): Promise<Expense | undefined>;
  put(expense: Expense): Promise<void>;
}

export interface Repositories {
  workspace: WorkspaceRepository;
  audit: AuditRepository;
  categories: AssetCategoryRepository;
  assets: AssetRepository;
  depreciation: DepreciationRepository;
  expenseCategories: ExpenseCategoryRepository;
  revenue: RevenueRepository;
  expenses: ExpenseRepository;
}

/** Every persisted table. Adding an entity means adding it here, which the backup format follows. */
export interface WorkspaceTables {
  workspace: Workspace[];
  auditEvents: AuditEvent[];
  assetCategories: AssetCategory[];
  assets: Asset[];
  depreciationSchedules: DepreciationSchedule[];
  depreciationLines: DepreciationLine[];
  expenseCategories: ExpenseCategory[];
  revenueEntries: RevenueEntry[];
  expenses: Expense[];
}

export type TableName = keyof WorkspaceTables;

export const TABLE_NAMES = [
  'workspace',
  'auditEvents',
  'assetCategories',
  'assets',
  'depreciationSchedules',
  'depreciationLines',
  'expenseCategories',
  'revenueEntries',
  'expenses',
] as const satisfies readonly TableName[];

export function emptyTables(): WorkspaceTables {
  return {
    workspace: [],
    auditEvents: [],
    assetCategories: [],
    assets: [],
    depreciationSchedules: [],
    depreciationLines: [],
    expenseCategories: [],
    revenueEntries: [],
    expenses: [],
  };
}

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
