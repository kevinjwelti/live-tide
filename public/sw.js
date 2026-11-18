/**
 * Network first, then the last copy we successfully loaded.
 * A visit while online fills the cache. A brief outage keeps the page,
 * the pictures, and The Boom's tide file.
 */
const CACHE = "live-tide-shell-v96";

const SHELL = ["./", "./index.html", "./privacy.html", "./favicon.svg", "./scenes.html"];

function sameOrigin(url) {
  return url.origin === self.location.origin;
}

function worthCaching(url, navigate) {
  if (!sameOrigin(url)) return false;
  if (navigate) return true;
  const path = url.pathname;
  if (path.includes("/data/boom-tides.json")) return true;
  if (path.includes("/assets/") || path.includes("/shore/")) return true;
  return /\.(?:js|css|svg|png|jpe?g|webp|json|html|woff2?|mp4|webm)$/.test(path);
}

async function warm(cache) {
  await Promise.all(SHELL.map(async (path) => {
    try {
      const url = new URL(path, self.registration.scope);
      const response = await fetch(url);
      if (response.ok) await cache.put(url, response);
    } catch {
      /* the next online visit fills whatever is missing */
    }
  }));
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then(warm).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const navigate = request.mode === "navigate";
  if (!worthCaching(url, navigate)) return;
  event.respondWith(networkFirst(request, url, navigate));
});

async function networkFirst(request, url, navigate) {
  const cache = await caches.open(CACHE);
  const key = url.pathname.includes("boom-tides.json") ? `${url.origin}${url.pathname}` : request;
  try {
    const fresh = await fetch(request);
    if (fresh.ok) await cache.put(key, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(key)
      || await cache.match(request)
      || (navigate ? await cache.match(new URL("./", self.registration.scope)) : undefined);
    if (cached) return cached;
    return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
  }
}
