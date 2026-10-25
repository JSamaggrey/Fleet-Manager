import {
  TABLE_NAMES,
  WorkspaceNotEmptyError,
  type Repositories,
  type WorkspaceSnapshot,
  type WorkspaceStore,
  type WorkspaceTables,
} from '@/repositories';

const emptyTables = (): WorkspaceTables => ({ workspace: [], auditEvents: [] });

/**
 * In-memory adapter for tests and as a reference implementation of the repository contract.
 * Writes run against a copy that replaces the state only on success, which gives atomicity.
 */
export class MemoryWorkspaceStore implements WorkspaceStore {
  readonly schemaVersion: number;
  #state: WorkspaceTables = emptyTables();
  #queue: Promise<unknown> = Promise.resolve();

  constructor(schemaVersion = 1) {
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
      assertUnique(
        tables.workspace.map((w) => w.id),
        'workspace id',
      );
      assertUnique(
        tables.auditEvents.map((e) => e.id),
        'audit event id',
      );
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
    return {
      workspace: {
        get: async () => structuredClone(tables.workspace[0]),
        put: async (workspace) => {
          assertWritable();
          tables.workspace = [structuredClone(workspace)];
        },
      },
      audit: {
        append: async (event) => {
          assertWritable();
          const last = tables.auditEvents.at(-1)?.sequence ?? 0;
          if (tables.auditEvents.some((e) => e.id === event.id)) {
            throw new Error(`Duplicate audit event id ${event.id}.`);
          }
          const stored = { ...structuredClone(event), sequence: last + 1 };
          tables.auditEvents.push(stored);
          return structuredClone(stored);
        },
        list: async ({ offset, limit }) =>
          structuredClone([...tables.auditEvents].reverse().slice(offset, offset + limit)),
        count: async () => tables.auditEvents.length,
      },
    };
  }
}

function assertUnique(values: readonly unknown[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`Duplicate ${label} in snapshot.`);
  }
}
