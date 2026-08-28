# Revizely.ai

An all-in-one AI study workspace for UK secondary-school revision. The workspace is
organised into three areas — **Workspace** (notes, flashcards, past papers, resources,
homework), **Study** (quizzes, planner, AI tutor, focus mode, progress, friends,
challenges, leaderboard) and **Career** (extracurriculars, work experience, CV builder)
— with a streak and XP system, dark mode and a guided first-run setup.

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
│       ├── index.html    Shell: Workspace/Study/Career nav, header, theme bootstrap
│       ├── app.js        All workspace views, onboarding, XP, streaks, theme
│       └── app.css       Tokenised palette with a full dark theme
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

### Feature tour

| Area | What it covers |
|---|---|
| **Onboarding** | A four-step first-run flow captures name, year group, qualification (GCSE / IGCSE / A-Level / SAT), subjects and a daily study target. It blocks the workspace until finished and never reappears once `profile.onboarded` is set. |
| **Streaks** | A day is "active" once the student completes anything. Consecutive days increment; a streak lapses only after two clear days, so opening the app the next morning keeps yesterday's run. |
| **XP and levels** | Every completed action awards XP (see the table below), shown as a floating `+N XP` reward and a running total beside the streak in the header and on the dashboard. Levels cost 100 XP more than the last (100, 300, 600, 1000 …). |
| **Friends and challenges** | Students swap six-character friend codes, then set shared targets measured in XP, tasks, focus sessions or quiz attempts. Standings update from live workspace data. |
| **Career** | Extracurriculars log role, category, hours and leadership status; work experience tracks applications and deadlines; the CV builder assembles a printable one-page CV and can pull activities straight in. |
| **Dark mode** | Three settings — light, dark and system. The choice is stored in `localStorage` and applied by an inline script before first paint, so there is no light flash, and it carries across the marketing site, the auth pages and the workspace. |
| **Roles and portals** | `CREATOR_EMAILS` and `ADMIN_EMAILS` grant extra dashboards in Settings. Roles are re-evaluated on every login. |

#### XP awards

| Action | XP | Action | XP |
|---|---|---|---|
| Complete a quiz | 25 | Log a past paper | 15 |
| Finish a focus session | 15 | Complete a task | 10 |
| Add an extracurricular | 10 | Add a work-experience opportunity | 10 |
| Create a note | 5 | Create a flashcard deck | 5 |
| Add a flashcard | 2 | | |

XP is awarded once per item — un-ticking and re-ticking a task does not pay twice.
The award table lives in both `backend/store.js` and `frontend/app/app.js`; keep the
two in step if you change it.

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
| `CREATOR_EMAILS` | No | — | Comma-separated emails granted the creator dashboard. |
| `ADMIN_EMAILS` | No | — | Comma-separated emails granted the admin dashboard. |
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
| `GET` | `/api/friends` | Your friends (with points, XP and streak) plus your own friend code. |
| `POST` | `/api/friends` | `{ action: "add", code }` or `{ action: "remove", id }`. |
| `GET` | `/api/challenges` | Challenges you have joined, with live standings. |
| `POST` | `/api/challenges` | `{ action: "create", title, metric, target, days }`, or `{ action: "join" \| "leave", id }`. |
| `GET` | `/api/challenges/open` | Challenges started by friends that you have not joined. |
| `GET` | `/api/premium/status` | Current subscription state. |
| `POST` | `/api/premium/checkout` | `{ plan: "weekly" \| "monthly" \| "yearly" }` → Stripe URL. |
| `POST` | `/api/premium/cancel` | Returns the account to the free plan. |
| `DELETE` | `/api/account` | Deletes the account, workspace, friend links and challenge memberships, then clears the session. |

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
| Onboarding keeps reappearing | It clears once `profile.onboarded` is saved. On Vercel the in-memory workspace can be lost between requests, so the flow restarts — see the section above. |
| Creator or admin portal missing from Settings | Add the account's email to `CREATOR_EMAILS` / `ADMIN_EMAILS`, then sign out and back in; roles are read at login. |
| Theme resets between pages | The choice lives in `localStorage` under `revizely-theme`. A private window or blocked site data makes it fall back to the system setting. |
| Streak did not increase | A streak advances once per day and only after you complete something. Two clear days ends it. |
| `EADDRINUSE` on start | Port 4173 is taken. Use `PORT=3000 npm start`. |

---

## Licence

MIT — see [LICENSE](LICENSE).
