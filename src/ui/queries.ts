import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { WorkspaceUpdate } from '@/application/workspace-service';
import type { ValidatedBackup } from '@/backup/backup-service';
import type { PageRequest } from '@/repositories';
import { useServices } from './services';

/**
 * Data lives on this device, so queries must run regardless of network state ('always'), and
 * retries would only repeat a local failure.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { networkMode: 'always', retry: false },
      mutations: { networkMode: 'always', retry: false },
    },
  });
}

export const queryKeys = {
  workspace: ['workspace'] as const,
  audit: (page: PageRequest) => ['audit', page.offset, page.limit] as const,
  storage: ['storage'] as const,
};

export function useWorkspace() {
  const { workspace } = useServices();
  return useQuery({ queryKey: queryKeys.workspace, queryFn: () => workspace.getWorkspace() });
}

export function useAuditEvents(page: PageRequest) {
  const { workspace } = useServices();
  return useQuery({
    queryKey: queryKeys.audit(page),
    queryFn: () => workspace.listAuditEvents(page),
  });
}

function useRefresh() {
  const client = useQueryClient();
  return {
    /** After ordinary edits. */
    invalidate: () => client.invalidateQueries(),
    /** After the whole workspace is replaced or erased: drop every cached result. */
    reset: () => client.resetQueries(),
  };
}

export function useCreateWorkspace() {
  const { workspace } = useServices();
  const { reset } = useRefresh();
  return useMutation({
    mutationFn: (input: { kind: 'business'; name: string } | { kind: 'demo' }) =>
      input.kind === 'demo'
        ? workspace.createDemoWorkspace()
        : workspace.createWorkspace(input.name),
    onSuccess: reset,
  });
}

export function useUpdateWorkspace() {
  const { workspace } = useServices();
  const { invalidate } = useRefresh();
  return useMutation({
    mutationFn: (update: WorkspaceUpdate) => workspace.updateWorkspace(update),
    onSuccess: invalidate,
  });
}

export function useExportBackup() {
  const { workspace, backup, saveFile } = useServices();
  const { invalidate } = useRefresh();
  return useMutation({
    mutationFn: async () => {
      const file = await backup.createBackup();
      saveFile(file);
      await workspace.recordBackupCreated(file.fileName, file.exportedAt);
      return file;
    },
    onSuccess: invalidate,
  });
}

export function useInspectBackup() {
  const { backup } = useServices();
  return useMutation({ mutationFn: (file: Blob) => backup.inspectFile(file) });
}

export function useRestoreBackup() {
  const { backup } = useServices();
  const { reset } = useRefresh();
  return useMutation({
    mutationFn: (validated: ValidatedBackup) => backup.restore(validated),
    onSuccess: reset,
  });
}

export function useEraseWorkspace() {
  const { workspace } = useServices();
  const { reset } = useRefresh();
  return useMutation({
    mutationFn: (confirmationName: string) => workspace.eraseWorkspace(confirmationName),
    onSuccess: reset,
  });
}
