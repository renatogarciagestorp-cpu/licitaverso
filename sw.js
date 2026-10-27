// Licitacon — service worker mínimo: permite instalar como aplicativo e mostra uma página
// amigável quando o celular está sem internet. Não guarda o site em cache (sempre busca a versão atual).
const OFFLINE = "offline.html";
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open("licitacon-offline-v1").then((c) => c.addAll([OFFLINE, "icones/icone-192.png"])));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return;
  e.respondWith(fetch(e.request).catch(() => caches.match(OFFLINE)));
});
