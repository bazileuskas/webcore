/*global $scramjetLoadWorker*/
importScripts("/scram/scramjet.all.js");

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();

// YouTube's embedded player (used by Watch) won't play unless it's told which
// site it's embedded on, so say it's on this site.
scramjet.addEventListener("request", (event) => {
  if (event.url.hostname !== "www.youtube-nocookie.com" || !event.url.pathname.startsWith("/embed/")) return;
  for (const key of Object.keys(event.requestHeaders)) {
    if (key.toLowerCase() === "referer") delete event.requestHeaders[key];
  }
  event.requestHeaders.Referer = `${self.location.origin}/`;
});

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  event.respondWith(
    (async () => {
      await scramjet.loadConfig();
      if (scramjet.route(event)) return scramjet.fetch(event);
      return fetch(event.request);
    })()
  );
});
