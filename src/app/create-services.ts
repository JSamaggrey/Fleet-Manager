import { createWorkspaceService } from '@/application/workspace-service';
import { createBackupService } from '@/backup/backup-service';
import { LOCAL_ACTOR } from '@/domain/audit';
import { DexieWorkspaceStore } from '@/persistence/dexie/dexie-workspace-store';
import { FmsDatabase } from '@/persistence/dexie/fms-database';
import type { WorkspaceStore } from '@/repositories';
import { downloadBackupFile } from '@/ui/backup/download';
import type { AppServices } from '@/ui/services';

export const APP_NAME = 'fms';

/** Wires use cases to a storage adapter. Swap the store here to change persistence. */
export function createServices(
  store: WorkspaceStore,
  overrides: Partial<Pick<AppServices, 'saveFile' | 'now'>> & { newId?: () => string } = {},
): AppServices {
  const now = overrides.now ?? (() => new Date());
  const newId = overrides.newId ?? (() => crypto.randomUUID());
  const deps = { store, newId, now, actor: LOCAL_ACTOR };
  return {
    workspace: createWorkspaceService(deps),
    backup: createBackupService({ ...deps, app: { name: APP_NAME, version: __APP_VERSION__ } }),
    saveFile: overrides.saveFile ?? downloadBackupFile,
    now,
    appVersion: __APP_VERSION__,
  };
}

export function createBrowserServices(): AppServices {
  return createServices(new DexieWorkspaceStore(new FmsDatabase()));
}
