# ONB Email Scheduler

ONB is a small email scheduling workspace built for the ReachInbox assignment. It lets a signed-in user prepare a message, add recipients or upload a CSV, and schedule the sends through a queue. The interface follows the screenshots supplied with the assignment.

Messages are sent through Ethereal, so this project is for development and demonstration. Ethereal captures test mail; it does not deliver it to a recipient's real inbox.

## What is in the project

- Google OAuth login and a dashboard for scheduled and sent messages.
- A compose screen with recipient entry, CSV upload, rich text, a start time, a per-sender hourly limit, and a delay between sends.
- An Express API backed by MySQL and Prisma.
- BullMQ delayed jobs stored in Redis, with one job and database record per recipient.
- Elasticsearch search for message content, sender, and recipient. Existing database records are indexed again when the backend starts.
- An optional Slack connection that can post when a sender reaches its hourly limit.
- Bull Board at `/admin/queues` for inspecting queued work.

## Run it locally

You need Node.js, npm, and Docker Desktop. From the project directory, start the data services:

```sh
docker compose up -d
```

Set up the backend in a second terminal:

```sh
cd backend
cp .env.example .env
npm install
npx prisma generate
npx prisma db push
npm run dev
```

On Windows PowerShell, use `Copy-Item .env.example .env` instead of `cp`.

In another terminal, set up the frontend:

```sh
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

Open <http://localhost:3000>. The API runs at <http://localhost:4000>; the queue dashboard is at <http://localhost:4000/admin/queues>.

## Provider setup

### Google sign-in

Create a Google OAuth client for a web application. Add this exact URL to its authorized redirect URIs:

```text
http://localhost:4000/api/auth/google/callback
```

Put the client ID and secret in `backend/.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Set `GOOGLE_CALLBACK_URL` to the same URL above. The backend needs outbound network access to Google's OAuth token service when the callback is exchanged.

### Test email with Ethereal

Sign in, open Compose, and use **Add Ethereal Sender**. The app creates a test SMTP account and shows the login details. Use those details at <https://ethereal.email> to inspect sent messages. Nothing is delivered to a recipient's real mailbox.

### Slack alerts (optional)

Set `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, and `SLACK_REDIRECT_URI` in `backend/.env`. Register this redirect URL in the Slack app:

```text
http://localhost:4000/api/slack/callback
```

Then choose **Connect Slack** in the dashboard and approve the app in your workspace. Once connected, a sender limit hit triggers a Slack message. Without a connected workspace, sends continue and the notifier skips the alert. A live Slack demo requires completing that workspace authorization first.

## How a scheduled send works

The API validates the sender and recipients, parses CSV addresses when a file is uploaded, then creates a MySQL row and a delayed BullMQ job for each recipient. Each job has a stable ID so a restart can restore missing Redis queue entries without adding a duplicate job.

Workers can process separate recipients concurrently. Before each SMTP send, a small Lua script reserves a slot in Redis for that sender and UTC hour. It also reserves a send time so two workers using the same sender keep the requested spacing. When the hourly limit is full, the worker moves that same job to the next hour and marks the record `RATE_LIMITED`; it does not discard the recipient.

MySQL is the durable record of message state. Elasticsearch is used for search and can be rebuilt from MySQL when the backend starts. If indexing fails, delivery can still proceed, though search may be incomplete until indexing succeeds.

There is one unavoidable SMTP edge case: if the mail server accepts a message and the backend crashes before saving `SENT`, a retry can send it again. Queue IDs prevent duplicate queue entries, but ordinary SMTP does not provide the provider-side idempotency needed to guarantee exactly-once delivery.

For a large batch, the API creates independent queue entries instead of keeping the full batch inside one worker. Concurrency, sender limits, and send spacing control the rate at which those entries reach SMTP. Ordering between jobs can vary when schedules overlap or several workers are running.

## Configuration

`backend/.env.example` lists the backend settings. The defaults point at the services exposed by `docker-compose.yml`:

| Setting | Purpose |
| --- | --- |
| `DATABASE_URL` | MySQL connection string |
| `REDIS_HOST`, `REDIS_PORT` | Redis queue and rate counter connection |
| `ELASTICSEARCH_URL` | Elasticsearch node URL |
| `FRONTEND_URL`, `PORT` | Browser origin and API port |
| `SESSION_SECRET` | Secret used to sign login sessions; replace the example value |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` | Google sign-in |
| `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_REDIRECT_URI` | Optional Slack connection |
| `WORKER_CONCURRENCY` | Number of queue jobs a worker can process at once (default `5`) |
| `MIN_DELAY_BETWEEN_EMAILS_MS` | Minimum per-sender spacing in milliseconds (default `2000`) |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | Per-sender hourly ceiling (default `50`) |
| `MAX_EMAILS_PER_HOUR` | BullMQ's global job limiter (default `200`) |

The frontend's `NEXT_PUBLIC_API_URL` defaults to `http://localhost:4000`.

The Compose file includes development-only database credentials and disables Elasticsearch security for local use. Do not reuse those defaults for a public deployment. The app also uses Express's in-memory session store, which is suitable for this local setup but should be replaced before running multiple backend instances.
