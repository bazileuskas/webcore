/*global $scramjetLoadWorker*/
importScripts("/scram/scramjet.all.js");

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();

// When a script or stylesheet sets a cookie, Scramjet waits for the page to
// confirm it. But a page only reads those messages once it has finished
// loading, so a script the page is waiting on could wait forever. Wait
// briefly, then carry on; the cookie is saved either way.
const dispatch = scramjet.dispatch.bind(scramjet);
scramjet.dispatch = (client, message) => {
  const reply = dispatch(client, message);
  if (message.scramjet$type !== "cookie") return reply;
  return Promise.race([reply, new Promise((resolve) => setTimeout(resolve, 500))]);
};

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
