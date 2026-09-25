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
//
// Web Push (D11): `push` shows the notification, `notificationclick` focuses or
// opens its URL. Registered as /sw.js?mode=push (dev only, when enabling push)
// it does push alone — no precache, no fetch handling, so dev bundles stay fresh.

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
const PUSH_ONLY = new URL(self.location.href).searchParams.get('mode') === 'push';
const INBOX_URL = '/dashboard/inbox';

self.addEventListener('install', (event) => {
  if (PUSH_ONLY) {
    event.waitUntil(self.skipWaiting());
    return;
  }
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
  if (PUSH_ONLY) return;
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

// ---------------------------------------------------------------------------
// Web Push — payload shape: src/lib/push.ts (PushPayload)
// ---------------------------------------------------------------------------

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : undefined };
  }
  const title = typeof payload.title === 'string' && payload.title ? payload.title : 'New notification';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof payload.body === 'string' ? payload.body : undefined,
      tag: typeof payload.tag === 'string' ? payload.tag : undefined,
      // A new update on the same issue replaces the old one but still alerts.
      renotify: typeof payload.tag === 'string',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: typeof payload.url === 'string' ? payload.url : INBOX_URL },
    }),
  );
});

/** Same-origin absolute URL for a notification, falling back to the inbox. */
function targetUrl(raw) {
  try {
    const url = new URL(raw || INBOX_URL, self.location.origin);
    if (url.origin === self.location.origin) return url.href;
  } catch {
    // fall through
  }
  return new URL(INBOX_URL, self.location.origin).href;
}

async function openNotificationUrl(href) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const same = windows.find((client) => client.url === href);
  if (same) return same.focus();
  const app = windows.find((client) => new URL(client.url).origin === self.location.origin);
  if (app && 'navigate' in app) {
    try {
      // navigate() only works on clients this worker controls.
      const navigated = await app.navigate(href);
      if (navigated) return navigated.focus();
    } catch {
      // uncontrolled tab: open a new one instead
    }
  }
  return self.clients.openWindow(href);
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(openNotificationUrl(targetUrl(event.notification.data && event.notification.data.url)));
});
