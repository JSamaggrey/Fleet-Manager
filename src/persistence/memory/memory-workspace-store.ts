import {
  TABLE_NAMES,
  WorkspaceNotEmptyError,
  emptyTables,
  type Repositories,
  type WorkspaceSnapshot,
  type WorkspaceStore,
  type WorkspaceTables,
} from '@/repositories';

/**
 * In-memory adapter for tests and as a reference implementation of the repository contract.
 * Writes run against a copy that replaces the state only on success, which gives atomicity.
 */
export class MemoryWorkspaceStore implements WorkspaceStore {
  readonly schemaVersion: number;
  #state: WorkspaceTables = emptyTables();
  #queue: Promise<unknown> = Promise.resolve();

  constructor(schemaVersion = 3) {
    this.schemaVersion = schemaVersion;
  }

  read<T>(work: (repos: Repositories) => Promise<T>): Promise<T> {
    return this.#serialised(() => work(this.#repos(structuredClone(this.#state), false)));
  }

  write<T>(work: (repos: Repositories) => Promise<T>): Promise<T> {
    return this.#serialised(async () => {
      const draft = structuredClone(this.#state);
      const result = await work(this.#repos(draft, true));
      this.#state = draft;
      return result;
    });
  }

  snapshot(): Promise<WorkspaceSnapshot> {
    return this.#serialised(async () => ({
      schemaVersion: this.schemaVersion,
      tables: structuredClone(this.#state),
    }));
  }

  restore(snapshot: WorkspaceSnapshot): Promise<void> {
    return this.#serialised(async () => {
      if (!this.#isEmpty()) {
        throw new WorkspaceNotEmptyError();
      }
      const tables = structuredClone(snapshot.tables);
      for (const name of TABLE_NAMES) {
        assertUnique(
          tables[name].map((row) => row.id),
          `${name} id`,
        );
      }
      assertUnique(
        tables.auditEvents.map((e) => e.sequence),
        'audit sequence',
      );
      this.#state = tables;
    });
  }

  isEmpty(): Promise<boolean> {
    return this.#serialised(async () => this.#isEmpty());
  }

  erase(): Promise<void> {
    return this.#serialised(async () => {
      this.#state = emptyTables();
    });
  }

  #isEmpty(): boolean {
    return TABLE_NAMES.every((name) => this.#state[name].length === 0);
  }

  #serialised<T>(task: () => Promise<T>): Promise<T> {
    const run = this.#queue.then(task, task);
    this.#queue = run.catch(() => undefined);
    return run;
  }

  #repos(tables: WorkspaceTables, writable: boolean): Repositories {
    const assertWritable = () => {
      if (!writable) throw new Error('Cannot write inside a read transaction.');
    };
    const clone = structuredClone;
    function upsert<T extends { id: string }>(rows: T[], row: T): void {
      const index = rows.findIndex((r) => r.id === row.id);
      if (index === -1) rows.push(clone(row));
      else rows[index] = clone(row);
    }
    function insert<T extends { id: string }>(rows: T[], row: T, label: string): void {
      if (rows.some((r) => r.id === row.id)) throw new Error(`Duplicate ${label} id ${row.id}.`);
      rows.push(clone(row));
    }
    return {
      workspace: {
        get: async () => clone(tables.workspace[0]),
        put: async (workspace) => {
          assertWritable();
          tables.workspace = [clone(workspace)];
        },
      },
      audit: {
        append: async (event) => {
          assertWritable();
          const last = tables.auditEvents.at(-1)?.sequence ?? 0;
          const stored = { ...event, sequence: last + 1 };
          insert(tables.auditEvents, stored, 'audit event');
          return clone(stored);
        },
        list: async ({ offset, limit }) =>
          clone([...tables.auditEvents].reverse().slice(offset, offset + limit)),
        listForEntity: async (entityType, entityId) =>
          clone(
            tables.auditEvents
              .filter((e) => e.entityType === entityType && e.entityId === entityId)
              .reverse(),
          ),
        count: async () => tables.auditEvents.length,
      },
      categories: {
        list: async () => clone(tables.assetCategories),
        get: async (id) => clone(tables.assetCategories.find((c) => c.id === id)),
        put: async (category) => {
          assertWritable();
          upsert(tables.assetCategories, category);
        },
      },
      assets: {
        list: async () => clone(tables.assets),
        get: async (id) => clone(tables.assets.find((a) => a.id === id)),
        put: async (asset) => {
          assertWritable();
          upsert(tables.assets, asset);
        },
      },
      depreciation: {
        listSchedules: async (assetId) =>
          clone(
            tables.depreciationSchedules
              .filter((s) => s.assetId === assetId)
              .sort((a, b) => a.version - b.version),
          ),
        listAllSchedules: async () => clone(tables.depreciationSchedules),
        addSchedule: async (schedule) => {
          assertWritable();
          insert(tables.depreciationSchedules, schedule, 'schedule');
        },
        listLines: async (assetId) =>
          clone(
            tables.depreciationLines
              .filter((l) => l.assetId === assetId)
              .sort((a, b) => a.period.localeCompare(b.period)),
          ),
        listLinesForPeriod: async (period) =>
          clone(tables.depreciationLines.filter((l) => l.period === period)),
        addLines: async (lines) => {
          assertWritable();
          for (const line of lines) insert(tables.depreciationLines, line, 'depreciation line');
        },
      },
      expenseCategories: {
        list: async () => clone(tables.expenseCategories),
        get: async (id) => clone(tables.expenseCategories.find((c) => c.id === id)),
        put: async (category) => {
          assertWritable();
          upsert(tables.expenseCategories, category);
        },
      },
      revenue: {
        list: async () => clone(tables.revenueEntries),
        get: async (id) => clone(tables.revenueEntries.find((r) => r.id === id)),
        put: async (entry) => {
          assertWritable();
          upsert(tables.revenueEntries, entry);
        },
      },
      expenses: {
        list: async () => clone(tables.expenses),
        get: async (id) => clone(tables.expenses.find((e) => e.id === id)),
        put: async (expense) => {
          assertWritable();
          upsert(tables.expenses, expense);
        },
      },
    };
  }
}

function assertUnique(values: readonly unknown[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`Duplicate ${label} in snapshot.`);
  }
}
