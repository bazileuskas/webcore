// Searches YouTube from the server, so the browser never has to visit
// youtube.com. Reads the same data YouTube's own search page is built from.

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const CACHE_TIME = 10 * 60 * 1000;
const CACHE_SIZE = 200;

const cache = new Map();

export async function searchVideos(query) {
  const key = query.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.time < CACHE_TIME) return hit.videos;

  const url = new URL("https://www.youtube.com/results");
  url.searchParams.set("search_query", query);
  url.searchParams.set("sp", "EgIQAQ%3D%3D"); // videos only, no channels or playlists
  url.searchParams.set("hl", "en");

  const res = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      "accept-language": "en-US,en;q=0.9",
      cookie: "SOCS=CAI", // skips the EU cookie consent page
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`YouTube answered ${res.status}`);

  const html = await res.text();
  const match = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!match) throw new Error("YouTube's results page changed");

  const videos = [];
  collect(JSON.parse(match[1]), videos, new Set());

  if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value);
  cache.set(key, { time: Date.now(), videos });
  return videos;
}

function collect(node, videos, seen) {
  if (Array.isArray(node)) {
    for (const item of node) collect(item, videos, seen);
  } else if (node && typeof node === "object") {
    const video = node.videoRenderer;
    if (video?.videoId && !seen.has(video.videoId)) {
      seen.add(video.videoId);
      videos.push({
        id: video.videoId,
        title: text(video.title),
        channel: text(video.ownerText),
        duration: text(video.lengthText),
        views: text(video.shortViewCountText),
        published: text(video.publishedTimeText),
      });
      return;
    }
    for (const value of Object.values(node)) collect(value, videos, seen);
  }
}

function text(field) {
  return field?.simpleText ?? field?.runs?.map((run) => run.text).join("") ?? "";
}
