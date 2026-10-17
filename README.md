# ReachInbox Email Scheduler

A full-stack email scheduling application built with **React, TypeScript, Express, BullMQ, Redis, MySQL, Drizzle ORM, Elasticsearch and Ethereal Email**.

Signed-in users compose an email, add recipients (typed, pasted or uploaded from a CSV/TXT file), and send it now or at a future time. Every recipient becomes its own tracked email. A background worker sends them with a **minimum gap between sends** and an **hourly cap per sender**, survives restarts without losing or duplicating mail, and posts to Slack when a sender hits its limit.

> **Testing note:** the mail transport uses [Ethereal](https://ethereal.email), a fake SMTP service. Ethereal captures messages and gives a preview URL; it does **not** deliver to real inboxes.

## Table of Contents

- [Features](#features)
- [Technology Stack](#technology-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Run Locally](#run-locally)
- [Configuration Reference](#configuration-reference)
- [How Scheduling Works](#how-scheduling-works)
- [Persistence and Restart Recovery](#persistence-and-restart-recovery)
- [Rate Limiting and Concurrency](#rate-limiting-and-concurrency)
- [Google Login](#google-login)
- [Slack Notifications](#slack-notifications)
- [Search and Queue Dashboard](#search-and-queue-dashboard)
- [API Reference](#api-reference)
- [Deploy on Render](#deploy-on-render)
- [Limitations and Trade-offs](#limitations-and-trade-offs)
- [Troubleshooting](#troubleshooting)
- [Submission Checklist](#submission-checklist)

---

## Features

- **Compose:** pick a sender, add recipients as chips (type, paste, or upload a `.csv`/`.txt` file; duplicates are removed), write a subject and a rich-text body.
- **Send now or send later:** with no start time, emails take the earliest available slots; with a future start time, they are scheduled from that moment.
- **Delay between emails:** spaces recipients out from the start time.
- **Per-batch hourly limit:** overrides the server default for that batch.
- **Scheduled and Sent views:** status badges, live counts and 10-second auto-refresh.
- **Email detail:** full message and a link to its Ethereal preview once sent.
- **Search:** by recipient, subject or body, using Elasticsearch with an automatic SQL fallback.
- **Rate limiting:** per-sender hourly cap plus a minimum interval, coordinated across workers through Redis.
- **Restart recovery and idempotency:** MySQL is the source of truth; queue and database are reconciled when a worker starts, and an atomic claim prevents double sends.
- **Google OAuth login** with server-side sessions, plus a no-login `dev` mode for local work.
- **Slack alerts** when a sender reaches its hourly limit (one alert per sender per hour).
- **Queue dashboard:** Bull Board shows waiting, delayed, active, completed and failed jobs.

---

## Technology Stack

| Area | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, TanStack Query, TipTap editor |
| Backend API | Node.js, Express, TypeScript, Zod |
| Database | MySQL 8, Drizzle ORM, SQL migrations |
| Queue and delayed jobs | BullMQ |
| Redis | Queue, sessions, rate-limit state |
| Search | Elasticsearch 8 |
| Test mail transport | Nodemailer + Ethereal SMTP |
| Authentication | Google OAuth 2.0 (authorization-code flow) |
| Notifications | Slack OAuth + incoming webhooks |
| Local infrastructure | Docker Compose |

---

## Architecture

```text
React + Vite frontend
        |  HTTP (/api, /admin)
        v
Express API -----------------> MySQL            (source of truth)
        |
        +--------------------> Redis + BullMQ   (delayed jobs, sessions, rate-limit state)
        |
        +--------------------> Elasticsearch    (search index; optional)

BullMQ worker  (separate process, same code base)
        |
        +--> Redis rate limiter (Lua script)
        +--> Ethereal SMTP
        +--> Slack webhook (when a limit is hit)
```

**MySQL is the source of truth.** Redis only holds timers and counters, and Elasticsearch is only an index. If Redis or Elasticsearch is wiped, nothing is lost: the worker rebuilds jobs from MySQL on startup.

### Scheduling flow

1. The frontend calls `POST /api/emails/schedule`.
2. The API validates the input and checks the sender belongs to the signed-in user.
3. One database transaction stores the batch (subject and body, once) and one email row per recipient.
4. The API enqueues one BullMQ delayed job per email, using the email's ID as the job ID.
5. When a job is due, the worker reserves a send slot for the sender in Redis. If the slot is more than `INLINE_WAIT_MAX_MS` away, the job is put back in the delayed state instead of occupying a worker.
6. The worker atomically claims the row (`scheduled` to `sending`). If it can't, another worker already has it and it skips.
7. The worker sends through SMTP, then sets the row to `sent` (saving the Ethereal preview URL) or retries / marks it `failed`.
8. The search index is updated in the background.

---

## Project Structure

```text
.
├── docker-compose.yml        MySQL, Redis, Elasticsearch for local development
├── backend/
│   ├── drizzle/              SQL migrations
│   └── src/
│       ├── server.ts         API entry point (also mounts Bull Board)
│       ├── worker.ts         Worker entry point
│       ├── config/           Environment parsing and validation
│       ├── db/               Schema, client, migration runner
│       ├── middleware/       Auth, error handler
│       ├── queue/            BullMQ queue and Redis connection
│       ├── routes/           auth, emails, senders, slack
│       ├── services/         Scheduling, rate limiter, reconcile, mailer, search, Slack
│       ├── workers/          Email job processor
│       └── scripts/          seed:senders, load:test, search:reindex
└── frontend/
    └── src/
        ├── api/              The only place that calls fetch
        ├── components/       Layout and UI primitives
        ├── features/         auth, compose, inbox, email-detail
        ├── hooks/            React Query hooks
        └── lib/ types/ routes/ config/
```

---

## Run Locally

### Prerequisites

- Node.js and npm
- Docker Desktop (Docker Compose)
- Internet access (Ethereal test accounts are created online)
- Optional: a Google OAuth client (real login) and a Slack app with an HTTPS tunnel such as ngrok (Slack alerts)

### 1. Start the infrastructure

From the repository root:

```bash
docker compose up -d
docker compose ps
```

This starts MySQL (published on host port **3307**, to avoid clashing with a local MySQL on 3306), Redis (with append-only persistence and a volume) and Elasticsearch. Elasticsearch is optional: if it is not running, search falls back to SQL. For a minimal setup, `docker compose up -d mysql redis` is enough.

### 2. Configure and start the backend

Create `backend/.env`. This minimal file runs everything locally **without** Google login:

```env
DATABASE_URL=mysql://reachinbox:reachinbox@localhost:3307/reachinbox
REDIS_URL=redis://localhost:6379
ELASTICSEARCH_URL=http://localhost:9200
AUTH_MODE=dev
```

Every other variable has a default; see the [Configuration Reference](#configuration-reference).

```bash
cd backend
npm install
npm run db:migrate
npm run dev
```

`npm run dev` starts the API and the worker together (using `concurrently`). You should see `API listening on :4000` and `Email worker started`. To run them separately, use `npm run dev:api` and `npm run dev:worker`; you can start extra workers the same way.

### 3. Configure and start the frontend

Create `frontend/.env`:

```env
VITE_AUTH_MODE=dev
```

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. The Vite dev server proxies `/api` and `/admin` to the backend on port 4000.

### 4. Get a sender

Open **Compose** and click **+ New test sender**. This creates a fresh Ethereal inbox and stores it as a sender. Alternatively, from `backend`, run `npm run seed:senders 2` to create two (this script attaches senders to the dev user, so it needs `AUTH_MODE=dev`).

### Useful commands

| Where | Command | What it does |
|---|---|---|
| backend | `npm run build` | Compile TypeScript to `dist/` |
| backend | `npm run typecheck` | Type-check without emitting |
| backend | `npm run db:generate` | Generate a migration after editing `schema.ts` |
| backend | `npm run db:migrate` | Apply migrations |
| backend | `npm run load:test -- --count 1000 --limit 5 --wait 20` | Schedule many emails at once and show where each lands (needs `AUTH_MODE=dev`, the API and a worker) |
| backend | `npm run search:reindex` | Rebuild the search index (`-- --reset` drops it first) |
| frontend | `npm run build` | Type-check and produce a production build |
| frontend | `npm test` | Run the Vitest suite |
| frontend | `npm run typecheck` | Type-check only |

---

## Configuration Reference

### Backend (`backend/.env`)

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | **required** | MySQL connection URL |
| `REDIS_URL` | `redis://localhost:6379` | Queue, sessions, rate limiter |
| `ELASTICSEARCH_URL` | `http://localhost:9200` | Search (falls back to SQL if unreachable) |
| `ELASTICSEARCH_INDEX` | `emails` | Index name |
| `PORT` | `4000` | API port |
| `FRONTEND_URL` | `http://localhost:5173` | Allowed CORS origin and post-login redirect target |
| `AUTH_MODE` | `dev` | `dev` = no login; `google` = Google OAuth |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | - | Needed when `AUTH_MODE=google` |
| `GOOGLE_REDIRECT_URI` | `http://localhost:5173/api/auth/google/callback` | Must match the Google console exactly |
| `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` | - | Optional, for Slack alerts |
| `SLACK_REDIRECT_URI` | - | HTTPS URL ending in `/api/slack/callback` |
| `SESSION_TTL_DAYS` | `7` | Session lifetime |
| `COOKIE_SECURE` | `false` | Set `true` whenever the site is served over HTTPS |
| `WORKER_CONCURRENCY` | `5` | Jobs processed in parallel per worker process |
| `MIN_DELAY_BETWEEN_SENDS_MS` | `2000` | Minimum gap between two sends from the same sender |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | `200` | Default hourly cap per sender |
| `JOB_MAX_ATTEMPTS` | `3` | Send attempts before an email is marked `failed` |
| `STALE_SENDING_MINUTES` | `5` | Age after which a stuck `sending` row is treated as a crashed send |
| `INLINE_WAIT_MAX_MS` | `10000` | Longest a worker sleeps for a slot before deferring the job |
| `RATE_LIMIT_HORIZON_HOURS` | `336` | How far ahead hourly windows may be reserved |

Restart the API and worker after changing any of these.

### Frontend (`frontend/.env`)

| Variable | Default | Purpose |
|---|---|---|
| `VITE_AUTH_MODE` | `google` | `dev` or `google`; must match the backend's `AUTH_MODE` |
| `VITE_API_BASE` | `/api` | Base path for API calls. Keep the default when `/api` is proxied or rewritten to the backend |
| `VITE_BACKEND_URL` | `http://localhost:4000` | Target of the Vite dev-server proxy (development only) |

`VITE_` variables are baked in at build time, so rebuild and redeploy after changing them.

---

## How Scheduling Works

### Send now

With no start time, the backend uses the current time. **Send now does not bypass the rate limiter:** an email can still wait for the sender's next free slot or the next hour if the quota is used up.

### Send later

With a future start time, recipient *n* is scheduled at:

```text
recipient 1: start time
recipient 2: start time + delay
recipient 3: start time + 2 x delay
...
```

BullMQ holds each job until its time, then the worker applies the rate-limit slot before sending.

### Status lifecycle

| Status | Meaning |
|---|---|
| `scheduled` | Saved and waiting, either for its time or for a send slot |
| `sending` | Claimed by a worker that is sending it right now |
| `sent` | SMTP accepted the message; the Ethereal preview URL is saved |
| `failed` | Retries were exhausted, or a stuck `sending` row was marked failed by recovery |

---

## Persistence and Restart Recovery

- **MySQL** stores batches, per-recipient emails, status, scheduled times, attempts and results.
- **Redis** runs with append-only persistence and a volume locally, so queued jobs survive restarts as long as the volume does.
- **Reconciliation on worker start:** any `scheduled` row with no matching queue job is re-enqueued, and rows stuck in `sending` past `STALE_SENDING_MINUTES` are marked `failed`.
- **No duplicate jobs:** the job ID equals the email ID, so adding the same job twice has no effect.
- **No duplicate sends:** the `scheduled` to `sending` update is atomic, so only one worker can claim a row.
- **Crash during a send:** if the process dies after SMTP accepted a message but before the database was updated, the outcome can't be known. The design marks such rows `failed` rather than sending again, because a duplicate email is worse than a missed one.

### Try it

1. Schedule a few emails a minute or two ahead and confirm they appear under Scheduled.
2. Stop the API and worker, keeping the MySQL and Redis volumes.
3. Start them again. The emails are still there and are sent at their time.

Don't use `docker compose down -v` for this: `-v` deletes the data volumes.

---

## Rate Limiting and Concurrency

The limiter lives in `backend/src/services/rateLimiter.ts` and runs as a single atomic Redis Lua script, so any number of workers share one view of each sender.

1. **Minimum gap:** each sender has a Redis pointer for its next free slot. A new slot is never earlier than that pointer or the current time.
2. **Hourly cap:** every slot is counted against a UTC hour window. If that hour is full, the slot moves to the next hour with room, up to `RATE_LIMIT_HORIZON_HOURS` ahead. Emails are delayed, never dropped.
3. **Long waits are deferred:** if the slot is further away than `INLINE_WAIT_MAX_MS`, the job returns to the delayed state and frees the worker.
4. **Retries take a new slot,** because every SMTP attempt counts toward the limit.
5. **Concurrency:** `WORKER_CONCURRENCY` sets parallelism per process; more worker processes add capacity while the shared limiter keeps the per-sender limits correct.

### Test it

```bash
cd backend
npm run load:test -- --count 1000 --limit 5 --wait 20
```

This schedules 1000 emails against a limit of 5 per hour and reports where each ends up. Only the emails that fit in the current hour are really sent; the rest receive later slots. You can also set a low **Hourly Limit** in the Compose form and submit more recipients than that.

Don't delete Redis rate-limit keys while jobs are active: jobs carry their reserved slot times, and resetting the shared state breaks the spacing guarantee.

---

## Google Login

1. In Google Cloud Console, create an OAuth client of type **Web application**.
2. Add the authorized JavaScript origin `http://localhost:5173`.
3. Add the authorized redirect URI `http://localhost:5173/api/auth/google/callback`.
4. If the consent screen is in Testing mode, add your Google account as a test user.
5. In `backend/.env`, set `AUTH_MODE=google`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` (same value as step 3).
6. In `frontend/.env`, set `VITE_AUTH_MODE=google`.
7. Restart both and open `http://localhost:5173`. Use `localhost` consistently, not `127.0.0.1`, so the callback and cookies match.

How it works: the server sets a random `state` cookie and checks it on return, exchanges the authorization code, requires a **verified** Google email, then creates or finds the user. The browser gets an `HttpOnly`, `SameSite=Lax` session cookie; the session itself is stored in Redis, so logging out ends it immediately. Every query is scoped to the signed-in user.

> **Warning:** `AUTH_MODE=dev` turns authentication off entirely, and it is the default when the variable is missing. Never run a deployed instance without setting `AUTH_MODE=google` explicitly.

---

## Slack Notifications

When a sender reaches its hourly limit, the connected Slack channel gets a message. Alerts are sent in the background (so a slow Slack never delays email) and deduplicated to one per sender per hour.

1. Create an app at [api.slack.com/apps](https://api.slack.com/apps) and enable **Incoming Webhooks** and OAuth.
2. Slack requires HTTPS redirect URLs. Locally, start a tunnel to the backend (`ngrok http 4000`) and register `https://<your-tunnel>/api/slack/callback` as the redirect URL in the Slack app.
3. Set `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` and `SLACK_REDIRECT_URI` (the same URL) in `backend/.env`, then restart.
4. In the app, open the user menu, choose **Connect Slack**, authorize, and pick a channel.
5. Use **Send test message** to confirm, then trigger a limit (see [Rate Limiting](#rate-limiting-and-concurrency)).

If the tunnel URL changes, update both the Slack app and `SLACK_REDIRECT_URI`. The webhook URL is stored in the database as plain text.

---

## Search and Queue Dashboard

### Search

The search box matches recipient, subject and body. Elasticsearch decides which emails match and MySQL supplies the rows. If Elasticsearch is unreachable, the API logs a warning and uses a SQL substring search instead. New or changed emails are indexed in the background, so they can take a moment to appear in search. To rebuild the index: `npm run search:reindex` (add `-- --reset` to drop it first).

### Queue dashboard (Bull Board)

Open **http://localhost:4000/admin/queues** (or use **Queue dashboard** in the sidebar, which goes through the Vite proxy). It shows the `email-send` queue's waiting, delayed, active, completed and failed jobs. An email held by the rate limiter appears as **delayed**. The dashboard requires a signed-in session (any request passes in `dev` mode).

---

## API Reference

All `/api` routes except the OAuth callbacks require a session (or `AUTH_MODE=dev`).

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Checks MySQL and the queue; `200 {ok:true}` or `503` |
| GET | `/api/auth/google` | Starts Google login |
| GET | `/api/auth/google/callback` | Google redirects here |
| GET | `/api/auth/me` | Current user |
| POST | `/api/auth/logout` | Ends the session |
| POST | `/api/emails/schedule` | Schedule a batch |
| GET | `/api/emails/scheduled` | Scheduled emails (supports search and paging) |
| GET | `/api/emails/sent` | Sent and failed emails |
| GET | `/api/emails/counts` | Counts for the sidebar |
| GET | `/api/emails/:id` | One email with its body |
| GET | `/api/senders` | The user's senders |
| POST | `/api/senders/ethereal` | Create a new Ethereal test sender |
| GET | `/api/slack/status`, `/connect` | Slack connection state / start OAuth |
| GET | `/api/slack/callback` | Slack redirects here |
| POST | `/api/slack/disconnect`, `/test` | Disconnect / send a test message |
| GET | `/admin/queues` | Bull Board |

### Example: schedule a batch (local, `AUTH_MODE=dev`)

```bash
SID=$(curl -s http://localhost:4000/api/senders | jq -r '.[0].id')

curl -X POST http://localhost:4000/api/emails/schedule \
  -H 'content-type: application/json' \
  -d "{
    \"senderId\": \"$SID\",
    \"subject\": \"ReachInbox test\",
    \"body\": \"<p>Hello from the scheduler</p>\",
    \"leads\": [\"first@example.com\", \"second@example.com\"],
    \"startTime\": \"2030-01-01T10:00:00Z\",
    \"delaySeconds\": 5
  }"
```

Omit `startTime` to send as soon as slots allow. Optional `hourlyLimit` overrides the default cap for the batch. With `AUTH_MODE=google`, these requests need the session cookie.

---

## Deploy on Render

This setup uses three things: a **Web Service** for the backend (API and worker), a **Static Site** for the frontend, and external MySQL and Redis instances.

### How the pieces connect

The session cookie is `SameSite=Lax`, so the browser must treat the frontend and the API as **one origin**. Render's Static Site can do that with rewrite rules that proxy `/api` and `/admin` to the backend, mirroring what the Vite proxy does locally. The frontend then keeps its default `VITE_API_BASE=/api`, and cookies, Google login and the queue dashboard all work from the frontend's own address.

### 1. Provision data services

- **MySQL 8-compatible database.** Render does not offer managed MySQL, so use an external provider.
- **Redis** (for example Render Key Value). BullMQ requires the eviction policy to be **`noeviction`**; set it on the instance.
- **Elasticsearch is optional.** Leave `ELASTICSEARCH_URL` unreachable and search uses SQL.

### 2. Backend Web Service

| Setting | Value |
|---|---|
| Root directory | `backend` |
| Build command | `npm install --include=dev && npm run build` |
| Start command | `npx concurrently -k -n api,worker "npm run start:api" "npm run start:worker"` |
| Health check path | `/health` |

- **Do not add a `NODE_ENV` environment variable.** Render sets it itself at runtime; setting it to `production` yourself makes the build skip dev dependencies, and `tsc` then fails with "not found".
- The start command runs the API and the worker in one service, because the free plan has no separate Background Worker. The worker does not serve HTTP, so it needs no port of its own. With a paid plan, create a second service that runs `npm run start:worker` instead.

Environment variables (replace the placeholders with your URLs):

```env
DATABASE_URL=mysql://USER:PASSWORD@HOST:PORT/DBNAME
REDIS_URL=rediss://...
AUTH_MODE=google
COOKIE_SECURE=true
FRONTEND_URL=https://YOUR-FRONTEND.onrender.com
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://YOUR-FRONTEND.onrender.com/api/auth/google/callback
# Optional, for Slack alerts. Registered with Slack exactly as written:
SLACK_CLIENT_ID=...
SLACK_CLIENT_SECRET=...
SLACK_REDIRECT_URI=https://YOUR-BACKEND.onrender.com/api/slack/callback
```

Add the same `GOOGLE_REDIRECT_URI` to your Google OAuth client, and your frontend URL as an authorized JavaScript origin.

### 3. Run the database migrations

The free plan has no pre-deploy step, so run migrations once from your computer against the hosted database (PowerShell shown):

```powershell
cd backend
$env:DATABASE_URL = "mysql://USER:PASSWORD@HOST:PORT/DBNAME"
npm run db:migrate
```

Repeat this whenever you add a migration.

### 4. Frontend Static Site

| Setting | Value |
|---|---|
| Root directory | `frontend` |
| Build command | `npm install --include=dev && npm run build` |
| Publish directory | `dist` |
| Environment | `VITE_AUTH_MODE=google` |

Under **Redirects/Rewrites**, add these rules **in this order** (Render applies the first match, so the catch-all must come last):

| Source | Destination | Action |
|---|---|---|
| `/api/*` | `https://YOUR-BACKEND.onrender.com/api/*` | Rewrite |
| `/admin/*` | `https://YOUR-BACKEND.onrender.com/admin/*` | Rewrite |
| `/*` | `/index.html` | Rewrite |

The destinations must be the backend's **public** URL; Render's internal addresses don't work in rewrite rules. The last rule makes client-side routes such as `/compose` survive a page refresh.

### 5. Verify the deployment

1. Open `https://YOUR-BACKEND.onrender.com/health`. Expect `{"ok":true}`.
2. In the backend logs, confirm both `API listening` and `Email worker started`.
3. Open the frontend, sign in with Google, and check you land on the dashboard.
4. Open `https://YOUR-FRONTEND.onrender.com/admin/queues` and confirm Bull Board loads.
5. Schedule one test email and watch it move through the `email-send` queue.

### 6. SMTP is blocked on Render's free plan

Free Render Web Services block outbound traffic to SMTP ports 25, 465 and 587, so Ethereal sends time out there even when everything else is correct. Changing the HTTP port doesn't help. Your options:

- Upgrade the backend to any paid instance type, which allows ports 465 and 587 (port 25 stays blocked everywhere).
- Switch the mailer (`backend/src/services/mailer.ts`) to an email provider's HTTPS API.
- Run the worker somewhere that allows outbound SMTP.

Ethereal is a test inbox in every case. Delivering to real recipients needs a real provider with a verified sender or domain.

### Free-plan behaviour

Free Web Services spin down when idle and can restart. A sleeping worker cannot send, so emails scheduled for later can be delayed until the service wakes. The startup reconciliation re-enqueues anything that was missed. For dependable timing, use a paid instance.

---

## Limitations and Trade-offs

- **Ethereal is for testing.** Previews prove the transport captured the message, not that it reached a real inbox.
- **Fixed UTC hour windows.** Limits are per calendar hour, not a rolling 60 minutes, so a sender can use quota on both sides of an hour boundary.
- **Backlogs queue up.** A large batch from one sender delays that sender's later emails; other senders are unaffected.
- **Redis holds rate-limit state.** If Redis is wiped, counters reset even though MySQL and the queue are rebuilt.
- **Recovery runs when a worker starts.** A row left in `sending` by a crashed worker, or emails saved just before the API crashed, are repaired at the next worker start, not continuously.
- **After a crash, SMTP outcome can be unknown.** The design favors never duplicating an email over guaranteeing a retry.
- **At-most-once sending per row.** A worker that loses its claim mid-send does not retry that row automatically.
- **Search is eventually consistent.** Indexing is asynchronous.
- **SMTP passwords and Slack webhooks are stored as plain text** in MySQL. Fine for Ethereal test senders; encrypt them before using real credentials.
- **No rate limiting or security headers on the API itself,** and sessions do not slide: they expire `SESSION_TTL_DAYS` after login.
- **Backend tests:** the backend is covered by type-checking and the load test; the automated unit and component tests are in the frontend.

---

## Troubleshooting

**An email stays in Scheduled**
1. Check whether a future start time was chosen.
2. Open Bull Board: is the job waiting, delayed, active, completed or failed?
3. Look at the worker logs for rate-limit deferrals or SMTP errors.
4. Check the sender's hourly limit and how many emails are already queued. Changing the limit in `.env` does not undo slots already reserved in Redis or on jobs.

**An email stays in Sending, or fails with an SMTP timeout**
- Read the job's error in Bull Board and the worker logs.
- On Render's free plan, outbound SMTP ports are blocked; see [SMTP is blocked](#6-smtp-is-blocked-on-renders-free-plan).
- A stuck `sending` row is marked `failed` the next time a worker starts.

**Google login fails**
- The origin and redirect URI in Google must match `GOOGLE_REDIRECT_URI` exactly.
- Use `localhost` consistently locally.
- In Testing mode, your account must be a listed test user.
- `AUTH_MODE` (backend) and `VITE_AUTH_MODE` (frontend) must agree.

**Signed in, but the app acts logged out on the deployed site**
- The frontend and API must share one origin. Check the `/api/*` and `/admin/*` rewrite rules, that `VITE_API_BASE` is not set to a different domain, and that `COOKIE_SECURE=true` over HTTPS.

**Refreshing a page on the deployed site shows 404**
- Add the `/* → /index.html` rewrite as the **last** rule.

**Queue dashboard shows 401 or the wrong site**
- Sign in first. On Render, make sure the `/admin/*` rewrite exists and open `/admin/queues` on the **frontend** URL.

**Slack callback fails**
- The redirect URL must be HTTPS and identical in the Slack app and `SLACK_REDIRECT_URI`. Update both when a tunnel URL changes.

**Search misses a new email**
- Indexing is asynchronous. Confirm Elasticsearch is running, check the logs for fallback warnings, or run `npm run search:reindex`.

**A local service isn't running**

```bash
docker compose ps
docker compose logs mysql
docker compose logs redis
docker compose logs elasticsearch
```

---

## Submission Checklist

- [ ] The repository is private.
- [ ] Access is granted to **Mitrajit** and **Yadav036**.
- [ ] No `.env` files, client secrets, webhook URLs or tokens are committed (check `git log`, not just the working tree).
- [ ] Migrations and both builds work from a clean checkout (`npm install`, `npm run db:migrate`, `npm run build`).
- [ ] A scheduled email, a sent email and a restart-recovery scenario have been tested.
