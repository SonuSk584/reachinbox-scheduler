# ReachInbox Email Scheduler

Full-stack email scheduler: Express + TypeScript, BullMQ + Redis, MySQL 8 (Drizzle ORM), Elasticsearch, Ethereal SMTP, React frontend.

> Work in progress - this README is completed in the final phase. Sections below cover what is built so far.

## Run the backend

```bash
docker compose up -d                 # MySQL, Redis (AOF persistence), Elasticsearch
cd backend
cp .env.example .env
npm install
npm run db:migrate                   # apply SQL migrations
npm run seed:senders 2               # creates 2 Ethereal SMTP inboxes (needs internet)
npm run dev                          # API on :4000 + worker, side by side
# Bull Board dashboard: http://localhost:4000/admin/queues
```

MySQL is published on host port **3307** (not 3306) so it never clashes with a MySQL already installed on your machine.

API and worker are **separate processes** (`src/server.ts`, `src/worker.ts`). Run more workers with `npm run dev:worker` in extra terminals - they are safe in parallel.

### Try it

```bash
SID=$(curl -s localhost:4000/api/senders | jq -r '.[0].id')
curl -X POST localhost:4000/api/emails/schedule -H 'content-type: application/json' -d '{
  "senderId": "'$SID'", "subject": "Hello", "body": "<p>Hi there</p>",
  "leads": ["a@example.com", "b@example.com"],
  "startTime": "2030-01-01T10:00:00Z", "delaySeconds": 5
}'
curl localhost:4000/api/emails/scheduled
curl localhost:4000/api/emails/counts
```

Each sent email stores an Ethereal `previewUrl` so you can open the delivered message.

## Architecture (so far)

**MySQL is the source of truth; Redis/BullMQ is only the timer.**

1. `POST /api/emails/schedule` inserts one `batches` row (subject/body once) and one `emails` row per lead in a single transaction, then enqueues one BullMQ **delayed job** per email. No cron anywhere.
2. **Idempotency, two layers**
   - `jobId = emails.id` - BullMQ ignores a second add with the same id.
   - The worker does an atomic `UPDATE ... SET status='sending' WHERE id=? AND status='scheduled'`. MySQL applies it atomically, so exactly one concurrent UPDATE sees `affectedRows = 1`; retries, stalled-job recovery, and duplicate jobs skip.
3. **Persistence on restart**
   - Redis runs with AOF (`appendonly yes`) + a volume, so delayed jobs survive restarts.
   - On boot the worker runs `reconcile()`: any `scheduled` row with no BullMQ job is re-enqueued (covers a wiped Redis, or an API call that saved rows but died before enqueueing). Overdue rows send immediately.
4. **Crash mid-send** leaves a row in `sending`. We cannot know if SMTP accepted it, so reconcile marks it `failed` after `STALE_SENDING_MINUTES` rather than risk a duplicate (at-most-once, deliberate trade-off).
5. Rate limiting, the minimum delay and concurrency are described in the next section.

## Rate limiting, minimum delay and concurrency

| Setting | Env var | Default |
|---|---|---|
| Minimum gap between two sends from the same sender | `MIN_DELAY_BETWEEN_SENDS_MS` | **2000** (2 seconds) |
| Hourly cap per sender | `MAX_EMAILS_PER_HOUR_PER_SENDER` | **200** |
| Parallel jobs per worker process | `WORKER_CONCURRENCY` | 5 |

The hourly cap can also be set per compose (the "Hourly Limit" field), which overrides the default for that batch. Nothing is hardcoded.

### How it is enforced: slot reservation in Redis

Both rules are enforced by one atomic Redis (Lua) script, `services/rateLimiter.ts`. Each sender has a timeline pointer meaning "the earliest moment its next email may go out". When a job wakes up it asks for a slot:

1. `slot = max(now, pointer)` gives the minimum delay between sends.
2. If the hourly window containing `slot` already holds the maximum, the slot jumps to the start of the next window and is checked again. This gives the hourly limit.
3. The slot is counted against that window (a Redis counter keyed `rl:{sender}:w:<hour>`) and the pointer moves to `slot + gap`.

Why this design:
- **Safe across workers and instances.** The whole decision is one atomic script and the clock is Redis's own, so any number of workers agree. Nothing is kept in memory.
- **Nothing is dropped or failed.** An email that does not fit this hour just receives a slot in a later hour. It is parked as a BullMQ delayed job (via `moveToDelayed`) and its `scheduledAt` is updated, so the dashboard shows the new time.
- **Order is preserved.** Slots are handed out in the order jobs are picked up, so earlier emails get earlier slots.
- **Restart-safe.** The reserved slot is stored on the job. A restart, crash or re-delivery reuses it instead of counting a second time. A retry after a failed send books a new slot, because every SMTP attempt counts.
- **Idempotency is unchanged.** The atomic `scheduled -> sending` claim still guards the actual send.

