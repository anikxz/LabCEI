/**
 * Call this once at app startup (e.g. in _layout.tsx useEffect)
 * to clean up any service workers registered from other origins
 * that can block your PWA install prompt.
 */
export async function unregisterForeignServiceWorkers() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  const registrations = await navigator.serviceWorker.getRegistrations();
  const ownOrigin = window.location.origin;

  for (const reg of registrations) {
    const swUrl = reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL || '';
    if (swUrl && !swUrl.startsWith(ownOrigin)) {
      console.warn('[PWA] Unregistering foreign SW:', swUrl);
      await reg.unregister();
    }
  }
}
