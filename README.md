# ReachInbox Email Scheduler

A full-stack email scheduling application built with **React, TypeScript, Express, BullMQ, Redis, MySQL, Drizzle ORM, Elasticsearch, and Ethereal Email**.

The application lets authenticated users compose email batches, upload recipient lists, schedule emails, monitor scheduled and sent messages, search email records, and receive Slack notifications when a sender reaches its hourly sending limit.

> **Email testing note:** The configured mail transport uses Ethereal Email for development and demonstrations. Ethereal captures test messages and provides preview URLs; it does not deliver messages to real recipient inboxes.

---

## Table of Contents

- [Features](#features)
- [Technology Stack](#technology-stack)
- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Environment Configuration](#environment-configuration)
- [Run the Application Locally](#run-the-application-locally)
- [How Scheduling Works](#how-scheduling-works)
- [Persistence and Restart Recovery](#persistence-and-restart-recovery)
- [Rate Limiting and Concurrency](#rate-limiting-and-concurrency)
- [Ethereal Email Setup and Testing](#ethereal-email-setup-and-testing)
- [Google Login](#google-login)
- [Slack Rate-Limit Notifications](#slack-rate-limit-notifications)
- [Search and Queue Dashboard](#search-and-queue-dashboard)
- [API Quick Test](#api-quick-test)
- [Demo Video Checklist](#demo-video-checklist)
- [Feature Mapping](#feature-mapping)
- [Assumptions, Trade-offs, and Limitations](#assumptions-trade-offs-and-limitations)
- [Troubleshooting](#troubleshooting)

---

## Features

- **Email composition:** Select a sender, enter recipients, add a subject and message body, and configure sending options.
- **Recipient lists:** Enter recipients directly or upload a recipient list through the compose interface.
- **Send now or schedule:** Submit a batch for the earliest available send slots, or choose a future start time.
- **Scheduled and Sent views:** Review email status and scheduled/sent records from the dashboard.
- **Batch scheduling:** Store shared batch details once and persist an individual record for each recipient.
- **Rate limiting:** Enforce a per-sender hourly cap and a minimum interval between sends.
- **Worker concurrency:** Configure how many jobs each worker process can process concurrently.
- **Restart recovery:** Reconcile database records with BullMQ jobs when workers start.
- **Idempotency safeguards:** Prevent duplicate queue entries and guard the database transition before sending.
- **Google OAuth login:** Authenticate users with Google's authorization-code flow.
- **Slack notifications:** Notify the connected Slack channel when a sender reaches its hourly limit or a message is deferred due to the limit.
- **Search:** Search email records by recipient, subject, or body using Elasticsearch, with a SQL fallback.
- **Queue visibility:** Inspect waiting, delayed, active, completed, and failed jobs using Bull Board.
- **Ethereal previews:** Open a preview of a captured test email using the saved Ethereal preview URL.

---

## Technology Stack

| Area | Technology |
|---|---|
| Frontend | React, TypeScript, Vite |
| Backend API | Node.js, Express, TypeScript |
| Database | MySQL 8-compatible database, Drizzle ORM and SQL migrations |
| Job queue and delayed jobs | BullMQ |
| Queue, sessions and rate-limit state | Redis |
| Search | Elasticsearch |
| Test email transport | Ethereal Email / SMTP |
| Authentication | Google OAuth 2.0 |
| Notifications | Slack OAuth and incoming webhooks |
| Local infrastructure | Docker Compose |

---

## Architecture Overview

```text
React + Vite frontend
        |
        | HTTP requests / authentication
        v
Express API  --------------------> MySQL
        |                       (persistent source of truth)
        |
        +----------------------> Redis + BullMQ
        |                       (queue, delayed jobs, sessions,
        |                        rate-limit state)
        |
        +----------------------> Elasticsearch
        |                       (search index)
        |
        v
BullMQ worker
        |
        +----> Redis rate limiter
        |
        +----> Ethereal SMTP
        |
        +----> Slack notification (when applicable)
```

**MySQL is the source of truth.** Redis/BullMQ manages job timing and execution; Elasticsearch is a searchable index rather than the authoritative store for email records.

### Main scheduling flow

1. The frontend submits a batch to `POST /api/emails/schedule`.
2. The backend validates the input and verifies that the sender belongs to the authenticated user.
3. A database transaction stores the batch and one email record per valid recipient.
4. The backend enqueues one BullMQ job per email, using the email record ID as the job ID.
5. A worker processes each eligible job, reserves a sender-specific rate-limit slot in Redis, and waits or defers the job if required.
6. The worker atomically claims the email record by changing its status from `scheduled` to `sending`.
7. The worker sends the message through the configured Ethereal SMTP transport.
8. The database is updated to `sent` or `failed`, and the search index is updated asynchronously.

---

## Prerequisites

Install the following before running the application:

- Node.js and npm (use a version compatible with the project's package files).
- Docker Desktop with Docker Compose.
- A Google OAuth client if you want to test Google login.
- An Ethereal Email account or the project's Ethereal sender-seeding flow.
- A Slack app and HTTPS callback URL if you want to test Slack OAuth locally.

You will need internet access for Google OAuth, Slack OAuth, and creating Ethereal test accounts.

---

## Environment Configuration

Create local environment files from the examples supplied by the project.

### Backend

From the repository root, in PowerShell:

```powershell
Copy-Item backend/.env.example backend/.env
```

### Frontend

```powershell
Copy-Item frontend/.env.example frontend/.env
```

Review both files and fill in the values needed for your setup. Do not commit `.env` files or secrets to GitHub.

Backend configuration includes the database connection, Redis, Elasticsearch, authentication, session/cookie settings, SMTP/Ethereal configuration, worker settings, and optional Slack OAuth credentials. Use the variable names and formats in `backend/.env.example` as the source of truth.

Frontend configuration includes the API/authentication mode and any `VITE_` variables documented in `frontend/.env.example`.

### Worker settings

The backend `.env` supports these worker and rate-limit settings:

| Variable | Purpose | Example/default documented by this project |
|---|---|---:|
| `WORKER_CONCURRENCY` | Concurrent jobs per worker process | `5` |
| `MIN_DELAY_BETWEEN_SENDS_MS` | Minimum gap between sends from the same sender | `2000` ms |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | Default hourly limit for each sender | `200` in the project documentation; check your `.env.example` for the configured value |
| `JOB_MAX_ATTEMPTS` | BullMQ retry attempts | `3` in the example configuration |
| `STALE_SENDING_MINUTES` | Age after which a stuck `sending` record is treated as a crashed send | `5` in the example configuration |
| `INLINE_WAIT_MAX_MS` | Maximum time a worker waits inline before deferring a job | `10000` ms in the example configuration |
| `RATE_LIMIT_HORIZON_HOURS` | How far ahead the limiter may reserve hourly windows | `336` in the example configuration |

The Compose form's **Hourly Limit** field can override the default hourly cap for that batch. Empty or zero uses the server default.

> **Important:** Environment values may differ between local and deployed environments. Check the actual environment configuration for the environment you are testing. Restart the relevant backend/worker process after changing its environment.

---

## Run the Application Locally

Commands below are written for PowerShell on Windows. Run each service in the appropriate terminal.

### 1. Start infrastructure

From the repository root:

```powershell
docker compose up -d mysql redis elasticsearch
docker compose ps
```

This starts the database, Redis, and Elasticsearch services defined in Docker Compose. The project publishes MySQL on host port **3307** to avoid clashing with a local MySQL service on port 3306.

If your Compose file uses different service names, use the names shown by `docker compose config --services`.

### 2. Install backend dependencies and migrate the database

```powershell
cd backend
npm install
Copy-Item .env.example .env
npm run db:migrate
```

If you already created `backend/.env`, do not overwrite it; update it manually from `.env.example` instead.

### 3. Create test senders

```powershell
npm run seed:senders 2
```

This project script creates two Ethereal SMTP test senders and requires internet access. If your environment already provisions a default sender, you can use the sender shown in the application instead.

### 4. Start the API and worker

```powershell
npm run dev
```

The project README describes this command as starting the API on port `4000` with the worker running alongside it.

The API and worker have separate entry points (`src/server.ts` and `src/worker.ts`). If you need separate processes, inspect the scripts in `backend/package.json`; the project also documents `npm run dev:worker` for starting an additional worker in another terminal.

The local API is expected at:

- API: `http://localhost:4000`
- Bull Board: `http://localhost:4000/admin/queues`

### 5. Start the frontend

Open a new terminal at the repository root:

```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```

The frontend is expected at:

- Frontend: `http://localhost:5173`

The Vite development server is configured to proxy `/api` requests to the backend on port `4000`. Use `localhost` consistently for the local Google OAuth flow so that the callback URL and cookies match.

### 6. Useful development commands

Run these from the relevant package directory:

```powershell
npm run build
npm test
npm run typecheck
```

The frontend project documents these scripts. Available backend scripts can be checked in `backend/package.json`.

---

## How Scheduling Works

### Send now

When no future start time is selected, the frontend omits `startTime` from the effective JSON payload. The backend treats a missing or past start time as the current time, so the job becomes eligible for processing as soon as the queue and worker can process it.

**Send now does not bypass the rate limiter.** A message can still wait if the sender's next available slot is in the future or the hourly quota has been reserved.

### Send later

When a future start time is selected, the backend saves that start time and assigns each recipient a scheduled time based on the configured delay between emails.

Conceptually:

```text
recipient 1: start time
recipient 2: start time + delay
recipient 3: start time + 2 × delay
...
```

BullMQ stores delayed jobs and makes them eligible when their delay expires. The worker then applies the rate-limit slot before sending.

### Status lifecycle

The main statuses used by the worker are:

- `scheduled`: persisted and waiting for processing or a future send slot.
- `sending`: claimed by a worker that is attempting to send the message.
- `sent`: the SMTP send completed and the database was updated.
- `failed`: sending failed permanently, or a stale in-progress send was marked failed during recovery.

The Scheduled page may include messages waiting for a future time or waiting for a rate-limit slot. Check the job in Bull Board and the backend logs when diagnosing an unexpected delay.

---

## Persistence and Restart Recovery

- **Database:** MySQL stores batch details, recipient email records, status, scheduled times, attempts, and send results.
- **Queue persistence:** Redis is configured with append-only-file (AOF) persistence and a Docker volume in the local setup, so BullMQ jobs can survive service restarts when Redis data is preserved.
- **Reconciliation:** On worker startup, the application reconciles scheduled database records with BullMQ jobs. A scheduled record that has no corresponding queue job can be enqueued again. Overdue records become eligible for processing.
- **Duplicate queue protection:** `jobId` is set to the email record ID, so repeated attempts to add the same job do not normally create a second queue job while that job ID exists.
- **Database claim protection:** Before sending, the worker atomically updates the record from `scheduled` to `sending`. A worker that cannot claim the row skips it.
- **Crash during sending:** If a process crashes after the SMTP server accepts a message but before the database records success, the application cannot reliably know whether delivery occurred. The documented recovery strategy marks stale `sending` records as failed rather than automatically sending them again, reducing the risk of duplicate mail.

### Demonstrating restart recovery

1. Schedule one or more emails for a future time.
2. Confirm they appear in the Scheduled view.
3. Stop and restart the API/worker processes while preserving MySQL and Redis data.
4. Confirm the scheduled records remain available and the worker resumes processing eligible jobs.
5. For a clean demonstration, use test recipients and a short future schedule, and verify the result in the dashboard and Ethereal preview.

Do not use `docker compose down -v` for this test: removing volumes can delete local persistent data.

---

## Rate Limiting and Concurrency

The rate limiter is implemented in `backend/src/services/rateLimiter.ts` with an atomic Redis Lua script.

### Rules

1. **Minimum delay:** Each sender has a Redis pointer representing the earliest available slot. The next slot is no earlier than the current time or that pointer.
2. **Hourly cap:** Each slot is counted against a UTC epoch-hour window. If that window has reached its limit, the algorithm searches a later window, subject to the configured reservation horizon.
3. **Shared state:** Redis coordinates reservations across worker processes, rather than relying on process-local counters.
4. **Deferred jobs:** If a slot is farther away than `INLINE_WAIT_MAX_MS`, the worker moves the job to a delayed state instead of holding a worker slot while waiting.
5. **Retries:** A retry after a send failure reserves a new slot because each SMTP attempt counts toward the sending limit.
6. **Concurrency:** `WORKER_CONCURRENCY` controls the number of jobs a worker process may process concurrently. Running multiple worker processes adds capacity, while the shared Redis rate limiter continues to coordinate sender limits.

### Testing rate limits

For a controlled test:

1. Use a test sender and a small recipient list.
2. Set a low per-batch hourly limit in the Compose form, or adjust the local backend environment and restart the worker.
3. Submit more emails than the limit.
4. Observe the Scheduled and Sent views, backend logs, and Bull Board's delayed jobs.
5. Confirm that emails beyond the current quota are deferred rather than silently dropped.
6. Restore the intended limit after testing.

**Avoid manually deleting Redis rate-limit keys while jobs are active.** Jobs can carry previously reserved slot timestamps, and resetting shared rate-limit state during processing can invalidate the spacing guarantees.

### Design trade-offs

- The implementation uses fixed UTC hour windows, not a rolling 60-minute window. A sender may use quota near both sides of an hour boundary.
- A large backlog for one sender can delay later emails for that sender.
- Redis is required for coordinated rate limiting. If Redis rate-limit data is lost, the counters are reset even if the database and queued jobs remain.
- SMTP processing time can add small timing variations beyond the configured slot interval.

---

## Ethereal Email Setup and Testing

Ethereal is a test SMTP service. It captures messages so you can inspect their content without delivering them to real inboxes.

### Configure it

1. Review the backend environment example and identify the Ethereal/SMTP variables required by the project.
2. Set the SMTP host, port, credentials, and security options using the values provided by Ethereal or the project's sender-seeding script.
3. Keep credentials in `backend/.env`, never in frontend `VITE_` variables or committed source code.
4. Restart the backend/worker after changing SMTP configuration.
5. Use the application's sender selection and compose form to send a test message.

If using the project seeding flow, run from `backend`:

```powershell
npm run seed:senders 2
```

### Verify a sent email

- Open the **Sent** view and inspect the message status.
- Open the email's saved Ethereal `previewUrl` when available.
- If the message remains Scheduled, inspect its BullMQ job in Bull Board and check the backend worker logs. A future time can be caused by the selected start time, an already-reserved rate-limit slot, or an exhausted hourly quota.

Ethereal previews demonstrate that the test transport captured the message; they are not proof of delivery to a real recipient inbox.

---

## Google Login

The application supports Google OAuth 2.0 authorization-code login.

### Local setup

1. In Google Cloud Console, create an OAuth client ID of type **Web application**.
2. Add this authorized JavaScript origin:

   ```text
   http://localhost:5173
   ```

3. Add this authorized redirect URI, matching `GOOGLE_REDIRECT_URI` exactly:

   ```text
   http://localhost:5173/api/auth/google/callback
   ```

4. If the consent screen is in Testing mode, add the intended Google accounts under the OAuth audience's test users.
5. Set `AUTH_MODE=google` and the Google client ID, client secret, and redirect URI in `backend/.env`.
6. Set `VITE_AUTH_MODE=google` in `frontend/.env`.
7. Restart the relevant processes and open `http://localhost:5173`.

Use `localhost` consistently rather than switching between `localhost` and `127.0.0.1`.

### Authentication overview

- The server creates a random OAuth `state` value and verifies it when Google redirects back.
- The server exchanges the authorization code and obtains the user's profile.
- The application requires a verified email and creates or finds the corresponding user.
- The browser receives a session cookie; session data is stored server-side in Redis.
- API queries are scoped to the authenticated user.

`AUTH_MODE=dev` and `VITE_AUTH_MODE=dev` are available for local development if configured by the project. They bypass real login and should not be used as production authentication.

---

## Slack Rate-Limit Notifications

When a sender's hourly quota is reached or an email is deferred because of rate limiting, the application can notify the user's connected Slack channel.

### Configure Slack OAuth

1. Create an app at [api.slack.com/apps](https://api.slack.com/apps).
2. Configure the required incoming-webhook capability and permissions for the app.
3. Set the Slack OAuth client ID, client secret, and callback URL in `backend/.env`.
4. Slack requires HTTPS callback URLs. For local development, use a trusted HTTPS tunnel such as ngrok and register the exact callback URL in the Slack app configuration.
5. Restart the backend/worker after changing configuration.

Use the callback path configured by the project (the documented local route is `/api/slack/callback`). If the tunnel URL changes, update the Slack app and environment value.

### Connect and test

1. Sign in to the dashboard.
2. Open the user menu and select **Connect Slack**.
3. Authorize the Slack app and select the channel.
4. Use **Send test message** if shown in the connected Slack menu.
5. Trigger a controlled rate-limit test and verify that the notification appears in the chosen channel.

The notifier runs in the background so a slow Slack request should not block email processing. Notifications are deduplicated by sender/hour to avoid one alert per deferred email.

---

## Search and Queue Dashboard

### Elasticsearch search

The search field supports queries over recipient addresses, subjects, and message bodies.

- MySQL remains the source of truth; Elasticsearch supplies matching IDs/results.
- Index updates run asynchronously when records are created or their status or scheduled time changes.
- Search falls back to a SQL substring query if Elasticsearch is unavailable.
- To rebuild the index, run this from `backend` if the script exists in your package scripts:

  ```powershell
  npm run search:reindex
  ```

  The project documentation also describes `npm run search:reindex -- --reset` for rebuilding after dropping the index.

A newly scheduled email may take a short time to appear in search because indexing is asynchronous.

### Bull Board

Open the local queue dashboard at:

```text
http://localhost:4000/admin/queues
```

Bull Board can show waiting, delayed, active, completed, and failed BullMQ jobs, along with job data. A job deferred by the rate limiter should appear as delayed. The endpoint is protected by the application's authentication in the documented setup.

---

## API Quick Test

The following example assumes the API is running locally, authentication is configured to permit the request, and `jq` is available. Use an actual sender ID belonging to the authenticated user.

### Schedule a batch

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

The example uses a future start time. To request the earliest available send slots, omit `startTime` from the JSON body. The rate limiter still applies.

### Inspect scheduled emails and counts

```bash
curl http://localhost:4000/api/emails/scheduled
curl http://localhost:4000/api/emails/counts
```

If Google authentication or session protection is enabled, these requests need a valid authenticated session/cookie. The exact API response depends on the project's route implementation.

---

## Demo Video Checklist

Keep the demonstration to **five minutes or less**, as requested by the submission guidelines.

Suggested sequence:

1. **Compose and schedule (0:00–1:00)**
   - Sign in.
   - Compose an email with a subject, body, and a few test recipients.
   - Show sending immediately or selecting a future send time.
   - Submit the batch.

2. **Dashboard (1:00–2:00)**
   - Show the Scheduled view.
   - Show the Sent view after processing.
   - Open a sent message and show the Ethereal preview URL, if available.

3. **Restart recovery (2:00–3:15)**
   - Schedule a message for a short time in the future.
   - Stop and restart the API/worker while preserving database and Redis volumes.
   - Show that the pending message remains and is processed when eligible.

4. **Rate limiting and delay (3:15–4:30)**
   - Use a test sender and a deliberately small hourly cap.
   - Submit more emails than the cap.
   - Show deferred jobs in Bull Board and the corresponding Scheduled times.
   - Optionally show the Slack notification if Slack is connected.

5. **Wrap-up (4:30–5:00)**
   - Briefly mention the database, BullMQ/Redis, worker concurrency, idempotency, and search.

Use test addresses and Ethereal previews. Do not display secrets, OAuth tokens, session cookies, or private environment files in the recording.

---

## Feature Mapping

| Requirement area | Implemented functionality |
|---|---|
| Backend scheduler | Express scheduling API, persisted batches and email records, BullMQ delayed jobs |
| Persistence | MySQL persistence, Redis AOF/volume for queue data, worker reconciliation after restart |
| Rate limiting | Atomic Redis Lua slot reservation, per-sender hourly cap, configurable minimum send gap |
| Concurrency | Configurable BullMQ worker concurrency; multiple workers share Redis coordination |
| Idempotency | BullMQ job IDs based on email IDs and atomic database claim before sending |
| Frontend login | Google OAuth login and session-backed authentication |
| Frontend dashboard | Scheduled and Sent views, email counts and message details |
| Compose | Sender selection, recipients, subject/body, recipient-list upload, delay and hourly limit controls, send-later scheduling |
| Search | Elasticsearch search with SQL fallback |
| Notifications | Slack OAuth connection and rate-limit notifications |
| Development observability | Bull Board queue dashboard and Ethereal message previews |

---

## Assumptions, Trade-offs, and Limitations

- **Ethereal is for testing.** Messages are captured for inspection and are not delivered to actual recipient inboxes.
- **Send now means earliest eligible processing.** It does not bypass a sender's reserved slots, hourly limit, worker availability, or SMTP processing.
- **Hourly limits use fixed UTC hour windows.** They are not rolling 60-minute windows.
- **Existing backlogs affect order and timing.** A large backlog for one sender can delay newer messages from the same sender.
- **Redis rate-limit state matters.** Deleting rate-limit keys or clearing Redis while jobs are active can undermine send-spacing guarantees. Avoid flushing Redis during normal operation or the restart demonstration.
- **SMTP outcome can be ambiguous after a crash.** If SMTP accepts a message but the process crashes before recording success, the application cannot always determine whether the message was accepted. The recovery strategy favors avoiding an automatic duplicate over guaranteeing a retry.
- **Search indexing is asynchronous.** New or updated records can take a short time to appear in search.
- **Production deployment requires production-grade configuration.** Use secure secrets, HTTPS, correct cookie settings, protected OAuth callbacks, durable database/Redis services, and monitoring appropriate to the deployment.

---

## Troubleshooting

### An email remains in Scheduled

1. Check whether a future start time was selected.
2. Open Bull Board and inspect whether the job is waiting, delayed, active, completed, or failed.
3. Check the email's scheduled time and status in the dashboard.
4. Review backend/worker logs for rate-limit deferral, SMTP errors, or worker errors.
5. Check the sender's hourly limit and existing queued backlog.
6. Remember that changing the hourly limit in `.env` does not erase slot reservations already recorded in Redis or on BullMQ jobs.

### Google login fails

- Verify that the authorized origin and redirect URI exactly match the configured values.
- Use `localhost` consistently for local development.
- Ensure the account is listed as a test user if the OAuth consent screen is in Testing mode.
- Check that the backend and frontend auth modes are configured consistently.

### Slack callback fails

- Confirm the callback URL is HTTPS and matches the Slack app configuration exactly.
- Check the configured callback route and environment variables.
- Update the Slack app and environment configuration if the tunnel URL changes.

### Elasticsearch search does not return a new record

- Allow for asynchronous indexing.
- Confirm Elasticsearch is running.
- Check backend logs for fallback warnings.
- Rebuild the index using the project's documented script if needed.

### Local services are not running

```powershell
docker compose ps
docker compose logs redis
docker compose logs elasticsearch
docker compose logs mysql
```

Check the service names in `docker-compose.yml` if they differ.

---

## Repository Submission Checklist

Before submitting:

- [ ] Keep the repository private.
- [ ] Grant repository access to **Mitrajit** and **Yadav036**, as specified in the submission instructions.
- [ ] Confirm `.env` files, client secrets, webhook URLs, and tokens are not committed.
- [ ] Verify backend migrations and frontend build work from a clean checkout.
- [ ] Test a scheduled email, a sent email, and a restart-recovery scenario.
- [ ] Record a demo video no longer than five minutes.
- [ ] Include the video link and any necessary setup notes in the submission, if requested.
