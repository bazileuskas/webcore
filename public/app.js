"use strict";
/*global $scramjetLoadController, BareMux, GAMES, APPS*/

const AI_URL = "https://duck.ai";
const TRANSPORT = "/transport.mjs";
const WISP_URL = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/wisp/`;
const VIEWS = ["browse", "games", "watch", "ai", "apps"];

const $ = (id) => document.getElementById(id);

const { ScramjetController } = $scramjetLoadController();
const scramjet = new ScramjetController({
  files: {
    wasm: "/scram/scramjet.wasm.wasm",
    all: "/scram/scramjet.all.js",
    sync: "/scram/scramjet.sync.js",
  },
});
let connection = null;

/* ---------- Proxy setup ---------- */

let ready = null;

// Runs one part of the setup, naming that part if it fails, so an error on
// someone's phone says where things went wrong.
async function step(name, action) {
  try {
    return await action();
  } catch (err) {
    throw new Error(`Minimalist couldn't start (${name}): ${err?.message || err}`);
  }
}

async function setup() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("This browser has service workers turned off, so Minimalist can't run. Private browsing or strict privacy settings can do this.");
  }
  await step("cleanup", async () => {
    // Remove the service worker left over from the old Ultraviolet version.
    for (const registration of await navigator.serviceWorker.getRegistrations()) {
      if (new URL(registration.scope).pathname.startsWith("/uv/")) await registration.unregister();
    }
  });
  await step("scramjet", () => scramjet.init());
  await step("service worker", async () => {
    await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
  });
  await step("connection", async () => {
    connection ??= new BareMux.BareMuxConnection("/baremux/worker.js");
    if ((await connection.getTransport()) !== TRANSPORT) {
      await connection.setTransport(TRANSPORT, [{ websocket: WISP_URL }]);
    }
  });
}

function whenReady() {
  ready ??= setup().catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}

/* ---------- Messages ---------- */

const toast = $("toast");

let toastAction = null;

// Messages stay until tapped, so there's time to read them. Tapping can also
// do something, like reloading.
function showMessage(message, { hint = "Tap to close", onTap = null } = {}) {
  const small = document.createElement("small");
  small.textContent = hint;
  toast.replaceChildren(message, small);
  toast.hidden = false;
  toastAction = onTap;
}

toast.addEventListener("click", () => {
  toast.hidden = true;
  toastAction?.();
  toastAction = null;
});

/* ---------- Sections and menu ---------- */

const dock = $("dock");
const dockButton = $("dock-button");
let currentView = null;

function showView(view) {
  if (!VIEWS.includes(view)) view = "browse";
  currentView = view;
  for (const name of VIEWS) $(`view-${name}`).hidden = name !== view;
  for (const link of dock.querySelectorAll("a")) {
    if (link.dataset.view === view) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  history.replaceState(null, "", view === "browse" ? location.pathname : `#${view}`);
  if (view === "ai") openAi();
}

function closeDock() {
  dock.classList.remove("open");
  dockButton.setAttribute("aria-expanded", "false");
  if (dock.contains(document.activeElement)) document.activeElement.blur();
}

dockButton.addEventListener("click", () => {
  const open = dock.classList.toggle("open");
  dockButton.setAttribute("aria-expanded", String(open));
});

for (const link of dock.querySelectorAll("a")) {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    showView(link.dataset.view);
    closeDock();
  });
}

document.addEventListener("click", (e) => {
  if (!dock.contains(e.target)) closeDock();
});

/* ---------- Browse ---------- */

const home = $("home");
const results = $("results");
const browser = $("browser");
const loader = $("loader");
const homeInput = $("home-input");
const resultsInput = $("results-input");
const resultsStatus = $("results-status");
const resultsList = $("results-list");
const barInput = $("bar-input");
const page = scramjet.createFrame($("frame"));

// Which of Browse's three screens is showing: the start page, search results,
// or a website.
function showScreen(screen) {
  home.hidden = screen !== home;
  results.hidden = screen !== results;
  browser.hidden = screen !== browser;
  if (screen !== browser) page.frame.src = "about:blank";
}

