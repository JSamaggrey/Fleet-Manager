import {
  TABLE_NAMES,
  WorkspaceNotEmptyError,
  type Repositories,
  type WorkspaceSnapshot,
  type WorkspaceStore,
} from '@/repositories';
import { DB_SCHEMA_VERSION, type FmsDatabase } from './fms-database';

export class DexieWorkspaceStore implements WorkspaceStore {
  readonly schemaVersion = DB_SCHEMA_VERSION;
  readonly #db: FmsDatabase;
  readonly #repos: Repositories;

  constructor(db: FmsDatabase) {
    this.#db = db;
    this.#repos = {
      workspace: {
        get: () => db.workspace.toCollection().first(),
        put: async (workspace) => {
          await db.workspace.put(workspace);
        },
      },
      audit: {
        append: async (event) => {
          const last = await db.auditEvents.orderBy('sequence').last();
          const stored = { ...event, sequence: (last?.sequence ?? 0) + 1 };
          await db.auditEvents.add(stored);
          return stored;
        },
        list: ({ offset, limit }) =>
          db.auditEvents.orderBy('sequence').reverse().offset(offset).limit(limit).toArray(),
        count: () => db.auditEvents.count(),
      },
    };
  }

  #tables() {
    return TABLE_NAMES.map((name) => this.#db.table(name));
  }

  read<T>(work: (repos: Repositories) => Promise<T>): Promise<T> {
    return this.#db.transaction('r', this.#tables(), () => work(this.#repos));
  }

  write<T>(work: (repos: Repositories) => Promise<T>): Promise<T> {
    return this.#db.transaction('rw', this.#tables(), () => work(this.#repos));
  }

  snapshot(): Promise<WorkspaceSnapshot> {
    return this.#db.transaction('r', this.#tables(), async () => ({
      schemaVersion: this.schemaVersion,
      tables: {
        workspace: await this.#db.workspace.toArray(),
        auditEvents: await this.#db.auditEvents.orderBy('sequence').toArray(),
      },
    }));
  }

  restore(snapshot: WorkspaceSnapshot): Promise<void> {
    return this.#db.transaction('rw', this.#tables(), async () => {
      if (!(await this.#isEmptyInTransaction())) {
        throw new WorkspaceNotEmptyError();
      }
      // bulkAdd (not bulkPut) so a duplicate key aborts the whole transaction.
      await this.#db.workspace.bulkAdd(snapshot.tables.workspace);
      await this.#db.auditEvents.bulkAdd(snapshot.tables.auditEvents);
    });
  }

  isEmpty(): Promise<boolean> {
    return this.#db.transaction('r', this.#tables(), () => this.#isEmptyInTransaction());
  }

  erase(): Promise<void> {
    return this.#db.transaction('rw', this.#tables(), async () => {
      for (const table of this.#tables()) {
        await table.clear();
      }
    });
  }

  async #isEmptyInTransaction(): Promise<boolean> {
    for (const table of this.#tables()) {
      if ((await table.count()) > 0) {
        return false;
      }
    }
    return true;
  }
}
