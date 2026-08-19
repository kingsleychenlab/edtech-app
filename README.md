# Revizely.ai

An all-in-one AI study workspace for UK secondary-school revision: notes, flashcards,
past papers, quizzes, progress tracking, focus timers and a set of AI-assisted tools.

The project is deliberately dependency-free — no build step, no npm packages, no
framework. It is a static front end plus a small Node backend built on `node:http`,
and it runs either as a long-lived Node server or as a Vercel serverless function.

---

## Contents

- [How it fits together](#how-it-fits-together)
- [Prerequisites](#prerequisites)
- [Local setup](#local-setup)
- [Environment variables](#environment-variables)
- [Deploying to Vercel](#deploying-to-vercel)
- [Important: data is stored in memory](#important-data-is-stored-in-memory)
- [API reference](#api-reference)
- [Troubleshooting](#troubleshooting)

---

## How it fits together

```
.
├── README.md
├── LICENSE
├── package.json          Scripts and the Node version requirement (no dependencies)
├── vercel.json           Vercel output directory, function limits and cache headers
├── .env.example          Template for your local .env
│
├── frontend/             Everything served to the browser — this is the web root
│   ├── index.html        Public marketing site (served at /)
│   ├── global.css        Shared styles for the public site
│   ├── assets/           Logos
│   ├── public/           Sign-up and log-in pages
│   │   ├── login.html
│   │   ├── signup.html
│   │   ├── auth.js       Posts to /api/auth/*, redirects into the workspace
│   │   └── auth.css
│   └── app/              The authenticated workspace (single page, hash-routed)
│       ├── index.html
│       ├── app.js        All workspace views; talks to /api/* with session cookies
│       └── app.css
│
├── backend/              All server code — never served to the browser
│   ├── index.js          Local HTTP server (static files + API)
│   ├── vercel.js         Serverless handler for Vercel
│   ├── api.js            Route table for every /api/* endpoint
│   ├── auth.js           Password hashing (scrypt), session cookies
│   ├── store.js          In-memory users, sessions, workspaces, classes
│   ├── ai.js             Groq chat-completions calls for the AI features
│   ├── premium.js        Plan and feature catalogue
│   ├── http.js           JSON helpers and static file serving
│   └── config.js         Loads .env into process.env
│
└── api/
    └── [...path].js      One-line re-export of backend/vercel.js (see note below)
```

**Two entry points, one backend.** `backend/index.js` is used locally: it serves
`frontend/` as static files *and* handles `/api/*`. On Vercel, `frontend/` is served
by Vercel's CDN and `backend/vercel.js` handles `/api/*`. Both call the same
`handleApi()` function in `backend/api.js`, so there is no duplicated routing logic.

**Why `api/` sits at the root.** Vercel only discovers serverless functions in a
top-level `/api` directory — the location is not configurable. So `api/[...path].js`
is a single-line re-export of `backend/vercel.js`, which keeps the actual
implementation in `backend/` with the rest of the server code.

**The frontend is the web root.** `vercel.json` sets `"outputDirectory": "frontend"`,
and the local server serves from the same folder. Every URL is therefore relative to
`frontend/` — `frontend/app/index.html` is served at `/app/index.html`. A useful
side effect is that `backend/` is outside the served tree entirely, so server source
can never be fetched as a static file.

The front end is plain, module-free JavaScript loaded with `<script>` tags. Tailwind,
Lucide icons and three.js are pulled from CDNs at runtime, so the pages need internet
access to render fully.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| **Node.js 20 or newer** | Required for the built-in global `fetch()` used by the AI layer. Check with `node --version`. |
| A browser | No build tooling, bundler or `npm install` is needed — there are zero dependencies. |
| *(optional)* A Groq API key | Enables the AI features. Free tier available. |
| *(optional)* Stripe Payment Links | Enables the pricing buttons. |

---

## Local setup

```sh
# 1. Clone and enter the project
git clone https://github.com/kingsleychenlab/edtech-app.git
cd edtech-app

# 2. Create your local environment file
cp .env.example .env

# 3. Start the server (no install step — there are no dependencies)
npm start
```

Open **http://localhost:4173**.

To change the port, set `PORT` in `.env` or inline: `PORT=3000 npm start`.

### What works immediately, with no configuration

- The public marketing site
- Email sign-up and sign-in (passwords are hashed locally with scrypt)
- The whole workspace: notes, flashcards, past papers, quizzes, planner, homework
  tracker, focus mode, progress and heat map, mind maps, predicted grades,
  leaderboard, competition classes, work experience and support tickets

### What needs configuration

- **AI features** need `GROQ_API_KEY`. Without it they return `503` with a clear
  message; the rest of the app is unaffected.
- **Pricing buttons** need the `STRIPE_CHECKOUT_*_URL` values. Without them the
  checkout call returns `503`.
- **Google / Apple / Microsoft sign-in** are intentionally *not* simulated. Those
  buttons return `501` until real OAuth credentials and a callback flow are added.

### Checking your changes

```sh
npm run check    # syntax-checks every server, app and API file
```

---

## Environment variables

Set these in `.env` locally, and in **Project → Settings → Environment Variables**
on Vercel. All of them are optional — the app boots without any of them.

| Variable | Required | Default | What it does |
|---|---|---|---|
| `PORT` | No | `4173` | Port for the local server. Ignored on Vercel. |
| `GROQ_API_KEY` | For AI features | — | Groq API key. Create one at [console.groq.com/keys](https://console.groq.com/keys). |
| `GROQ_MODEL` | No | `llama-3.3-70b-versatile` | Which Groq model the AI tools call. |
| `STRIPE_CHECKOUT_WEEKLY_URL` | For payments | — | Stripe Payment Link for the £0.99/week plan. |
| `STRIPE_CHECKOUT_MONTHLY_URL` | For payments | — | Stripe Payment Link for the £3.99/month plan. |
| `STRIPE_CHECKOUT_YEARLY_URL` | For payments | — | Stripe Payment Link for the £25/year plan. |

> `.env` is listed in `.gitignore` and `.vercelignore`, so it is never committed or
> uploaded. Keys reach production only through the Vercel dashboard or
> `vercel env add`.

### Getting a Groq key

1. Sign up at [console.groq.com](https://console.groq.com).
2. Go to **API Keys → Create API Key** and copy the value.
3. Paste it into `.env` as `GROQ_API_KEY=gsk_...` and restart the server.

### Getting Stripe Payment Links

1. In the Stripe dashboard, create three products matching the plans in
   [backend/premium.js](backend/premium.js): weekly £0.99, monthly £3.99, yearly £25.
2. For each one, create a **Payment Link** and copy its URL.
3. Paste the three URLs into the matching `STRIPE_CHECKOUT_*_URL` variables.

The backend only redirects to these links — it does not yet process webhooks, so a
completed payment does not automatically upgrade the account.

---

## Deploying to Vercel

The repository is Vercel-ready: `vercel.json` and `api/[...path].js` are committed,
and there is no build step to configure. Leave the project's **Root Directory**
setting as the repository root — `vercel.json` already points the static output at
`frontend/`.

### Option A — deploy from the dashboard

1. Push the repository to GitHub, GitLab or Bitbucket.
2. Go to [vercel.com/new](https://vercel.com/new) and import it.
3. Leave the framework preset as **Other**, and leave *Build Command*, *Output
   Directory* and *Install Command* empty — this project has no build step and
   `vercel.json` already sets the output directory to `frontend/`.
4. Under **Environment Variables**, add any of the keys from the table above that
   you want enabled (typically `GROQ_API_KEY`).
5. Click **Deploy**.

### Option B — deploy from the CLI

```sh
npm i -g vercel

vercel login
vercel link            # connect this folder to a Vercel project

# Add secrets to the Production environment (repeat per variable)
vercel env add GROQ_API_KEY production

vercel                 # deploy a preview build
vercel --prod          # promote to production
```

To pull the deployed environment variables back down for local use:

```sh
vercel env pull .env
```

### What `vercel.json` does

| Setting | Effect |
|---|---|
| `outputDirectory` | Serves `frontend/` as the site root, so only browser assets are published. |
| `functions."api/[...path].js".maxDuration` | Raises the function timeout to 60s, since AI generation can exceed the 10s default. |
| `headers` | `no-store` on API responses, one-day caching on `/assets/*`. |

Everything inside `frontend/` is served straight from Vercel's CDN. Every request
under `/api/` goes to the single catch-all function, which runs the same routing
code as the local server.

### Testing the Vercel build locally

```sh
vercel dev
```

This runs the static files and the serverless function together on
`http://localhost:3000`, closely matching production. Note that `vercel dev` uses
the serverless entry point, so the in-memory caveat below applies there too.

---

## Important: data is stored in memory

Users, sessions, workspaces and competition classes live in plain `Map` objects in
[backend/store.js](backend/store.js). **Nothing is written to disk or to a database.**

| Environment | Consequence |
|---|---|
| **Local (`npm start`)** | One long-lived process, so everything persists until you stop the server. Restarting wipes all accounts and workspace data. |
| **Vercel** | Serverless functions are created, frozen and destroyed on demand, and several instances can run at once. An account created by one invocation may be invisible to the next, so sign-up and sign-in are **not reliable in production**, and any saved work can disappear at any time. |

A Vercel deployment is therefore great for demoing the public site and the UI, but
it is not production-ready for real student accounts.

### Making it durable

To run this for real, replace the `Map`s in `backend/store.js` with a persistent
store, keeping the same exported shape so the rest of the code is unchanged:

- **Vercel Postgres / Neon / Supabase** for users, workspaces and classes.
- **Vercel KV or Upstash Redis** for the session token → user id lookup in
  [backend/auth.js](backend/auth.js).

Because every read and write already goes through `backend/store.js` and `backend/auth.js`, this is
a contained change. Alternatively, deploy `backend/index.js` unchanged to a
persistent host (Railway, Render, Fly.io, a VPS) where a single process stays alive
— though data would still reset on every restart until a real database is added.

---

## API reference

All endpoints return JSON. Authenticated routes require the `revizely_session`
cookie set at sign-up or log-in and reject unauthenticated callers with `401`.

### Public

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/premium/catalogue` | Plans, feature list and currency. |
| `POST` | `/api/auth/signup` | `{ name, email, password }` — password must be 8+ characters. |
| `POST` | `/api/auth/login` | `{ email, password }`. |
| `POST` | `/api/auth/logout` | Clears the session. |
| `POST` | `/api/auth/provider` | Social sign-in placeholder — always `501`. |
| `GET` | `/api/session` | The signed-in user, or `401`. |

### Authenticated

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/workspace` | Full workspace document. |
| `PUT` | `/api/workspace` | `{ workspace }` — shallow-merged over the current one. |
| `DELETE` | `/api/workspace` | Resets the workspace to defaults. |
| `GET` | `/api/leaderboard` | Top 50 users by revision points. |
| `GET` | `/api/classes` | Competition classes the user belongs to. |
| `POST` | `/api/classes` | `{ action: "create", name }` or `{ action: "join", code }`. |
| `GET` | `/api/premium/status` | Current subscription state. |
| `POST` | `/api/premium/checkout` | `{ plan: "weekly" \| "monthly" \| "yearly" }` → Stripe URL. |

### AI (requires `GROQ_API_KEY`)

`POST /api/tutor` is the chat endpoint. Everything else is
`POST /api/ai/<action>`:

`homework-solver` · `note-condenser` · `examiner` · `study-plan` ·
`beyond-theory` · `grade9-resource` · `model-answer` · `predicted-paper`

Each action validates its own fields — see [backend/ai.js](backend/ai.js) for the
exact request shape. Without a key they return `503`; a rate-limited provider
returns `429`.

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `fetch is not defined` on start | Node is older than 18. Upgrade to Node 20+. |
| AI tools return "AI tools need a GROQ_API_KEY on the server." | `GROQ_API_KEY` is missing. Add it to `.env` and restart, or add it in Vercel and redeploy. |
| Changed `.env` but nothing happened | `.env` is read once at startup. Restart the server. On Vercel, environment variable changes need a redeploy. |
| Signed in, then immediately bounced back to the log-in page | The session was lost. Locally this means the server restarted; on Vercel it is the in-memory store limitation described above. |
| Pricing buttons say payments need checkout links | The `STRIPE_CHECKOUT_*_URL` variables are unset. |
| Social sign-in buttons do nothing useful | Expected — they return `501` until real OAuth credentials are wired up. |
| Page renders unstyled | Tailwind, Lucide and three.js load from CDNs; check the network connection or console. |
| `EADDRINUSE` on start | Port 4173 is taken. Use `PORT=3000 npm start`. |

---

## Licence

MIT — see [LICENSE](LICENSE).
