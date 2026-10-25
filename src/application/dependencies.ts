import type { WorkspaceStore } from '@/repositories';

/** Everything a use case needs from the outside world, injected so tests stay deterministic. */
export interface ServiceDependencies {
  store: WorkspaceStore;
  newId: () => string;
  now: () => Date;
  actor: string;
}
