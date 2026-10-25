import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { queryKeys } from './queries';

// ---- Connectivity -------------------------------------------------------------------------

function subscribeOnline(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/** Informational only: no feature depends on being online. */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

// ---- Persistent storage -------------------------------------------------------------------

export interface StorageStatus {
  persistence: 'unsupported' | 'persistent' | 'best-effort';
  usageBytes: number | null;
  quotaBytes: number | null;
}

async function readStorageStatus(): Promise<StorageStatus> {
  const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;
  if (!storage?.persisted) {
    return { persistence: 'unsupported', usageBytes: null, quotaBytes: null };
  }
  const [persisted, estimate] = await Promise.all([
    storage.persisted(),
    storage.estimate ? storage.estimate() : Promise.resolve<StorageEstimate>({}),
  ]);
  return {
    persistence: persisted ? 'persistent' : 'best-effort',
    usageBytes: estimate.usage ?? null,
    quotaBytes: estimate.quota ?? null,
  };
}

export function useStorageStatus() {
  return useQuery({ queryKey: queryKeys.storage, queryFn: readStorageStatus });
}

/** Asks the browser not to evict this app's data. Browsers may decline silently. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export function useRequestPersistentStorage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: requestPersistentStorage,
    onSettled: () => client.invalidateQueries({ queryKey: queryKeys.storage }),
  });
}

// ---- Service worker / offline install -----------------------------------------------------

export interface PwaStatus {
  mode: 'unsupported' | 'development' | 'installing' | 'ready';
  updateAvailable: boolean;
  applyUpdate: (() => void) | null;
}

let pwaStatus: PwaStatus = { mode: 'installing', updateAvailable: false, applyUpdate: null };
const pwaListeners = new Set<() => void>();

export function setPwaStatus(patch: Partial<PwaStatus>): void {
  pwaStatus = { ...pwaStatus, ...patch };
  pwaListeners.forEach((listener) => listener());
}

function subscribePwa(listener: () => void) {
  pwaListeners.add(listener);
  return () => pwaListeners.delete(listener);
}

export function usePwaStatus(): PwaStatus {
  return useSyncExternalStore(
    subscribePwa,
    () => pwaStatus,
    () => pwaStatus,
  );
}
