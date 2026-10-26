# minimalist.

A clean, simple web proxy. Type a website or a search, and it loads inside
Minimalist through your own server.

The **•••** button in the bottom-left corner opens the menu:

- **Browse**: the browser itself.
- **Games**: 130+ free web games, searchable and sorted by category.
- **Watch**: search and watch YouTube videos without going to youtube.com.
- **AI**: [Duck.ai](https://duck.ai), DuckDuckGo's free AI chat.
- **Apps**: Discord, Spotify, Google Docs, Desmos and more.

Built on [Scramjet](https://github.com/MercuryWorkshop/scramjet) (rewrites
pages so they work inside the proxy) and
[Wisp](https://github.com/MercuryWorkshop/wisp-js) (carries the traffic over a
websocket).

## Run it on your computer

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm start
```

Then open http://localhost:8080. To use a different port, set `PORT`
(for example `PORT=3000 npm start`).

## Put it online

It only works from other devices once it's hosted somewhere with **https**
(browsers won't run the proxy's service worker without it). Any host that runs
Node.js and supports websockets works. For example, on [Render](https://render.com):

1. Push this folder to a GitHub repository.
2. On Render, create a **Web Service** from that repository.
3. Build command: `npm install`. Start command: `npm start`.

Render sets `PORT` for you and gives you an `https://…onrender.com` address.

## Change things

| What | Where |
| --- | --- |
| Games and apps | `public/catalog.js`: copy a line and change it |
| Quick links on the home page | `public/index.html` (the `.links` buttons) |
| Search engine, AI site | the top of `public/app.js` |
| Colors | the variables at the top of `public/style.css` |
| Server | `src/index.js` (video search is in `src/youtube.js`) |

## Good to know

- Most sites work, but some don't. Big sites can be slow, and sites that
  need you to sign in may block logins from a proxy.
- Watch finds videos on the server and plays them in YouTube's embedded
  player. If YouTube changes its search page, `src/youtube.js` may need
  updating.
- Hosting on a cloud server can make YouTube and some games show CAPTCHAs or
  refuse to load, because many people share those IP addresses.
- The proxy refuses to connect to `localhost` or private network addresses,
  so people using your proxy can't reach things on your own network.
