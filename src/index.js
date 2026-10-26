import { createServer } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { server as wisp, logging } from "@mercuryworkshop/wisp-js/server";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { epoxyPath } from "@mercuryworkshop/epoxy-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";
import { searchVideos } from "./youtube.js";

const publicPath = fileURLToPath(new URL("../public/", import.meta.url));
const port = Number(process.env.PORT) || 8080;

logging.set_level(logging.WARN);

const app = express();

app.use(express.static(publicPath));
app.use("/scram/", express.static(scramjetPath));
app.use("/epoxy/", express.static(epoxyPath));
app.use("/baremux/", express.static(baremuxPath));

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
