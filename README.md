# minimalist.

A clean, simple web proxy. Type a website or a search, and it loads inside
Minimalist through your own server.

The **•••** button in the bottom-left corner opens the menu:

- **Browse**: the browser itself, with Minimalist's own search results page.
  Typing a site's name (like `google` or `cool math games`) goes straight to
  that site.
- **Games**: 130+ free web games, searchable and sorted by category.
- **Watch**: search and watch YouTube videos without going to youtube.com.
- **AI**: a chat with Claude, set up as a friendly schoolwork helper.
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

## Set up search

Search results come from [Tavily](https://tavily.com), whose free plan gives
1,000 searches a month with no credit card. Each visitor can do 30 searches
every 10 minutes, so one person can't use them all up.

1. Make a free account at https://app.tavily.com and copy your API key
   (it starts with `tvly-`).
2. On Render, open the service, go to **Environment**, and add a variable
   named `TAVILY_API_KEY` with your key as the value. Save, and Render restarts
   the site.

To use search when running it on your computer, set the variable before
starting: `$env:TAVILY_API_KEY = "tvly-..."` in PowerShell, then `npm start`.
Never put the key in the code: anyone who can see the code could use it.

## Set up the AI (for a parent)

The AI section talks to [Claude](https://claude.com) through Anthropic's API.
Anthropic accounts are for adults and are paid per use: with the model
Minimalist uses (Claude Opus 5.5), a typical message costs about 1 to 2 cents.

1. Make an account at https://platform.claude.com, add credit, and create an
   API key.
2. In the Console's limits settings, set a monthly spend limit you're
   comfortable with.
3. On Render, open the service, go to **Environment**, and add a variable
   named `ANTHROPIC_API_KEY` with the key as the value. Save.

Minimalist also limits the AI itself: 20 messages per person every 10 minutes,
answers of at most about 3,000 words, and 150 messages a day for the whole
site. Change the daily limit by adding an `AI_DAILY_LIMIT` variable on Render.
To make it cheaper, change `MODEL` in `src/chat.js` to `claude-haiku-5-5`
(far cheaper per message, but less smart).

## Change things

| What | Where |
| --- | --- |
| Games and apps | `public/catalog.js`: copy a line and change it |
| Quick links on the home page | `public/index.html` (the `.links` buttons) |
| Search | `src/search.js` (server) and the "Search results" part of `public/app.js` |
| AI | `src/chat.js` (model, limits, instructions) and the "AI" part of `public/app.js` |
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