// Turns what the user typed into a URL: full URLs pass through, things that
// look like a domain get https://. Anything else is a search, so it gives null.
function toUrl(input) {
  const text = input.trim();
  try {
    const url = new URL(text);
    if (url.protocol === "http:" || url.protocol === "https:") return url.href;
  } catch {}
  if (!/\s/.test(text) && /^[^/]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(text)) {
    return `https://${text}`;
  }
  return null;
}

function submit(input) {
  const text = input.trim();
  if (!text) return;
  const url = toUrl(text);
  if (url) openSite(url);
  else search(text);
}

// Set when a site is opened from the results, so Back on its first page
// returns to them.
let fromResults = false;
let firstUrl = null;

async function openSite(url, { viaResults = false } = {}) {
  try {
    await whenReady();
  } catch (err) {
    showMessage(err.message || String(err));
    return;
  }
  showView("browse");
  showScreen(browser);
  fromResults = viaResults;
  firstUrl = null;
  barInput.value = url;
  loader.hidden = false;
  page.go(url);
}

function showHome() {
  showScreen(home);
  homeInput.value = "";
  homeInput.focus();
}

page.addEventListener("urlchange", (e) => {
  firstUrl ??= e.url;
  if (document.activeElement !== barInput) barInput.value = e.url;
});
page.addEventListener("navigate", () => { loader.hidden = false; });
page.frame.addEventListener("load", () => { loader.hidden = true; });

$("home-form").addEventListener("submit", (e) => {
  e.preventDefault();
  submit(homeInput.value);
});

$("results-form").addEventListener("submit", (e) => {
  e.preventDefault();
  resultsInput.blur();
  submit(resultsInput.value);
});

$("bar-form").addEventListener("submit", (e) => {
  e.preventDefault();
  barInput.blur();
  submit(barInput.value);
});

barInput.addEventListener("focus", () => barInput.select());

for (const button of document.querySelectorAll(".links button")) {
  button.addEventListener("click", () => openSite(button.dataset.url));
}

$("results-home").addEventListener("click", showHome);
$("btn-home").addEventListener("click", showHome);
$("btn-back").addEventListener("click", () => {
  if (fromResults && barInput.value === firstUrl) showScreen(results);
  else page.back();
});
$("btn-forward").addEventListener("click", () => page.forward());
$("btn-reload").addEventListener("click", () => {
  loader.hidden = false;
  page.reload();
});
$("btn-fullscreen").addEventListener("click", () => page.frame.requestFullscreen?.());

/* ---------- Search results ---------- */

let searchCount = 0;

// Typing a site's name, like "google" or "cool math games", goes straight to
// that site instead of listing pages about it.
const compact = (text) => text.toLowerCase().replace(/[^a-z0-9]/g, "");

function knownSite(query) {
  const name = compact(query);
  return [...APPS, ...GAMES].find((item) => compact(item.name) === name)?.url ?? null;
}

// The name a homepage goes by: "google" for www.google.com, "bbc" for
// bbc.co.uk. Subdomains like docs.google.com don't count.
function siteName(hostname) {
  const labels = hostname.replace(/^www\./, "").split(".");
  if (labels.length === 2) return labels[0];
  if (labels.length === 3 && labels[1].length <= 3) return labels[0];
  return null;
}

function siteFromResults(query, list) {
  const name = compact(query);
  if (!name || query.trim().split(/\s+/).length > 3) return null;
  const matches = list.filter((result) => compact(siteName(new URL(result.url).hostname) ?? "") === name);
  const homepage = matches.find((result) => new URL(result.url).pathname.split("/").filter(Boolean).length <= 1);
  return (homepage ?? matches[0])?.url ?? null;
}