Short waits (up to `INLINE_WAIT_MAX_MS`, 10 s) are slept inside the worker, which spaces sends. Longer waits are parked, so a big backlog never ties up workers or expires job locks.

When a sender hits its hourly limit the worker raises a notification, deduplicated to one per sender per hour (Slack delivery is wired in the Slack phase).

### Behaviour under load

Measured with `npm run load:test -- --count 1000 --limit 5`:

- The API accepted all 1000 emails in about 0.6 s.
- All 1000 were accounted for; none dropped.
- No hour ever held more than 5, spread over 200 hourly windows. Only the 5 that fit the current hour were actually sent.
- One limit alert was raised, not 995.
- A hard `kill -9` of both workers and the API, then restart, left the counts identical (no reservation counted twice).
- Two workers running in parallel never exceeded the limit.

You do not need to send thousands through Ethereal: only emails inside the current hour's limit are sent.

### Trade-offs and limitations

- **Fixed hourly windows.** Windows align to the UTC clock hour, so a sender could send its full quota just before and just after an hour boundary (a burst of up to 2x the limit across the boundary). A sliding window would smooth this at the cost of more Redis work.
- **Counters live in Redis.** If Redis data is wiped, the rate counters reset (the jobs themselves are rebuilt from MySQL by `reconcile()`), so a sender could briefly exceed its limit within the current hour.
- **First come, first served per sender.** A new batch waits behind any existing backlog for the same sender, which is what keeps order, but it means a huge backlog delays later batches.
- **Small reordering.** With several jobs picked up at the same instant, neighbouring emails can swap (7 of 999 in the 1000-email test).
- **Timing precision.** Slots are exactly one gap apart; arrival at the SMTP server wobbles by tens of milliseconds because of connection time.
- **Redis Cluster.** The script builds keys dynamically; they share a `{senderId}` hash tag so they sit on one slot, but the script is only tested on a single Redis.

## Search (Elasticsearch)

Every scheduled and sent email is searchable by recipient, subject or body text through the search box.

- **MySQL stays the source of truth.** Elasticsearch only decides *which* emails match; the rows themselves are loaded from MySQL, so API responses look the same with or without it. The response includes `engine: "elasticsearch"` (or `"sql"`) on searches so you can see which one answered.
- **Indexing.** An email is indexed as soon as it is scheduled, and re-indexed whenever its status or send time changes (sent, failed, retried, or pushed to a later hour by the rate limiter). Indexing is fire-and-forget: a slow or dead Elasticsearch can never delay or fail a send.
- **What matches.** Words in the subject, body or address (the last word may be a prefix, so "meet" finds "meeting"), and any substring of the recipient address ("w3" finds `w3@x.com`).
- **Self-healing.** When the worker starts it compares the index with MySQL and rebuilds the index if it is empty or out of date. You can also rebuild by hand: `npm run search:reindex` (add `-- --reset` to drop the index first).
- **Graceful fallback.** If Elasticsearch is unreachable, search falls back to a MySQL substring match, logs one warning, and recovers on its own when Elasticsearch returns.

Trade-off: the index is updated asynchronously, so a brand-new email can take about a second to appear in search results.

## Queue dashboard (Bull Board)

A live BullMQ dashboard is served by the API at **http://localhost:4000/admin/queues** (also reachable from the frontend via the "Queue dashboard" link in the sidebar). It shows waiting, delayed, active, completed and failed jobs in real time, and lets you inspect a job's data. Emails pushed to a later hour by the rate limiter appear under **Delayed**. It sits behind the same login as the API.

## Google login

Real Google OAuth 2.0 (authorization-code flow). No mock.

### Set up (once)
1. In Google Cloud Console create an **OAuth client ID** of type *Web application* (APIs & Services > Credentials).
2. Authorized JavaScript origin: `http://localhost:5173`
3. Authorized redirect URI: `http://localhost:5173/api/auth/google/callback` (it must match `GOOGLE_REDIRECT_URI` exactly, character for character).
4. While the consent screen is in *Testing* mode, add the Google accounts that will log in under **Audience > Test users**.
5. In `backend/.env` set `AUTH_MODE=google`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. In `frontend/.env` set `VITE_AUTH_MODE=google`. Restart both.
6. Open **http://localhost:5173** (use `localhost`, not `127.0.0.1`, so the redirect URI and cookies line up).

`AUTH_MODE=dev` skips login and acts as a local dev user. It exists only for development.

### How it works
1. The button goes to `GET /api/auth/google`. The server makes a random `state`, keeps a copy in a short-lived cookie, and redirects to Google.
2. Google sends the user back to `/api/auth/google/callback?code=...&state=...`.
3. The server checks `state` matches its cookie (this proves the login was started by this site and blocks forged callbacks), exchanges the one-time `code` for an access token (server to server, using the client secret), and reads the user's Google profile.
4. It requires a **verified** email, finds or creates the user (matched on Google id, then on email), and creates a **session**.
5. The browser receives only a random session id in a cookie. The session itself lives in Redis.

