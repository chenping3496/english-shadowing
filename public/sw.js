// Shadowing Booth 离线 Service Worker（应用壳缓存）
const CACHE = "booth-v1";

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) => c.add("/").catch(() => {})),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;

  // 导航：网络优先，失败回退到缓存壳
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put("/", copy));
          return r;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }

  // 静态资源：stale-while-revalidate
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const network = fetch(e.request)
        .then((r) => {
          if (r && r.status === 200) {
            const copy = r.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return r;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
