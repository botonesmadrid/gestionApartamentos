// Service worker de la web app: permite instalarla y muestra una página propia sin conexión.
// No guarda datos de reservas ni huéspedes en caché: siempre se piden a la red.
const CACHE = "botones-v1";
const ESTATICOS = ["/offline.html", "/icons/icon-192.png", "/logo-botones.jpg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ESTATICOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  // Navegación: red primero; sin conexión, página offline.
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
    return;
  }
  // Recursos estáticos de la app (JS/CSS con hash, iconos): caché primero.
  const url = new URL(req.url);
  if (url.origin === self.location.origin && (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/"))) {
    e.respondWith(
      caches.match(req).then((r) => r || fetch(req).then((res) => {
        const copia = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copia));
        return res;
      })),
    );
  }
});
