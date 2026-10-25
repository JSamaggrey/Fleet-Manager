import { diffFields, type AuditChange, type AuditEvent } from '@/domain/audit';
import {
  DEMO_WORKSPACE_NAME,
  newWorkspace,
  workspaceNameSchema,
  workspaceSettingsSchema,
  type Workspace,
  type WorkspaceKind,
  type WorkspaceSettings,
} from '@/domain/workspace';
import type { NewAuditEvent, PageRequest, Repositories } from '@/repositories';
import type { ServiceDependencies } from './dependencies';
import { ConfirmationMismatchError, NoWorkspaceError, WorkspaceAlreadyExistsError } from './errors';

export interface WorkspaceUpdate {
  name: string;
  settings: WorkspaceSettings;
}

export interface AuditPage {
  items: AuditEvent[];
  total: number;
}

export function createWorkspaceService(deps: ServiceDependencies) {
  const { store, newId, now, actor } = deps;

  function auditEvent(
    workspace: Workspace,
    at: Date,
    action: string,
    summary: string,
    changes: AuditChange[] = [],
  ): NewAuditEvent {
    return {
      id: newId(),
      workspaceId: workspace.id,
      occurredAt: at.toISOString(),
      actor,
      action,
      entityType: 'workspace',
      entityId: workspace.id,
      summary,
      changes,
    };
  }

  async function requireWorkspace(repos: Repositories): Promise<Workspace> {
    const workspace = await repos.workspace.get();
    if (!workspace) throw new NoWorkspaceError();
    return workspace;
  }

  async function create(name: string, kind: WorkspaceKind): Promise<Workspace> {
    const at = now();
    const workspace = newWorkspace({ id: newId(), name, kind, now: at });
    return store.write(async (repos) => {
      if (await repos.workspace.get()) throw new WorkspaceAlreadyExistsError();
      await repos.workspace.put(workspace);
      await repos.audit.append(
        auditEvent(
          workspace,
          at,
          'workspace.created',
          kind === 'demo' ? 'Demo workspace created' : 'Workspace created',
        ),
      );
      return workspace;
    });
  }

  return {
    async getWorkspace(): Promise<Workspace | null> {
      return (await store.read((repos) => repos.workspace.get())) ?? null;
    },

    createWorkspace(name: string): Promise<Workspace> {
      return create(name, 'business');
    },

    /** Demo data grows as features land; for now it is a clearly labelled demo workspace. */
    createDemoWorkspace(): Promise<Workspace> {
      return create(DEMO_WORKSPACE_NAME, 'demo');
    },

    async updateWorkspace(update: WorkspaceUpdate): Promise<Workspace> {
      const name = workspaceNameSchema.parse(update.name);
      const settings = workspaceSettingsSchema.parse(update.settings);
      const at = now();
      return store.write(async (repos) => {
        const current = await requireWorkspace(repos);
        const next: Workspace = { ...current, name, settings };
        const changes = diffFields(current, next, ['name', 'settings']);
        if (changes.length === 0) return current;
        const saved = { ...next, updatedAt: at.toISOString() };
        await repos.workspace.put(saved);
        await repos.audit.append(
          auditEvent(saved, at, 'workspace.updated', 'Workspace settings updated', changes),
        );
        return saved;
      });
    },

    async recordBackupCreated(fileName: string, createdAt: Date): Promise<Workspace> {
      return store.write(async (repos) => {
        const current = await requireWorkspace(repos);
        const saved: Workspace = { ...current, lastBackupAt: createdAt.toISOString() };
        await repos.workspace.put(saved);
        await repos.audit.append(
          auditEvent(saved, createdAt, 'backup.created', `Full backup file created: ${fileName}`),
        );
        return saved;
      });
    },

    async listAuditEvents(page: PageRequest): Promise<AuditPage> {
      return store.read(async (repos) => ({
        items: await repos.audit.list(page),
        total: await repos.audit.count(),
      }));
    },

    /** Permanently deletes this device's workspace. Requires the exact workspace name. */
    async eraseWorkspace(confirmationName: string): Promise<void> {
      const workspace = await store.read(requireWorkspace);
      if (confirmationName.trim() !== workspace.name) throw new ConfirmationMismatchError();
      await store.erase();
    },
  };
}

export type WorkspaceService = ReturnType<typeof createWorkspaceService>;
