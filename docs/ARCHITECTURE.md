# ARCHITECTURE: Inboxwire by BufferSol on Vercel + MongoDB Atlas + Stripe + kit-v1

Workbook says Postgres/Fastify/Valkey/BullMQ/own servers. Owner decision: Vercel first, VPS later (BATCH1_PLAN). Everything that needs an always-on process sits behind an interface (section 4). Mapping below is per brief P0 item.

## 1. Topology
- **Next.js (App Router) on Vercel**: marketing, dashboard, hosted connect page `/connect/<token>`, REST API `/v1/*` (route handlers, Zod, OpenAPI 3.1 generated from the Zod schemas), docs (MDX), `/status`.
- **MongoDB Atlas** (db `inboxwire`, user `inboxwire-app`): all state. Mongo + memory drivers behind the kit's DB interface. TTL indexes on `Date` fields.
- **Stripe** (test first) via the kit billing adapter. **Mailer** interface: provider adapter now (Resend), own Postfix/KumoMTA adapter on the VPS later.
- **Cloudflare**: cron worker (every minute) calls `/api/cron/<job>` with `CRON_SECRET`; R2 for attachments staging and the CASA kit zip; Cloudflare DNS for the domain.
- **GitHub Actions**: CI (lint, typecheck, test, build, OSV scan, ZAP baseline), builds the **self-host Docker image** to GHCR on release tags, generates the CASA kit artifacts.
- **Vercel Pro is required before real money** (Hobby is non-commercial, function duration 10-60 s, 1 cron/day). Cloudflare cron avoids the Vercel cron limit.

