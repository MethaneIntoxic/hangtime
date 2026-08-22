/* Hangtime service worker: public shell assets only. */
const CACHE_PREFIX = "hangtime-public-shell-";
const LEGACY_CACHE_PREFIXES = Object.freeze(["dinner-time-public-shell-"]);
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const OFFLINE_URL = "/offline.html";
const PUBLIC_SHELL_ASSETS = Object.freeze([
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
]);
const PUBLIC_SHELL_PATHS = new Set(PUBLIC_SHELL_ASSETS);
const NEVER_CACHE_PREFIXES = Object.freeze(["/api", "/plans", "/join"]);

function hasRestrictedPath(pathname) {
  return NEVER_CACHE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function mustStayNetworkOnly(request, url) {
  return (
    request.mode === "navigate" ||
    url.search.length > 0 ||
    hasRestrictedPath(url.pathname) ||
    request.headers.has("authorization")
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PUBLIC_SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter(
              (name) =>
                (name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME) ||
                LEGACY_CACHE_PREFIXES.some((prefix) => name.startsWith(prefix)),
            )
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (mustStayNetworkOnly(request, url)) {
    if (request.mode === "navigate") {
      event.respondWith(
        fetch(request).catch(() => caches.match(OFFLINE_URL)),
      );
    }
    return;
  }

  if (PUBLIC_SHELL_PATHS.has(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request)),
    );
  }
});
