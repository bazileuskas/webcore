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

// Google treats searches from cloud servers like Render's as suspicious and
// answers with a robot check that often can't load through a proxy. So when a
// page inside Minimalist opens a Google search, show Minimalist's own results
// instead; Google never gets the search.
function proxiedUrl(requestUrl) {
  const url = new URL(requestUrl);
  if (!url.pathname.startsWith("/scramjet/")) return null;
  try {
    const real = new URL(decodeURIComponent(url.pathname.slice("/scramjet/".length)));
    // A search form adds its fields to the end of the proxied address.
    for (const [name, value] of url.searchParams) real.searchParams.append(name, value);
    return real;
  } catch {
    return null;
  }
}

function googleSearchQuery(url) {
  if (!url || !/^(www\.)?google\.[a-z.]+$/.test(url.hostname)) return null;
  if (url.pathname === "/search") return url.searchParams.get("q");
  if (url.pathname.startsWith("/sorry/")) {
    const next = url.searchParams.get("continue");
    try { return next ? googleSearchQuery(new URL(next)) : null; } catch { return null; }
  }
  return null;
}

// A tiny page that asks Minimalist (the page around the frame) to search. If
// nothing answers, for example because an older copy of Minimalist is still
// open, it reloads Minimalist with the search in its address instead.
function searchHandoff(query) {
  const data = JSON.stringify(query).replace(/</g, "\\u003c");
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<p style="margin-top:40vh;font:15px system-ui,sans-serif;color:#78716c;text-align:center">Searching…</p>
<script>
const query = ${data};
top.postMessage({ minimalistSearch: query }, location.origin);
setTimeout(() => { top.location.href = "/?q=" + encodeURIComponent(query); }, 1500);
</script>`,
    { headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") {
    const query = googleSearchQuery(proxiedUrl(event.request.url));
    if (query) return event.respondWith(searchHandoff(query));
  }
  event.respondWith(
    (async () => {
      await scramjet.loadConfig();
      if (scramjet.route(event)) return scramjet.fetch(event);
      return fetch(event.request);
    })()
  );
});
