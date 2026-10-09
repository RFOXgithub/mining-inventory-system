const STATIC = "quarryflow-static-v1", SHELL = "quarryflow-shell-v1";
const pages = ["/production", "/fuel", "/inspections"];
let epoch = 0;
const preparations = new Set();
async function validLease(lease) {
  if (!lease) return false;
  return new Promise(resolve => {
    const request = indexedDB.open("quarryflow-drafts-v1", 1);
    request.onerror = () => resolve(false);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("data")) { db.close(); resolve(false); return; }
      const saved = db.transaction("data").objectStore("data").get("session");
      saved.onerror = () => { db.close(); resolve(false); };
      saved.onsuccess = () => { const value = saved.result; db.close(); resolve(!!value && value.expiresAt > Date.now() && JSON.stringify(value.session) === lease); };
    };
  });
}
self.addEventListener("install", event => { event.waitUntil(caches.open(STATIC).then(cache => cache.addAll(["/offline.html", "/manifest.webmanifest", "/draft-icon.svg"])).then(() => self.skipWaiting())); });
self.addEventListener("activate", event => { event.waitUntil((async () => { for (const key of await caches.keys()) if ((key.startsWith("quarryflow-static-") || key.startsWith("quarryflow-shell-")) && key !== STATIC && key !== SHELL) await caches.delete(key); await self.clients.claim(); })()); });
self.addEventListener("message", event => {
  if (event.data?.type === "CLEAR") {
    epoch++;
    event.waitUntil(Promise.allSettled([...preparations]).then(async () => {
      for (const key of await caches.keys()) if (key.startsWith("quarryflow-shell-")) await caches.delete(key);
      event.ports[0]?.postMessage({ cleared: true });
    }));
    return;
  }
  if (event.data?.type !== "PREPARE") return;
  const current = epoch, lease = event.data.lease;
  const work = (async () => {
    if (current !== epoch || !await validLease(lease)) return;
    const cache = await caches.open(STATIC);
    for (const value of event.data.urls ?? []) {
      if (current !== epoch) return;
      const url = new URL(value, self.location.origin);
      if (url.origin === self.location.origin && url.pathname.startsWith("/_next/static/")) try { await cache.add(url.href); } catch { /* Retry on the next online visit. */ }
    }
    if (current !== epoch || !await validLease(lease)) return;
    const shell = await caches.open(SHELL);
    for (const page of pages) { if (current !== epoch) return; try { const response = await fetch(page, { cache: "no-store" }); if (current !== epoch || !await validLease(lease)) return; if (response.ok && !response.redirected && response.headers.get("content-type")?.includes("text/html")) await shell.put(page, response); } catch { /* Existing shell remains available offline. */ } }
  })();
  preparations.add(work);
  event.waitUntil(work.finally(() => preparations.delete(work)));
});
self.addEventListener("fetch", event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_next/static/") || ["/manifest.webmanifest", "/draft-icon.svg", "/offline.html"].includes(url.pathname)) {
    event.respondWith((async () => { const cache = await caches.open(STATIC), saved = await cache.match(request, { ignoreSearch: true }); if (saved) return saved; const response = await fetch(request); if (response.ok) await cache.put(request, response.clone()); return response; })());
  } else if (request.mode === "navigate" && pages.includes(url.pathname)) {
    event.respondWith((async () => { try { return await fetch(request); } catch { return await caches.match(url.pathname, { cacheName: SHELL }) ?? await caches.match("/offline.html", { cacheName: STATIC }); } })());
  }
});