async function search(query) {
  const current = ++searchCount;
  const known = knownSite(query);
  if (known) return openSite(known);
  showView("browse");
  showScreen(results);
  resultsInput.value = query;
  resultsStatus.hidden = false;
  resultsStatus.textContent = "Searching…";
  resultsList.replaceChildren();
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const data = await res.json().catch(() => ({}));
    if (current !== searchCount) return;
    if (!res.ok) throw new Error(data.error || "Search isn't working right now.");
    resultsStatus.hidden = data.results.length > 0;
    resultsStatus.textContent = "No results.";
    resultsList.replaceChildren(...data.results.map(resultItem));
    // Open the site itself; the results stay behind it for the Back button.
    const site = siteFromResults(query, data.results);
    if (site) openSite(site, { viaResults: true });
  } catch (err) {
    if (current === searchCount) resultsStatus.textContent = err.message || "Search isn't working right now.";
  }
}

function resultItem(result) {
  const url = new URL(result.url);
  const item = document.createElement("li");
  item.className = "result";

  const link = document.createElement("button");
  link.type = "button";
  link.className = "result-link";
  link.addEventListener("click", () => openSite(result.url, { viaResults: true }));

  const site = document.createElement("span");
  site.className = "result-site";
  const icon = new Image();
  icon.src = `/api/icon/${url.hostname}`;
  icon.alt = "";
  icon.loading = "lazy";
  icon.addEventListener("error", () => icon.remove());
  let path = url.pathname;
  try { path = decodeURIComponent(path); } catch {}
  const crumbs = path.split("/").filter(Boolean);
  const label = document.createElement("span");
  label.textContent = [url.hostname.replace(/^www\./, ""), ...crumbs].join(" › ");
  site.append(icon, label);

  const title = document.createElement("span");
  title.className = "result-title";
  title.textContent = result.title;

  link.append(site, title);
  item.append(link);
  if (result.snippet) {
    const snippet = document.createElement("p");
    snippet.className = "result-snippet";
    snippet.textContent = result.snippet;
    item.append(snippet);
  }
  return item;
}

/* ---------- Tiles (Games and Apps) ---------- */

function tile({ name, url, icon, image, meta }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "tile";
  button.addEventListener("click", () => openSite(url));

  const art = document.createElement("span");
  art.className = "tile-art";
  if (image) {
    const img = new Image();
    img.src = image;
    img.alt = "";
    img.loading = "lazy";
    img.addEventListener("error", () => { art.textContent = name[0]; });
    art.append(img);
  } else {
    art.textContent = icon;
  }

  const label = document.createElement("span");
  label.className = "tile-text";
  const title = document.createElement("span");
  title.className = "tile-name";
  title.textContent = name;
  label.append(title);
  if (meta) {
    const small = document.createElement("span");
    small.className = "tile-meta";
    small.textContent = meta;
    label.append(small);
  }

  button.append(art, label);
  return button;
}

/* ---------- Games ---------- */

const gamesFilter = $("games-filter");
const gamesCats = $("games-cats");
const gamesGrid = $("games-grid");
const gamesEmpty = $("games-empty");
let gameCategory = "All";

function renderGames() {
  const query = gamesFilter.value.trim().toLowerCase();
  const list = GAMES
    .filter((game) => gameCategory === "All" || game.category === gameCategory)
    .filter((game) => game.name.toLowerCase().includes(query))
    .sort((a, b) => a.name.localeCompare(b.name));
  gamesGrid.replaceChildren(...list.map((game) => tile({ ...game, meta: game.category })));
  gamesEmpty.hidden = list.length > 0;
}

function renderCategories() {
  const counts = new Map();
  for (const game of GAMES) counts.set(game.category, (counts.get(game.category) ?? 0) + 1);
  const categories = ["All", ...[...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a))];
  gamesCats.replaceChildren(...categories.map((category) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = category;
    chip.setAttribute("aria-pressed", String(category === gameCategory));
    chip.addEventListener("click", () => {
      gameCategory = category;
      renderCategories();
      renderGames();
    });
    return chip;
  }));
}

