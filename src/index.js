import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { server as wisp, logging } from "@mercuryworkshop/wisp-js/server";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";
import { searchVideos } from "./youtube.js";
import { searchWeb, SearchError } from "./search.js";
import { chatReady, cleanHistory, streamChat, chatErrorMessage } from "./chat.js";

const publicPath = fileURLToPath(new URL("../public/", import.meta.url));
// This package has no Node entry point that gives its folder, so find it directly.
const libcurlPath = dirname(createRequire(import.meta.url).resolve("@mercuryworkshop/libcurl-transport"));
const port = Number(process.env.PORT) || 8080;

logging.set_level(logging.WARN);

const app = express();
// Render's front door passes on each visitor's address, which the search and
// AI limits below use.
app.set("trust proxy", 1);

app.use(express.static(publicPath));
app.use("/scram/", express.static(scramjetPath));
app.use("/libcurl/", express.static(libcurlPath));
app.use("/baremux/", express.static(baremuxPath));

// Lets each visitor do something `limit` times per `windowMs`, so one person
// can't use up free searches or run up the AI bill.
function perVisitorLimit(limit, windowMs) {
  const recent = new Map();
  return (ip) => {
    const now = Date.now();
    if (recent.size > 5000) recent.clear();
    const times = (recent.get(ip) ?? []).filter((time) => now - time < windowMs);
    const allowed = times.length < limit;
    if (allowed) times.push(now);
    recent.set(ip, times);
    return allowed;
  };
}

// Browse: Minimalist's own search results.
const underSearchLimit = perVisitorLimit(30, 10 * 60 * 1000);

app.get("/api/search", async (req, res) => {
  const query = String(req.query.q ?? "").trim().slice(0, 200);
  if (!query) return res.status(400).json({ error: "Type something to search for." });
  if (!underSearchLimit(req.ip)) {
    return res.status(429).json({ error: "That's a lot of searches. Wait a few minutes and try again." });
  }
  try {
    res.json({ results: await searchWeb(query) });
  } catch (err) {
    if (err instanceof SearchError) return res.status(err.status).json({ error: err.message });
    console.warn("Web search failed:", err.message);
    res.status(502).json({ error: "Search isn't working right now. Try again in a moment." });
  }
});

// AI: a chat with Claude, streamed to the page. Every message costs money, so
// besides the per-visitor limit there's a daily limit for the whole site
// (AI_DAILY_LIMIT, 150 messages unless set on Render).
const underChatLimit = perVisitorLimit(20, 10 * 60 * 1000);
const DAILY_CHAT_LIMIT = Number(process.env.AI_DAILY_LIMIT) || 150;
let chatDay = "";
let chatsToday = 0;

function underDailyChatLimit() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== chatDay) {
    chatDay = today;
    chatsToday = 0;
  }
  if (chatsToday >= DAILY_CHAT_LIMIT) return false;
  chatsToday++;
  return true;
}

app.post("/api/chat", express.json({ limit: "200kb" }), async (req, res) => {
  if (!chatReady()) {
    return res.status(503).json({ error: "The AI isn't set up yet: a parent needs to add an ANTHROPIC_API_KEY on Render." });
  }
  const messages = cleanHistory(req.body?.messages);
  if (!messages) return res.status(400).json({ error: "That message couldn't be sent. Try a new chat." });
  if (!underChatLimit(req.ip)) {
    return res.status(429).json({ error: "That's a lot of messages. Wait a few minutes and try again." });
  }
  if (!underDailyChatLimit()) {
    return res.status(429).json({ error: "The AI has reached today's message limit. Try again tomorrow." });
  }

  // Server-sent events: one "data:" line per piece of the answer.
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache",
    "x-accel-buffering": "no",
  });
  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  // Stop asking Claude (and paying) if the person closes the page or presses stop.
  const stop = new AbortController();
  res.on("close", () => stop.abort());

  try {
    const reason = await streamChat(messages, send, stop.signal);
    if (reason === "refusal") send({ notice: "The AI can't help with that one." });
    if (reason === "max_tokens") send({ notice: "The answer was cut off because it got too long." });
    send({ done: true });
  } catch (err) {
    if (stop.signal.aborted) return;
    console.warn("AI chat failed:", err.status ?? "", err.message);
    send({ error: chatErrorMessage(err) });
  }
  res.end();
});

// Watch: video search, and thumbnails served from here so they load even
// where YouTube's image server is blocked.
app.get("/api/videos", async (req, res) => {
  const query = String(req.query.q ?? "").trim().slice(0, 100);
  if (!query) return res.status(400).json({ error: "Type something to search for." });
  try {
    res.json({ videos: await searchVideos(query) });
  } catch (err) {
    console.warn("Video search failed:", err.message);
    res.status(502).json({ error: "Couldn't reach YouTube. Try again in a moment." });
  }
});

app.get("/api/thumb/:id", (req, res) => {
  if (!/^[\w-]{11}$/.test(req.params.id)) return res.status(400).end();
  return sendImage(res, `https://i.ytimg.com/vi/${req.params.id}/mqdefault.jpg`);
});

// Apps: site icons, served from here for the same reason.
app.get("/api/icon/:domain", (req, res) => {
  const { domain } = req.params;
  if (domain.length > 100 || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(domain)) return res.status(400).end();
  return sendImage(res, `https://www.google.com/s2/favicons?domain=${domain}&sz=64`);
});

async function sendImage(res, url) {
  const upstream = await fetch(url, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  const type = upstream?.headers.get("content-type") ?? "";
  if (!upstream?.ok || !type.startsWith("image/")) return res.status(404).end();
  res.set("Content-Type", type);
  res.set("Cache-Control", "public, max-age=86400");
  res.send(Buffer.from(await upstream.arrayBuffer()));
}

app.use((req, res) => {
  res.status(404).sendFile(join(publicPath, "404.html"));
});

const server = createServer(app);

// Proxied traffic goes through a Wisp websocket at /wisp/.
server.on("upgrade", (req, socket, head) => {
  if (req.url.endsWith("/wisp/")) {
    wisp.routeRequest(req, socket, head);
  } else {
    socket.end();
  }
});

server.listen(port, () => {
  console.log(`Minimalist is running at http://localhost:${port}`);
});

function shutdown() {
  console.log("Shutting down...");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
