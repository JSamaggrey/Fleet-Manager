import type { Table, Transaction } from 'dexie';
import type { Asset, AssetCategory } from '@/domain/assets';
import type { AuditEvent } from '@/domain/audit';
import type { DepreciationLine, DepreciationSchedule } from '@/domain/depreciation';
import type { Expense, ExpenseCategory, RevenueEntry } from '@/domain/transactions';
import type { Workspace } from '@/domain/workspace';
import {
  TABLE_NAMES,
  WorkspaceNotEmptyError,
  type Repositories,
  type TableName,
  type WorkspaceSnapshot,
  type WorkspaceStore,
  type WorkspaceTables,
} from '@/repositories';
import { DB_SCHEMA_VERSION, type FmsDatabase } from './fms-database';

const byPeriod = <T extends { period: string }>(rows: T[]) =>
  rows.sort((a, b) => a.period.localeCompare(b.period));

/**
 * Repositories bound explicitly to one transaction via `tx.table()`.
 *
 * Dexie can also find the "current" transaction implicitly through promise zones, but that
 * tracking is lost across deep chains of native async calls (service → helper → repository).
 * An operation that escapes the transaction lets IndexedDB auto-commit early
 * ("Transaction committed too early"). Binding every call to `tx` avoids relying on zones.
 */
function repositoriesFor(tx: Transaction): Repositories {
  const workspace = tx.table<Workspace, string>('workspace');
  const auditEvents = tx.table<AuditEvent, string>('auditEvents');
  const assetCategories = tx.table<AssetCategory, string>('assetCategories');
  const assets = tx.table<Asset, string>('assets');
  const schedules = tx.table<DepreciationSchedule, string>('depreciationSchedules');
  const lines = tx.table<DepreciationLine, string>('depreciationLines');
  const expenseCategories = tx.table<ExpenseCategory, string>('expenseCategories');
  const revenueEntries = tx.table<RevenueEntry, string>('revenueEntries');
  const expenses = tx.table<Expense, string>('expenses');

  return {
    workspace: {
      get: () => workspace.toCollection().first(),
      put: async (record) => {
        await workspace.put(record);
      },
    },
    audit: {
      append: async (event) => {
        const last = await auditEvents.orderBy('sequence').last();
        const stored = { ...event, sequence: (last?.sequence ?? 0) + 1 };
        await auditEvents.add(stored);
        return stored;
      },
      list: ({ offset, limit }) =>
        auditEvents.orderBy('sequence').reverse().offset(offset).limit(limit).toArray(),
      listForEntity: async (entityType, entityId) =>
        (await auditEvents.where({ entityType, entityId }).toArray()).sort(
          (a, b) => b.sequence - a.sequence,
        ),
      count: () => auditEvents.count(),
    },
    categories: {
      list: () => assetCategories.toArray(),
      get: (id) => assetCategories.get(id),
      put: async (category) => {
        await assetCategories.put(category);
      },
    },
    assets: {
      list: () => assets.toArray(),
      get: (id) => assets.get(id),
      put: async (asset) => {
        await assets.put(asset);
      },
    },
    depreciation: {
      listSchedules: async (assetId) =>
        (await schedules.where({ assetId }).toArray()).sort((a, b) => a.version - b.version),
      listAllSchedules: () => schedules.toArray(),
      addSchedule: async (schedule) => {
        await schedules.add(schedule);
      },
      listLines: async (assetId) => byPeriod(await lines.where({ assetId }).toArray()),
      listLinesForPeriod: (period) => lines.where({ period }).toArray(),
      addLines: async (rows) => {
        await lines.bulkAdd([...rows]);
      },
    },
    expenseCategories: {
      list: () => expenseCategories.toArray(),
      get: (id) => expenseCategories.get(id),
      put: async (category) => {
        await expenseCategories.put(category);
      },
    },
    revenue: {
      list: () => revenueEntries.toArray(),
      get: (id) => revenueEntries.get(id),
      put: async (entry) => {
        await revenueEntries.put(entry);
      },
    },
    expenses: {
      list: () => expenses.toArray(),
      get: (id) => expenses.get(id),
      put: async (expense) => {
        await expenses.put(expense);
      },
    },
  };
}

export class DexieWorkspaceStore implements WorkspaceStore {
  readonly schemaVersion = DB_SCHEMA_VERSION;
  readonly #db: FmsDatabase;

  constructor(db: FmsDatabase) {
    this.#db = db;
  }

  #tables(): Table[] {
    return TABLE_NAMES.map((name) => this.#db.table(name));
  }

  read<T>(work: (repos: Repositories) => Promise<T>): Promise<T> {
    return this.#db.transaction('r', this.#tables(), (tx) => work(repositoriesFor(tx)));
  }

  write<T>(work: (repos: Repositories) => Promise<T>): Promise<T> {
    return this.#db.transaction('rw', this.#tables(), (tx) => work(repositoriesFor(tx)));
  }

  snapshot(): Promise<WorkspaceSnapshot> {
    return this.#db.transaction('r', this.#tables(), async (tx) => {
      const tables = {} as Record<TableName, unknown[]>;
      for (const name of TABLE_NAMES) {
        tables[name] =
          name === 'auditEvents'
            ? await tx.table('auditEvents').orderBy('sequence').toArray()
            : await tx.table(name).toArray();
      }
      return { schemaVersion: this.schemaVersion, tables: tables as unknown as WorkspaceTables };
    });
  }

  restore(snapshot: WorkspaceSnapshot): Promise<void> {
    return this.#db.transaction('rw', this.#tables(), async (tx) => {
      if (!(await isEmptyIn(tx))) {
        throw new WorkspaceNotEmptyError();
      }
      // bulkAdd (not bulkPut) so a duplicate key aborts the whole transaction.
      for (const name of TABLE_NAMES) {
        await tx.table(name).bulkAdd(snapshot.tables[name]);
      }
    });
  }

  isEmpty(): Promise<boolean> {
    return this.#db.transaction('r', this.#tables(), (tx) => isEmptyIn(tx));
  }

  erase(): Promise<void> {
    return this.#db.transaction('rw', this.#tables(), async (tx) => {
      for (const name of TABLE_NAMES) {
        await tx.table(name).clear();
      }
    });
  }
}

async function isEmptyIn(tx: Transaction): Promise<boolean> {
  for (const name of TABLE_NAMES) {
    if ((await tx.table(name).count()) > 0) {
      return false;
    }
  }
  return true;
}
