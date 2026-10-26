"use strict";
/*global $scramjetLoadController, BareMux, GAMES, APPS*/

const SEARCH_ENGINE = "https://duckduckgo.com/?q=%s";
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
const connection = new BareMux.BareMuxConnection("/baremux/worker.js");

/* ---------- Proxy setup ---------- */

let ready = null;

async function setup() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("This browser can't run Minimalist (service workers are off). Try Chrome or Edge, and make sure the site is on https.");
  }
  // Remove the service worker left over from the old Ultraviolet version.
  for (const registration of await navigator.serviceWorker.getRegistrations()) {
    if (new URL(registration.scope).pathname.startsWith("/uv/")) await registration.unregister();
  }
  await scramjet.init();
  await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  if ((await connection.getTransport()) !== TRANSPORT) {
    await connection.setTransport(TRANSPORT, [{ websocket: WISP_URL }]);
  }
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
let toastTimer;

function showMessage(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 5000);
}

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
const browser = $("browser");
const loader = $("loader");
const homeInput = $("home-input");
const barInput = $("bar-input");
const page = scramjet.createFrame($("frame"));

// Turns whatever the user typed into a real URL: full URLs pass through,
// things that look like a domain get https://, everything else is a search.
function toUrl(input) {
  const text = input.trim();
  try {
    const url = new URL(text);
    if (url.protocol === "http:" || url.protocol === "https:") return url.href;
  } catch {}
  if (!/\s/.test(text) && /^[^/]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(text)) {
    return `https://${text}`;
  }
  return SEARCH_ENGINE.replace("%s", encodeURIComponent(text));
}

async function openSite(input) {
  if (!input.trim()) return;
  const url = toUrl(input);
  try {
    await whenReady();
  } catch (err) {
    showMessage(err.message || String(err));
    return;
  }
  showView("browse");
  home.hidden = true;
  browser.hidden = false;
  barInput.value = url;
  loader.hidden = false;
  page.go(url);
}

function showHome() {
  browser.hidden = true;
  home.hidden = false;
  page.frame.src = "about:blank";
  homeInput.value = "";
  homeInput.focus();
}

page.addEventListener("urlchange", (e) => {
  if (document.activeElement !== barInput) barInput.value = e.url;
});
page.addEventListener("navigate", () => { loader.hidden = false; });
page.frame.addEventListener("load", () => { loader.hidden = true; });

$("home-form").addEventListener("submit", (e) => {
  e.preventDefault();
  openSite(homeInput.value);
});

$("bar-form").addEventListener("submit", (e) => {
  e.preventDefault();
  barInput.blur();
  openSite(barInput.value);
});

barInput.addEventListener("focus", () => barInput.select());

for (const button of document.querySelectorAll(".links button")) {
  button.addEventListener("click", () => openSite(button.dataset.url));
}

$("btn-home").addEventListener("click", showHome);
$("btn-back").addEventListener("click", () => page.back());
$("btn-forward").addEventListener("click", () => page.forward());
$("btn-reload").addEventListener("click", () => {
  loader.hidden = false;
  page.reload();
});
$("btn-fullscreen").addEventListener("click", () => page.frame.requestFullscreen?.());

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
    browse: home.hidden ? barInput : homeInput,
    games: gamesFilter,
    watch: watchInput,
  }[currentView];
  if (!field) return;
  e.preventDefault();
  field.focus();
});

/* ---------- Start ---------- */

showView(location.hash.slice(1));
// Start the proxy in the background so the first page loads fast.
whenReady().catch(() => {});
