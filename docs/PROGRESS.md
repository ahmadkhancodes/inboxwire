# Progress: Inboxwire by BufferSol

## State at wind-up (5 Nov 2026, owner paused; resume 6 Nov 10:00 PKT)
- **main** has everything: Phase 0 docs (PR #1, #2), `packages/mailcore` (PR #3), M1 part 1 (PR #4: kit copy, tokens, landing, pricing, compare). No open PRs. Working branch for this note: `docs/wind-up`.
- **LIVE:** https://inboxwire.vercel.app (Vercel project `inboxwire`, id prj_PLdoIiYkPIIlTQGEPybawCJRsG4m, team ahmad-code). Runs on the memory DB driver and console mailer (stubs). Only 1 deployment exists so far; run `scripts/deploy.sh inboxwire` (needs `VERCEL_TEAM_ID=team_rbOXRpz6zmliuGsw8eIh3YDw`) and it prunes to 3.
- **Vercel env set (production):** APP_NAME, NEXT_PUBLIC_APP_URL (=https://inboxwire.vercel.app), BETTER_AUTH_SECRET, CRON_SECRET, ALTCHA_HMAC_KEY, MAIL_PROVIDER=console, MAIL_CONSOLE_PRINT=1, MAIL_FROM, DB_DRIVER, STRIPE_WEBHOOK_SECRET. NOT set: MONGODB_URI/MONGODB_DB, STRIPE_SECRET_KEY, RESEND_API_KEY, ADMIN_EMAILS.
- **Stripe (test):** 4 products, 6 prices, webhook endpoint created via connector; ids in docs/STRIPE.md. Customer Portal still has to be enabled once (https://dashboard.stripe.com/test/settings/billing/portal, owner step).
- **Checks:** lint (1 kit warning), typecheck, 45 unit tests, build, GitHub CI all green. mailcore tests now run in `npm test`.
- Kit source: postslot @ 03398f3. Tag kit-v1 now = 35bdaa5 (only KIT_COPY rule text, tag workflow, deploy.sh changed); deploy.sh updated here to match.

## 5 Nov 2026 (M2): connect + backends code done, not deployed
- **Moved** `packages/mailcore` to `src/lib/mailcore` (17 tests now in `tests/unit/mailcore.test.ts`).
- **Data:** environments, oauth_clients, accounts, account_credentials, sync_cursors, connect_links, org_keys behind the Db interface (memory + Mongo, `src/lib/db/mail-*.ts`); indexes in `ensureMailIndexes` via `npm run db:indexes`. Secrets use envelope encryption (`src/lib/secrets.ts`, needs `MASTER_KEY`, see DECISIONS).
- **Connect:** `POST /v1/connect-links` (API key, 24 h, single use, reuse 410), hosted `/connect/<token>` + `/connect/done` (autodiscovery MX/SRV/ISPDB hints, Google/Microsoft/IMAP), OAuth start + callback with state and PKCE, IMAP verify (422). BYO OAuth wizard at Settings, OAuth clients (exact redirect URIs, scopes, gcloud commands, encrypted secrets).
- **Backends:** Gmail (googleapis), Graph, IMAP (imapflow) behind `MailBackend` in `src/lib/backends`; hooks `/api/hooks/gmail|graph/<envId>` with token, OIDC JWT, clientState and validationToken checks; cron job `poll-imap` (also in wrangler JOBS); licences in `THIRD_PARTY.md`.
- **Checks:** lint (2 old warnings), typecheck, 113 unit tests, build, 10 e2e all green. No deploy. Playwright screenshots of the new pages are NOT taken yet (do with the M2 deploy).
- **Left for M3 / owner:** set `MASTER_KEY` in Vercel and run `npm run db:indexes` once Mongo exists; watch renewal cron (Gmail 7 d, Graph ~3 d) and subscription id capture for Graph; IMAP SMTP send; recorded provider fixtures + Dovecot contract test; env-scoped key scopes. Next is **M3: read/search/send API, outbox + Idempotency-Key, webhook endpoints with signed delivery, delivery log/replay, OpenAPI from Zod**.

## 5 Nov 2026 (M1-C): M1 code done, deploy pending
- Added `/status` (uptime_checks via Db interface, cron job `uptime-probe`, in wrangler JOBS and a daily Vercel cron), `/casa` (kit landing + client-side calculator), pricing mailbox slider (prices from product.ts + src/config/competitors.ts, dated 3 Nov 2026, Nylas included), legal copy rewritten for Inboxwire (placeholders listed in MANUAL_STEPS section E), screenshots in docs/qa/2026-11-05, docs/design-qa.md (43/50), Playwright e2e in tests/e2e/pages.spec.ts. Fixed mobile header overflow and dead footer link.
- Checks green: lint (2 existing warnings), typecheck, 56 unit tests, build, 7 e2e. Not deployed (orchestrator deploys). Next: deploy, then M2 (item 5 below). Run `npm run db:indexes` once Mongo is set so `uptime_checks` gets its indexes.

## Waiting on the orchestrator / owner
MONGODB_URI (DB `inboxwire`, user `inboxwire-app`), STRIPE_SECRET_KEY_TEST, RESEND_API_KEY, CLOUDFLARE_SAAS_TOKEN + ACCOUNT_ID (custom domain inboxwire.buffersoltech.com, cron worker). Owner-only: docs/MANUAL_STEPS.md (Google Cloud OAuth + Pub/Sub, Entra app).
New KIT_COPY rule to verify: the primary colour family must not repeat another BufferSol product (orchestrator keeps PALETTE_REGISTRY.md). Inboxwire's accent is amber #F5A524 ("lamp"). Ask the orchestrator to confirm it is free; if not, only the `--accent-500/600` values in globals.css change.

## Next steps tomorrow (in order)
1. Read this file, docs/DECISIONS.md, docs/ARCHITECTURE.md, docs/ROADMAP.md. `git pull`, `npm ci`.
2. Confirm palette with the orchestrator (above). If MONGODB_URI has arrived: set MONGODB_URI/MONGODB_DB in Vercel, remove DB_DRIVER, run `npm run db:indexes`, redeploy.
3. If STRIPE_SECRET_KEY_TEST has arrived: set STRIPE_SECRET_KEY in Vercel; test checkout with card 4242; extend checkout to add the extra-mailbox price when over the plan allowance (lookup key inboxwire_extra_mailbox_monthly).
4. Finish M1: /status page (static, fed by an uptime_checks collection + cron probe), `/casa` page + calculator stub, pricing page mailbox slider (our bill vs emailengine.app $1,450/yr and Nylas Pro, dated 3 Nov 2026), legal copy pass (replace {{jurisdiction}}, {{registered address}} with owner values or leave placeholders flagged), run `npm run screenshots` into docs/qa/ (375/1440, light/dark), write docs/design-qa.md scorecard, Playwright e2e, deploy, update this file, PR + merge, one-line message to the orchestrator.
5. DONE (see M2 entry above): M2 (ARCHITECTURE.md §8 items 4, 5): move packages/mailcore into `src/lib/mailcore` (or keep as workspace import via tsconfig paths), then build: Mongo collections + indexes (environments, api_keys, oauth_clients, accounts, account_credentials, sync_cursors, connect_links), `POST /v1/connect-links` (single use, 24 h, reuse 410), hosted `/connect/<token>` page with autodiscovery, BYO OAuth client wizard, Gmail/Graph/IMAP backend adapters (googleapis / @microsoft/microsoft-graph-client / imapflow, record licences in THIRD_PARTY.md), push hooks `/api/hooks/gmail|graph/<envId>`, cron polling job via Cloudflare cron worker (`infra/cron-worker`).
6. M3 (items 6, 7): read/search/send API under /v1, outbox + Idempotency-Key, webhook endpoints + signed delivery (use mailcore webhook.ts), delivery log, replay, auto-disable at 72 h, OpenAPI from Zod.
7. M4 (items 8-12): dashboard screens (Lines, Ticker via SSE, Deliveries, Outbox, Keys, OAuth clients, Billing lamp meter), Ed25519 licences (mailcore licence.ts) issued on Stripe invoice.paid for selfhost, Docker image + GHCR workflow, CASA kit zip, deletion API + 30-day purge, /metrics, SDK, docs.
8. M5: QA, Lighthouse 90+, scorecard, launch checklist, runbooks.
9. After each milestone: lint + typecheck + tests + build, deploy, `scripts/vercel-keep-latest-3.sh inboxwire`, update this file, PR, merge, one-line `send_message` to session_01Mn59CnGYFsETSnQdPMcWxP.
Tooling notes: no `rsync` in the container (use tar); Vercel MCP connector is the OLD account (use REST/CLI with VERCEL_TOKEN_NEW_ACCOUNT); GitHub PR tools need owner+repo; kit-v1 clone is at /home/user/postslot (re-clone if the container is new).
