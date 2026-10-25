import { registerSW } from 'virtual:pwa-register';
import { setPwaStatus } from '@/ui/device-status';

/** Registers the service worker that caches the app for offline start-up. */
export function registerServiceWorker(): void {
  if (import.meta.env.DEV) {
    setPwaStatus({ mode: 'development' });
    return;
  }
  if (!('serviceWorker' in navigator)) {
    setPwaStatus({ mode: 'unsupported' });
    return;
  }
  const updateServiceWorker = registerSW({
    onOfflineReady: () => setPwaStatus({ mode: 'ready' }),
    onNeedRefresh: () =>
      setPwaStatus({ updateAvailable: true, applyUpdate: () => void updateServiceWorker(true) }),
    onRegisteredSW: (_url, registration) => {
      if (registration?.active) setPwaStatus({ mode: 'ready' });
    },
    onRegisterError: () => setPwaStatus({ mode: 'unsupported' }),
  });
}