### Security notes
- Session cookie is `HttpOnly` (JavaScript cannot read it), `SameSite=Lax` (not sent on cross-site POSTs, which blocks CSRF) and `Secure` when `COOKIE_SECURE=true` (set it behind HTTPS).
- Sessions are server-side in Redis with a 7-day expiry (`SESSION_TTL_DAYS`). Logout deletes the session, so a copied cookie stops working immediately.
- Every query is scoped to the logged-in user: another user cannot list, open, search or send from your data (verified with two accounts).
- The Bull Board dashboard sits behind the same login.
- Failed sign-ins (cancelled, unverified email, forged state, rejected code) create no session and return the user to the login page with a message.
- The client secret lives only in `backend/.env`, which is git-ignored.

### Trade-offs
- Sessions expire 7 days after login (they are not extended on use), so users sign in again weekly.
- Passwords and email sign-up are not implemented; the email/password form in the design shows a notice.
- New users get a default Ethereal sender automatically (best effort; they can add more in Compose).
- Data belongs to the account that created it, so a new Google account starts empty.

## Slack alerts

When a sender reaches its hourly limit, a message is posted to the user's own Slack channel, from a real OAuth connection. Each user connects their own workspace.

### Set up (once)
1. Create a Slack app (api.slack.com/apps > Create New App > From scratch) and add the **`incoming-webhook`** bot scope under OAuth & Permissions.
2. Slack only accepts **HTTPS** redirect URLs, so in development expose the backend with a tunnel: `ngrok http 4000`. Add `https://<your-ngrok-address>/api/slack/callback` under **Redirect URLs** and save.
3. In `backend/.env` set `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` and `SLACK_REDIRECT_URI` (the same redirect URL as in step 2). Restart the backend and worker.
4. If the ngrok address changes, update both the Slack app and `SLACK_REDIRECT_URI`.

### Using it
Click your name in the sidebar and choose **Connect Slack**. Slack asks which channel to post to; after approving you land back in the app. The same menu shows the connected channel, **Send test message**, and **Disconnect Slack**.

### How it works
1. `GET /api/slack/connect` creates a random `state` (stored in Redis for 10 minutes, mapped to the user) and redirects to Slack.
2. Slack redirects to the public callback. That request carries **no session cookie** (it arrives on the tunnel's hostname), so the user is identified by `state`, which is single-use.
3. The server exchanges the code for an incoming-webhook URL and stores it per user in `slack_connections` (one row per user; reconnecting replaces it).
4. When a booking uses up a sender's last slot for the current hour, or an email has to be pushed to a later hour, the worker posts one message to that sender owner's webhook: `Hourly sending limit reached for <sender> (N/hour) ... sending resumes at <time>`.

### Behaviour
- **One alert per sender per hour**, not one per delayed email (1000 queued emails do not become 1000 messages).
- **Not connected:** nothing is sent, nothing fails, and the hour's alert is not used up. Connecting later takes effect immediately, with no restart or redeploy, because the connection is read from MySQL each time.
- **Slack unreachable or slow:** the alert runs in the background with a 5 second timeout and never delays or fails an email send. A failed attempt is retried on the next limit event.
- **App removed from the workspace:** Slack answers 404/410, so the stale connection is deleted and the UI shows "Connect Slack" again.

### Trade-offs
- The webhook URL is a secret (anyone holding it can post to the channel). It is stored in MySQL as plain text; in production it should be encrypted at rest.
- The alert means the sender's quota for the hour is fully *booked*. The last email of that hour may still be a few minutes from physically sending.
- A webhook posts to one fixed channel chosen at connect time. Reconnect to change it.

## Run the frontend

```bash
cd frontend
cp .env.example .env     # Windows: copy .env.example .env
npm install
npm run dev              # http://localhost:5173  (proxies /api to the backend on :4000)
```

Other scripts: `npm run build` (typecheck + production build), `npm test` (UI tests), `npm run typecheck`.

With `VITE_AUTH_MODE=google` (the default) the login page uses real Google sign-in. For quick local work you can set `AUTH_MODE=dev` in the backend and `VITE_AUTH_MODE=dev` here, which skips login and acts as a local dev user.

### Frontend structure

See [`frontend/README.md`](frontend/README.md).

## Status

| Phase | Status |
|---|---|
| Scaffold, Docker, schema, migrations | done |
| Schedule API, queue, worker, idempotency, reconcile | done and tested |
| Frontend (login, inbox, detail, compose, rich text, CSV upload, send later) | done, tested against the live API |
| Min delay + hourly rate limit + concurrency | done and load-tested |
| Slack OAuth + alert on limit hit | done |
| Elasticsearch search + Bull Board dashboard | done |
| Google OAuth login with Redis sessions | done |
