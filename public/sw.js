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

// TEMPORARY, for finding why Google's robot check fails on iPhone: remembers
// the reCAPTCHA requests this worker handles, shown at /debug.html.
const DEBUG_CACHE = "minimalist-debug";

async function readDebugLog() {
  const cache = await caches.open(DEBUG_CACHE);
  const saved = await cache.match("/debug-log");
  return saved ? saved.json() : [];
}

async function noteRequest(entry) {
  const log = await readDebugLog();
  log.push({ time: new Date().toISOString().slice(11, 23), ...entry });
  const cache = await caches.open(DEBUG_CACHE);
  await cache.put("/debug-log", new Response(JSON.stringify(log.slice(-80))));
}

function realUrl(requestUrl) {
  const url = new URL(requestUrl);
  try { return decodeURIComponent(url.pathname.slice("/scramjet/".length)) + url.search; } catch { return url.href; }
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const path = new URL(event.request.url).pathname;
  if (path === "/debug-log") {
    if (event.request.method === "DELETE") {
      return event.respondWith(caches.delete(DEBUG_CACHE).then(() => new Response("[]")));
    }
    return event.respondWith(readDebugLog().then((log) => new Response(JSON.stringify(log), { headers: { "content-type": "application/json" } })));
  }
  event.respondWith(
    (async () => {
      await scramjet.loadConfig();
      if (!scramjet.route(event)) return fetch(event.request);
      const target = realUrl(event.request.url);
      if (!/recaptcha|google\.com\/sorry/.test(target)) return scramjet.fetch(event);
      const started = Date.now();
      try {
        const response = await scramjet.fetch(event);
        const detail = response.status >= 400 ? (await response.clone().text()).replace(/\s+/g, " ").slice(0, 300) : "";
        event.waitUntil(noteRequest({ method: event.request.method, url: target.slice(0, 160), status: response.status, ms: Date.now() - started, detail }));
        return response;
      } catch (err) {
        event.waitUntil(noteRequest({ method: event.request.method, url: target.slice(0, 160), error: String(err?.stack || err).slice(0, 400), ms: Date.now() - started }));
        throw err;
      }
    })()
  );
});
