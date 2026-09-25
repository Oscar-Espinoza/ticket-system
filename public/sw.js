// Service worker (B12) — installable PWA + read-only offline.
//
//   /_next/static/*        cache-first (content-hashed, immutable)
//   icons, manifest        stale-while-revalidate
//   page navigations       network-first → cached copy → /offline
//   everything else        untouched: /api/* (auth, export, polling), non-GET
//                          (server actions are POST), RSC fetches (the router
//                          falls back to a full navigation, handled above).
//
// Offline is read-only: writes need the server; queuing them is out of scope.
// Signed-in pages are cached for offline reading, so signing out (or visiting
// /login, /signup) wipes the page cache.

const VERSION = 'v1';
const STATIC_CACHE = `static-${VERSION}`;
const PAGES_CACHE = `pages-${VERSION}`;
const PAGES_MAX = 40;
const OFFLINE_URL = '/offline';
const PRECACHE = [
  OFFLINE_URL,
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon.svg',
  '/manifest.webmanifest',
];
// Visiting these (client-side navigations included) or signing out wipes pages.
const SIGNED_OUT_PATHS = ['/login', '/signup', '/api/auth/sign-out'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== PAGES_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function trimPages() {
  const cache = await caches.open(PAGES_CACHE);
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - PAGES_MAX)).map((k) => cache.delete(k)));
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(STATIC_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(event) {
  const cached = await caches.match(event.request);
  const refresh = fetch(event.request)
    .then(async (response) => {
      if (response.ok) {
        const cache = await caches.open(STATIC_CACHE);
        await cache.put(event.request, response.clone());
      }
      return response;
    })
    .catch(() => undefined);
  if (cached) {
    event.waitUntil(refresh);
    return cached;
  }
  return (await refresh) ?? Response.error();
}

async function networkFirstPage(event, url) {
  const { request } = event;
  try {
    const response = await fetch(request);
    const html = response.headers.get('content-type')?.includes('text/html');
    if (response.ok && html && !response.redirected && response.type === 'basic') {
      const copy = response.clone();
      event.waitUntil(
        caches
          .open(PAGES_CACHE)
          .then((cache) => cache.put(url.pathname + url.search, copy))
          .then(trimPages),
      );
    }
    return response;
  } catch {
    const cached =
      (await caches.match(url.pathname + url.search, { cacheName: PAGES_CACHE })) ??
      (await caches.match(url.pathname, { cacheName: PAGES_CACHE, ignoreSearch: true }));
    return cached ?? (await caches.match(OFFLINE_URL)) ?? Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (SIGNED_OUT_PATHS.includes(url.pathname)) {
    // Signed out (or about to sign in as someone else): forget cached pages.
    event.waitUntil(caches.delete(PAGES_CACHE));
    return;
  }
  if (request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;
  // RSC payloads (client-side navigation / prefetch): network only.
  if (request.headers.get('RSC') || url.searchParams.has('_rsc')) return;

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (PRECACHE.includes(url.pathname) && url.pathname !== OFFLINE_URL) {
    event.respondWith(staleWhileRevalidate(event));
    return;
  }
  if (request.mode === 'navigate') event.respondWith(networkFirstPage(event, url));
});
