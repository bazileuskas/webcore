// Web search for Minimalist's own results page, using Tavily's search API
// (https://tavily.com). The key comes from the TAVILY_API_KEY environment
// variable, so it never goes into the code.

const API_URL = "https://api.tavily.com/search";
const CACHE_TIME = 10 * 60 * 1000;
const CACHE_SIZE = 300;

const cache = new Map();

export class SearchError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function searchWeb(query) {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new SearchError("Search isn't set up yet: the server needs a TAVILY_API_KEY.", 503);

  const cacheKey = query.toLowerCase();
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.time < CACHE_TIME) return hit.results;

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    // "basic" costs 1 of the 1,000 free monthly credits per search.
    body: JSON.stringify({ query, search_depth: "basic", max_results: 10, safe_search: true }),
    signal: AbortSignal.timeout(15000),
  });
  if (res.status === 401) throw new SearchError("The search key is wrong. Check TAVILY_API_KEY.", 502);
  if (res.status === 429) throw new SearchError("Too many searches right now. Try again in a minute.", 429);
  if (res.status === 432 || res.status === 433) throw new SearchError("This month's free searches are used up.", 503);
  if (!res.ok) throw new Error(`Tavily answered ${res.status}`);

  const data = await res.json();
  const results = (data.results ?? [])
    .filter((result) => /^https?:\/\//.test(result.url ?? ""))
    .map((result) => ({ title: result.title || result.url, url: result.url, snippet: tidy(result.content) }));

  if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value);
  cache.set(cacheKey, { time: Date.now(), results });
  return results;
}

// Tavily's text is pieces of the page joined with "[...]", sometimes with
// leftover Markdown. Make it one short, plain line.
function tidy(text = "") {
  const plain = text
    .replace(/\[\.\.\.\]/g, "…")
    .replace(/[#*_`>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= 260) return plain;
  return plain.slice(0, plain.lastIndexOf(" ", 260)) + "…";
}
