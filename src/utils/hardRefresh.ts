/**
 * "Hard refresh" for the installed PWA: drops this app's service worker and
 * offline caches, then reloads from the network so the newest deployed build
 * is used. Ledger data, sign-in and backups in localStorage are NOT touched.
 *
 * GitHub Pages serves every project of an account from one origin, so only
 * caches and service workers belonging to Rare Mint are removed.
 */
const APP_CACHE_PREFIX = 'raremint-';
const API_RESPONSE_CACHE_PREFIX = 'rm_cache_v1:';
export const REFRESH_QUERY_PARAM = '_refresh';
const STEP_TIMEOUT_MS = 4000;

function withTimeout<T>(promise: Promise<T>): Promise<T | undefined> {
  return Promise.race([
    promise,
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), STEP_TIMEOUT_MS)),
  ]);
}

function appScope(): string {
  return new URL('./', window.location.href).href;
}

async function removeServiceWorkers(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const scope = appScope();
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    registrations.filter((r) => r.scope === scope).map((r) => r.unregister())
  );
}

async function removeOfflineCaches(): Promise<void> {
  if (!('caches' in window)) return;
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => k.startsWith(APP_CACHE_PREFIX)).map((k) => caches.delete(k)));
}

function removeApiResponseCache(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(API_RESPONSE_CACHE_PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // Storage may be unavailable (private mode); nothing to clear.
  }
}

export async function hardRefresh(): Promise<void> {
  try {
    await withTimeout(removeServiceWorkers());
    await withTimeout(removeOfflineCaches());
    removeApiResponseCache();
  } catch {
    // Reload anyway; a plain network reload still fetches the latest page.
  }
  // A unique query string bypasses any HTTP-cached copy of index.html.
  const url = new URL(window.location.href);
  url.searchParams.set(REFRESH_QUERY_PARAM, Date.now().toString(36));
  window.location.replace(url.toString());
}

/** Removes the cache-busting parameter from the address bar after reload. */
export function stripRefreshParam(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(REFRESH_QUERY_PARAM)) return;
  url.searchParams.delete(REFRESH_QUERY_PARAM);
  window.history.replaceState(window.history.state, '', url.toString());
}

/** Build timestamp injected by Vite, shown so users can confirm they're up to date. */
export function getBuildLabel(): string {
  const built = new Date(__APP_BUILD_TIME__);
  if (Number.isNaN(built.getTime())) return 'dev';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(built);
}