## 2. What runs where
| Concern | Now (Vercel) | Later (VPS) |
|---|---|---|
| Gmail realtime | Customer's Pub/Sub topic with a **push subscription** to `POST /api/hooks/gmail/<envId>?token=...` (OIDC JWT verified: audience + service account). Handler runs `history.list` from stored `historyId`, emits events. Watch (`users.watch`) renewed daily by cron (expires 7 days). Fallback without topic: cron polling `history.list` every minute (30-60 s latency, shown as "polling mode"). | Same code; polling interval tightens. |
| Microsoft realtime | Graph change notifications (customer's Entra app) to `POST /api/hooks/graph/<envId>` with `validationToken` handshake, `clientState` check, lifecycle notifications; subscriptions renewed by cron (~every 12 h, before expiry); delta query on each notification. | Same. |
| IMAP | **Cron polling** every minute: for each IMAP account due, short ImapFlow session (CONDSTORE/QRESYNC when available) fetching changes since `uidnext`/`modseq`, budgeted to fit function time, sharded by account hash over parallel cron invocations. p95 detection ~60 s (workbook p95 <10 s only met by IDLE). | `IdleWorker` implementation of `MailBackend.watch` on always-on workers with account leases; the polling path stays as fallback. |
| Webhook delivery | Event written to `events`; delivery job runs immediately in `waitUntil` and retries from `webhook_deliveries.nextRetryAt` via cron (exponential backoff 24 h). | Same, plus queue worker. |
| Send | `outbox` row, 202 + id; sent by `waitUntil` then cron retry; Idempotency-Key unique index. | Queue worker. |
| Own MTA / bounce MX / warm-up (P0 #3) | Not possible on Vercel. Magic links and platform mail go through `Mailer` provider adapter; GitHub sign-in as fallback; suppression list implemented now (kit). | Postfix + OpenDKIM adapter, VERP bounce, warm-up plan in MANUAL/ROADMAP. |
| Ops stack (Prometheus, Grafana, Loki, GlitchTip, ntfy, Gatus; P0 #12) | `/metrics` (Prometheus text) and `/health`; structured logs; static `/status` page fed by an `uptime_checks` collection written by a cron probe; Vercel Observability. | Full in-house stack on VPS. |
| Forgejo/Woodpecker/own registry (P0 #1) | GitHub Actions + GHCR (owner-approved adaptation, logged in DECISIONS). | Mirror to own registry if wanted. |

## 3. Key design rules
- Message bodies are not stored by default. `message_index` keeps metadata only; payloads for events are envelope-encrypted and expire (TTL 24 h for outbox payloads; events 30/90 days by plan). Never log bodies.
- Envelope encryption: AES-256-GCM, per-org data key wrapped by `MASTER_KEY` env (KMS interface `KeyWrapper`; OpenBao/systemd-creds on VPS later). Credentials, OAuth client secrets, webhook secrets always encrypted.
- Google: BYO OAuth client only. Enforced by a Mongo document validator + unit test (`provider==='google' => mode==='byo'`).
- Function time budget: every long operation is chunked with a cursor and resumable (backfill, sync), so Vercel duration limits (Pro: up to 300 s) never lose work.

## 4. Interfaces that move to the VPS
`MailBackend { connect, sync, listMessages, getMessage, search, send, modify, watch, close }` with implementations `gmail` (PushSource | PollSource), `graph`, `imap` (PollWatcher | IdleWatcher). `Mailer` (provider | smtp). `JobRunner` (cron+waitUntil | queue worker). `KeyWrapper` (env | OpenBao). `LeaseStore` (Mongo | Valkey). `MetricsSink`. `BlobStore` (R2). The Docker self-host image runs the same app plus an always-on worker using IdleWatcher and JobRunner(queue).

## 5. Self-host image and licences
- `Dockerfile` (Next standalone, node 24, linux/amd64+arm64) built by GitHub Actions to `ghcr.io/ahmadkhancodes/inboxwire` (registry.inboxwire.buffersoltech.com becomes a CNAME/redirect when a VPS exists). `docker-compose.yml`: app, worker, MongoDB (self-host uses Mongo to keep one data layer), Valkey optional (rate limiter uses Mongo by default). On first start prints admin URL + one-time setup token.
- **Ed25519 licence keys**: payload `{id, org, plan, issuedAt, expiresAt, features}` signed with a private key held only in the Cloud vault (env `LICENCE_SIGNING_KEY`); the public key is compiled into the image. Verification offline; expiry + 30-day grace (read-only banner); clock skew +/-24 h; tampered key rejected (tests). Issued on Stripe `invoice.paid` for self-host plans; `licence` collection; revocation list only checked when online.
- `/metrics`, `/health`.

## 6. Data model (Mongo collections; ids ULID strings; `createdAt` Date)
organizations, users, memberships (kit/Better Auth) - plan: developer|starter|growth|selfhost, dataRegion.
environments {orgId, name development|staging|production} unique(orgId,name).
api_keys {envId, prefix, hash(argon2id), scopes[read|send|admin], lastUsedAt}.
oauth_clients {envId, provider google|microsoft, clientId, clientSecretEnc, mode 'byo', pubsubTopic?, watchState} unique(envId,provider).
accounts {envId, externalId, email, provider, backend imap|gmail_api|graph, state connecting|syncing|connected|throttled|authenticationError|connectError, lastError, nextPollAt, mode push|polling} unique(envId,externalId).
account_credentials {accountId, accessTokenEnc, refreshTokenEnc, expiresAt, imapSmtpEnc}. sync_cursors {accountId, folder, uidvalidity, uidnext, modseq, historyId, deltaLink}. account_leases {accountId, workerId, leaseUntil}.
message_index {accountId, providerId, threadId, folder, date, from, subjectHash, flags} unique(accountId,providerId).
outbox {accountId, idempotencyKey, sendAt, status, attempts, payloadEnc(TTL)} unique(accountId,idempotencyKey).
webhook_endpoints {envId, url, secretEnc, events[], enabled, failingSince}. events {envId, accountId, type, payloadEnc, createdAt(TTL by plan)}. webhook_deliveries {eventId, endpointId, attempt, statusCode, latencyMs, responseSnippet, nextRetryAt, status}.
connect_links {tokenHash(_id), envId, externalId, redirectUrl, expiresAt, usedAt}.
licences, usage_daily, audit_log (append-only), deletion_records, outbound_email, email_suppression, rate_limits, uptime_checks, provider_radar.
Events: messageNew, messageMoved, messageDeleted, messageSent, messageFailed, messageBounce(v1), accountConnected, accountInitialized, accountError.

## 7. API surface (all `/v1`, Bearer key, scopes enforced; errors RFC 9457)
`GET /v1/health`; `POST /v1/connect-links` (single use, 24 h; reuse 410); `GET /connect/<token>` (hosted page) + `/api/connect/callback/{google,microsoft}`; `GET/DELETE /v1/accounts[/{id}]` (DELETE revokes tokens + deletion_record); `GET /v1/accounts/{id}/folders`; `GET /v1/accounts/{id}/messages` (cursor, q=from:/to:/subject:/after:/has:attachment); `GET .../messages/{mid}` (`?format=json|raw`, raw streams); `GET .../messages/{mid}/attachments/{aid}` (stream); `PATCH .../messages/{mid}` (flags/labels/folder); `DELETE .../messages/{mid}`; `POST .../messages/send` (to/cc/bcc, html/text, attachments, `replyTo`, `forwardOf`, `sendAt`, Idempotency-Key); webhook endpoints CRUD; `GET /v1/deliveries`, `POST /v1/deliveries/{id}/replay`, `POST /v1/deliveries/replay` (bulk); keys, oauth-clients, environments CRUD; `GET /v1/usage`; `GET /v1/accounts/stream` SSE (dashboard); `/api/hooks/*` provider inbound; `/api/cron/*`; `/api/stripe/webhook`; `/casa/kit.zip` download; `/metrics`; `/openapi.json`.

## 8. P0 map: build + acceptance (workbook order)
1. **Foundations/CI**: kit copy, Mongo db + user, GHA CI + GHCR image, OSV + ZAP baseline. *Accept:* key-authenticated `/v1/health` passes in CI; image pulled from GHCR and runs.
2. **Auth and abuse** (kit): Better Auth magic link + GitHub, orgs/roles owner/admin/developer/readonly, ALTCHA, rate limits, disposable list, keys per env hashed + scoped. *Accept:* scripted 100 sign-ups/min from one IP blocked after 5; read-only cannot create keys; read-scope key gets 403 on send; secret shown once.
3. **Own mail servers**: `Mailer` + suppression now; MTA/warm-up on VPS (ROADMAP v-later). *Accept now:* magic link delivered via provider; hard-bounce address suppressed (webhook from provider adapter) within 1 min.
4. **Connect**: connect links, hosted page, autodiscovery (MX and SRV lookup via `dns.promises`, Thunderbird ISPDB static copy, SRV; gmail.com->Google, outlook.com->Microsoft), BYO OAuth wizard with scope/redirect validation + exact gcloud commands, IMAP verify (422 on wrong password), Pub/Sub watch with polling fallback. *Accept:* reuse returns 410; wrong password 422; events <60 s polling, <10 s with topic.
5. **Backends**: Gmail API, Graph, IMAP/SMTP basic; realtime per section 2; flag/label/folder/delete detection. *Accept:* contract tests with recorded fixtures + GreenMail/Dovecot container for IMAP; p95 arrival-to-webhook <10 s on Gmail/Graph push.
6. **Read/write/send**: as API surface; raw 25 MB message streams without buffering (Web Streams). *Accept:* unified search maps to IMAP SEARCH / Gmail q / Graph $search; reply threads in Gmail (References/In-Reply-To + threadId); Idempotency-Key replays return the same queue id.
7. **Webhooks + delivery log**: HMAC-SHA256 `Inboxwire-Signature: t=<ts>,v1=<hex>`, retries 24 h backoff, auto-disable after 72 h failing + email, replay one/bulk, log with latency. *Accept:* endpoint down 1 h, all events delivered after recovery (integration test with fake clock).
8. **Dashboard**: Lines table, Line detail timeline, Ticker (SSE), Deliveries, Outbox, Keys, OAuth clients, Billing (lamp meter), usage matches meter. *Accept:* state changes show within 5 s; error explanations per state machine.
9. **Billing + licences + self-host**: Stripe products (lookup keys `inboxwire_*`: developer, selfhost_monthly 59.99, selfhost_annual 708, cloud_starter 24.99, cloud_growth_monthly 99.99, cloud_growth_annual 1043.88/yr, extra_mailbox 0.99 metered), usage metering, soft caps + 90% warning, Ed25519 licences, compose. *Accept:* tampered licence rejected; expired -> 30-day grace; fresh VM compose up -> admin URL <2 min.
10. **Compliance**: DELETE account API + 30-day post-cancel purge cron; CASA Readiness Kit zip built per release tag in CI (SAQ mapping, ZAP config+report, architecture, deletion evidence, encryption notes) served at `/casa/kit.zip`. *Accept:* deletion removes rows + revokes token and writes deletion_record; kit downloadable on every plan.
11. **Docs/SDK**: OpenAPI 3.1 from Zod, MDX reference docs where each endpoint lists the webhook it causes, `@buffersol/inboxwire-sdk` generated in CI (publish needs npm token: MANUAL).
12. **Ops stack**: `/metrics`, `/health`, uptime probe + static status page, runbooks in docs/runbooks/. Full stack deferred to VPS.
13. **Launch polish**: marketing, compare pages, zero-sub-processor page, QA.

## 9. Biggest risks
1. **IMAP realtime on serverless** (no IDLE; 60 s polling; connection caps; function limits). Mitigation: interfaces + VPS workers; honest "polling mode" label.
2. **Google restricted-scope verification/CASA** blocks any hosted Gmail beyond 100 test users: our model is BYO client; our own demo app stays in Testing mode. Owner steps in MANUAL_STEPS.
3. Own-MTA deliverability not testable on Vercel.
4. Vercel Hobby limits until Pro.
