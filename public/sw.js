/* Minimal service worker for installability, not offline-first caching —
   this app is server-rendered per request (chat, generation, auth), so
   precaching routes would just serve stale HTML. Scope is deliberately
   narrow: cache-first for the static app shell assets (icons, fonts,
   built JS/CSS), network-only for everything else (pages, /api/*). This
   is what actually makes Chrome/Edge/Android offer "Install app" — a
   fetch handler is one of the installability requirements alongside the
   manifest. Bump CACHE_VERSION on any shell-asset change to bust old
   caches. */
const CACHE_VERSION = "doodleai-shell-v1";
const SHELL_ASSETS = [
  "/favicon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL_ASSETS)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!SHELL_ASSETS.includes(url.pathname)) return;

  event.respondWith(
    caches.open(CACHE_VERSION).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    }),
  );
});