$("games-count").textContent = `${GAMES.length} games · they open in Browse`;
gamesFilter.addEventListener("input", renderGames);
renderCategories();
renderGames();

/* ---------- Watch ---------- */

const watchInput = $("watch-input");
const watchStatus = $("watch-status");
const watchResults = $("watch-results");
const player = $("player");
const watchFrame = scramjet.createFrame($("watch-frame"));

async function searchVideos(query) {
  query = query.trim();
  if (!query) return;
  watchInput.value = query;
  watchStatus.hidden = false;
  watchStatus.textContent = "Searching…";
  watchResults.replaceChildren();
  try {
    const res = await fetch(`/api/videos?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Search failed.");
    watchStatus.hidden = data.videos.length > 0;
    watchStatus.textContent = "No videos found.";
    watchResults.replaceChildren(...data.videos.map(videoCard));
  } catch (err) {
    watchStatus.textContent = err.message || "Search failed.";
  }
}

function videoCard(video) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "video";
  button.addEventListener("click", () => play(video));

  const thumb = document.createElement("div");
  thumb.className = "video-thumb";
  const img = new Image();
  img.src = `/api/thumb/${video.id}`;
  img.alt = "";
  img.loading = "lazy";
  thumb.append(img);
  const time = document.createElement("span");
  time.className = "video-time";
  time.textContent = video.duration || "LIVE";
  thumb.append(time);

  const title = document.createElement("div");
  title.className = "video-title";
  title.textContent = video.title;

  const meta = document.createElement("div");
  meta.className = "video-meta";
  meta.textContent = [video.channel, video.views, video.published].filter(Boolean).join(" · ");

  button.append(thumb, title, meta);
  return button;
}

async function play(video) {
  try {
    await whenReady();
  } catch (err) {
    showMessage(err.message || String(err));
    return;
  }
  player.hidden = false;
  $("player-title").textContent = video.title;
  $("player-channel").textContent = video.channel;
  watchFrame.go(`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&rel=0`);
  $("view-watch").scrollTo({ top: 0, behavior: "smooth" });
}

$("watch-form").addEventListener("submit", (e) => {
  e.preventDefault();
  watchInput.blur();
  searchVideos(watchInput.value);
});

for (const chip of document.querySelectorAll("#watch-suggest .chip")) {
  chip.addEventListener("click", () => searchVideos(chip.textContent));
}

$("player-close").addEventListener("click", () => {
  player.hidden = true;
  watchFrame.frame.src = "about:blank";
});

/* ---------- AI ---------- */

const aiFrame = scramjet.createFrame($("ai-frame"));
let aiOpened = false;

async function openAi() {
  if (aiOpened) return;
  aiOpened = true;
  try {
    await whenReady();
    aiFrame.go(AI_URL);
  } catch (err) {
    aiOpened = false;
    showMessage(err.message || String(err));
  }
}

/* ---------- Apps ---------- */

$("apps-grid").replaceChildren(...APPS.map((app) => tile({ ...app, image: `/api/icon/${app.domain}` })));

/* ---------- Keyboard ---------- */

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeDock();
  if (e.key !== "/" || e.target instanceof HTMLInputElement) return;
  const field = {
    browse: !results.hidden ? resultsInput : !browser.hidden ? barInput : homeInput,
    games: gamesFilter,
    watch: watchInput,
  }[currentView];
  if (!field) return;
  e.preventDefault();
  field.focus();
});

/* ---------- Start ---------- */

// When a new version of Minimalist goes live, its service worker takes over
// this page. Offer a reload, so an open tab isn't left running old code.
if (navigator.serviceWorker?.controller) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    showMessage("Minimalist was updated.", { hint: "Tap to reload", onTap: () => location.reload() });
  });
}

// A search can arrive in the address, like /?q=volcanoes.
const startQuery = new URLSearchParams(location.search).get("q");
showView(location.hash.slice(1));
if (startQuery) submit(startQuery);
// Start the proxy in the background so the first page loads fast.
whenReady().catch(() => {});
