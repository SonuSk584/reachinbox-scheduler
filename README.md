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
```

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
5. Concurrency is `WORKER_CONCURRENCY`; rate limiting and min delay land in the next phase.

## Status

| Phase | Status |
|---|---|
| Scaffold, Docker, schema, migrations | done |
| Schedule API, queue, worker, idempotency, reconcile | done and tested |
| Min delay + hourly rate limit + Slack alert | next |
| Elasticsearch + Bull Board | todo |
| Google OAuth | todo |
| Frontend | todo |

## Database notes (MySQL)

- IDs are `CHAR(36)` UUIDs generated in application code. MySQL has no `RETURNING`, so the app always knows an id before inserting, and the worker's atomic claim checks `affectedRows` instead.
- All `DATETIME(3)` values are stored and read as UTC (`timezone: 'Z'` on the connection pool).
- Email bodies are `LONGTEXT` and stored once per batch, not once per recipient.
