# Inboxwire pre-launch review (M5)

Date: 6 Nov 2026. Reviewer: Claude Opus 5.5 (code read, not summaries). Scope: the 8 areas in the M5 task. Nothing was deployed.
Regression tests for every fixed item are in `tests/unit/m5-review.test.ts`. Each one fails on the pre-review code and passes now.

Severity:
- **P0**: a security incident, data loss or a false public promise. Must be fixed before launch.
- **P1**: real harm, but narrow or with a workaround. Fix soon.
- **P2**: hardening or cleanup.

## P0: all fixed in this change

| # | Where | Failure scenario | Fix |
|---|---|---|---|
| P0-1 | `src/lib/connect/complete.ts` `completeImap`; `src/lib/backends/index.ts` `backendFor` (IMAP branch); `src/app/api/connect/[token]/imap/route.ts` | **SSRF from an unauthenticated page.** Anyone holding a connect link (an end user of the customer) can enter IMAP host `169.254.169.254`, `127.0.0.1`, `10.x` or `mongo:27017`. Our server then dials it, and the 422 `reason` (`authentication` vs `connection`) works as a port scanner. On self-host this reaches the Mongo container and the private network. The SMTP host was stored without any check and dialed at send time. | New `src/lib/security/net.ts`. `assertPublicHost` rejects loopback, private, link-local/metadata, CGNAT, ULA and IPv4-mapped literals, single-label names (docker/k8s services) and `.local`/`.internal`/`.lan`. It also checks every DNS answer. Connect returns 422 `mail_host_not_allowed` before dialing, and the link is not burned. Both hosts are checked again on every poll and send, because DNS can change after connect. Self-hosters with an on-prem mail server set `ALLOW_PRIVATE_NETWORK_TARGETS=1`. |
| P0-2 | `src/lib/webhooks/outbound.ts` `isSafeWebhookUrl`, `attemptDelivery` | **Read-SSRF through webhooks.** The URL check was string-only. `https://mongo/`, `https://internal-svc:8443/` or a public name that resolves to `10.0.0.5` passed. The first 300 characters of the response are shown in the delivery log (`/v1/deliveries`), so internal responses leak to the customer. The response body was also read fully (memory). | `isSafeWebhookUrl` uses `isPublicHostname`, which blocks single labels, CGNAT, IPv6 literals and URLs with credentials. `attemptDelivery` runs `assertPublicHost` on every attempt (`lastError: unsafe_target`, nothing is sent). The snippet reader stops after 2 KB. |
| P0-3 | `src/lib/backends/imap.ts` `imapflowFactory` | **IMAP password in cleartext.** With `secure: false` (port 143), imapflow upgrades to STARTTLS only if the server advertises it. That advertisement arrives in cleartext and can be stripped, after which LOGIN is sent in clear. SMTP already used `requireTLS`. | `doSTARTTLS: true` whenever implicit TLS is off, so the connection fails instead of downgrading. |
| P0-4 | `src/lib/backends/index.ts` `syncAccount` | **Lost `messageNew` webhooks.** The cursor was saved before any event was queued, and then each event was delivered inline (10 s timeout per endpoint). With 100 new messages and a slow receiver, the function hits `maxDuration` (60 s) after the cursor moved: every event not yet queued is gone forever. A DB error on one `createDelivery` had the same effect. | All events are queued first (`emitEvent(..., { attempt: false })`). Then the cursor moves. Then `deliverQueued` delivers inside a 20 s budget, and the rest goes to the `webhook-retries` cron. A crash between queueing and saving the cursor re-reads the same changes (at-least-once, receivers dedupe on `X-Webhook-Id`). |
| P0-5 | `src/app/(marketing)/page.tsx:87` | **False promise:** "no email-sending services, no analytics trackers". The app calls Resend (`src/lib/mail/transports.ts`) and loads `@vercel/analytics`. | Copy now says mail never goes to AI APIs, ad networks or analytics tools, and points to the subprocessor page. |
| P0-6 | `src/config/product.ts` `subProcessors`; `src/content/legal/subprocessors.ts` | **Sub-processor list did not match the code.** It listed an anonymous "Email delivery provider" instead of Resend, did not mention Vercel Web Analytics, and claimed a signed DPA with each provider (not verified). | Resend Inc. named (platform email only). Vercel's purpose now includes cookieless analytics. The unverified DPA sentence was removed. The owner must confirm the DPAs (MANUAL_STEPS G). |
| P0-7 | `src/config/product.ts:58-59` | **Legal pages render `{{jurisdiction}}` and `{{registered address}}`.** The DPA names a processor with no address. | Cannot be fixed in code (owner data). **Launch blocker**, listed in MANUAL_STEPS E and G. |
| P0-8 | `vercel.json`, `infra/cron-worker` | **Without the Cloudflare cron worker, the mail promise is broken on the hosted app.** Vercel runs each job once a day. IMAP polling (`poll-imap`) never runs, Gmail/Graph accounts in polling mode never sync, outbox retries and webhook retries wait up to 24 h. Docs promise 30 s backoff. | Ops, not code: the worker (per-minute, `JOBS` already lists every job) must be deployed before launch. **Launch blocker**, MANUAL_STEPS G. |

## P1

Fixed in this change (small and safe):
- **P1-1 IMAP connect could take over another end user's mailbox row.** `src/lib/connect/complete.ts`. The typed email is not proven by an IMAP login on a server the user chooses. Before: end user B with a link for `externalId=user-b` connects `ceo@corp.test` with their own IMAP server. The existing Gmail account of user A is rewritten to IMAP, with B's credentials and B's externalId. Now this is a 409 `mailbox_already_connected` unless the link's externalId (or, without one, the email) matches the existing row.
- **P1-2 Keys were not bound to an environment.** The security page said they were. Any key could pick `x-environment: production`, so a leaked development key reached production mailboxes. Changes:
  - Keys now carry `metadata.environment` (picker on Settings, API keys; production by default).
  - `authEnv` returns 403 `environment_not_allowed` on a mismatch and defaults to the key's environment.
  - Keys made before M5 keep "any environment".
  - Files: `src/lib/connect/env.ts`, `src/lib/auth/scopes.ts`, `src/lib/auth/session.ts`.
- **P1-3 Org deletion left Google tokens valid and push watches running.** `DELETE /api/account` dropped the rows without revoking anything. Now `deleteOrgMailboxes` (`src/lib/accounts/deletion.ts`) runs the same revoke + delete + `deletion_record` flow for every mailbox first (reason `org_deleted`).
- **P1-4 Graph hook trusted a subscription id from any environment.** `src/lib/hooks/handle.ts`. A notification on env B's hook with B's clientState could trigger a sync of env A's account. The account's `envId` must now match the hook.
- **P1-5 Header injection through threading.** `src/lib/backends/mime.ts`. The parent's Message-ID (from a received, attacker-controlled message) was copied into `In-Reply-To`/`References` without stripping CR/LF.
- **P1-6 Retention copy did not match the code.** Privacy and security said "queue payloads expire after 24 hours". The code drops the payload when the send is terminal and keeps the record for 7 days. Privacy said "delivery logs kept for your plan's period", but the TTL is 90 days for every plan. Copy now matches the code. The security page's "we restrict outbound network access" was replaced by what the code does.

Closed in the launch-hardening pass (10 Nov 2026). Regression tests: `tests/unit/m6-hardening.test.ts` (each fails on the code before the change):
- **P1-8 FIXED** Webhook deliveries now have a lease. `Db.claimDelivery` (memory + Mongo, atomic on status and `nextAttemptAt`) runs first in `attemptDelivery`; the loser skips, and a finished delivery is never claimable. A crashed worker's delivery is due again after 2 min. Receivers still dedupe on `X-Webhook-Id` (at least once).
- **P1-9 FIXED** `Db.claimSync`/`releaseSync` give each account one sync at a time. A refused caller marks the account dirty and the holder syncs once more before releasing (max 2 extra rounds), so a push that lands mid-sync is not left waiting.
- **P1-10 FIXED (bounded, still at-least-once)** Gmail requests time out at 30 s, the Graph client has a 30 s budget, OAuth token/userinfo calls 15 s, Resend 10 s. A hung provider call now ends before the 60 s function limit and the 2 min outbox lease. A send that the provider accepted but whose answer was lost can still be retried; this stays documented as at-least-once.
- **P1-11 FIXED** `authEnv` refuses to create an environment beyond the plan (`402 environment_limit`; Developer/Starter 1, Growth 3). Existing environments stay reachable. The delivery-log TTL follows the plan's `log_days` (7/30/90).
- **P1-12 FIXED** `/api/oauth-clients` takes `environment` (GET/DELETE `?environment=`, PUT body), and Settings, OAuth clients has an environment picker.
- **P1-13 FIXED** After inserting a new mailbox on a hard-capped plan, the org's mailboxes are ranked by (createdAt, id); the one past the allowance is removed and answers 402 `mailbox_limit`. Cost: the connect link of the loser is already used and must be reissued.
- **P1-14 FIXED** `size="sm"` buttons are `min-h-11` on touch widths (`sm:min-h-8` from 640 px).
- **P1-15 FIXED (by policy)** Terms now say a licence already issued stays valid to its expiry plus the 30 day grace after a refund, and that licences are not revoked remotely.

Money paths, checked again (all in `tests/unit/m6-hardening.test.ts` and `billing.test.ts`):
- Every handled event recomputes the entitlement from Stripe (`customer.subscription.*`, `invoice.*`, `checkout.session.completed`, `charge.refunded`), so order does not matter; the event id is stored only after success (a failure returns 500 and Stripe retries); duplicates answer `duplicate: true`. Unknown event types answer 200, are recorded and logged at debug. Plans are granted only by the webhook: the checkout redirect only makes the billing page poll.
- **Fixed:** `payment_intent.succeeded` that arrives after the full refund of the same payment (out of order) used to grant the lifetime plan for money already returned. It now checks the charge on Stripe and skips the grant (if Stripe cannot be reached it grants as before and a later `charge.refunded` revokes).
- Left as is, by decision C-27: any full refund on a customer cancels that customer's app subscriptions.

Email: every request path that sends mail (magic link, team invite, endpoint-disabled notice) now uses `sendMailSafe`: a Resend rejection (bad address, 429, outage, timeout) logs a short code, never returns provider text, and no longer turns the request into a 500. One bounced owner does not stop the others.

Still open:
- **P1-7 `MASTER_KEY` has no rotation and no backup story.** `src/lib/secrets.ts`. If the key is lost or changed:
  - every stored token, IMAP password and BYO client secret becomes undecryptable;
  - every cursor is rejected;
  - every Gmail `?token=` and Graph `clientState` stops matching (push hooks 401 until watches are recreated).
  - Why open: a key id prefix plus a re-wrap job changes the format of every stored secret and must be rehearsed against the production database with a backup, and the key backup itself is a human step. Not safe to ship untested and unattended. Until then: back the key up offline (MANUAL_STEPS G4).

## P2
- DNS rebinding between our check and the socket's own lookup is still possible for IMAP/SMTP and webhooks. A full fix pins the resolved IP (connect by IP with SNI = host).
- **DONE (m9: harden deletion hash, health, provider errors, logs, CSV)** `deletion_record.emailHash` was an unsalted SHA-256 of the address, which a dictionary can reverse. Use an HMAC with a server key.
- **DONE** `withBackend` returned the provider's error text (`provider_error.reason`, 200 chars) to API clients. No token was seen in these messages, but now maps to codes (`authentication`, `rate_limited`, `timeout`, `connection`, `unknown`).
- **DONE** `/api/health` was liveness only; it now probes the database with a 3 s timeout and reports `up/slow/down` plus configured/not configured for billing and mail, no details. Still 200 when the database is down (Docker HEALTHCHECK must not restart the app for Mongo); `?strict=1` answers 503 for monitors. Was: The database is probed separately by `uptime-probe`. Keep it that way for the Docker HEALTHCHECK (restarting the app does not fix Mongo), but name it in the runbook.
- **DONE** `confirm-dialog.tsx` closed on backdrop click while `busy`.
- **DONE** `docs/selfhost.md` "run several replicas" vs compare page "horizontal scaling planned": align.
- **DONE** Docs mentioned `MS_CLIENT_ID`/`MS_CLIENT_SECRET`, which no code reads (Microsoft is BYO per environment).
- `tests/unit/m4-live.test.ts` (SSE timing) failed once under full-suite load and passed on 3 reruns: flaky timing, pre-existing.

## Verified as correct (no change needed)
- **Connect links:** the token is 32 random bytes and only its SHA-256 is stored. Expiry is 24 h, consumption is single use and atomic (`consumeConnectLink` filter on `usedAt: null`), reuse returns 410. `redirectUrl` must be https.
- **OAuth:** state is 24 random bytes (stored hashed, bound to the provider, burned on deny). PKCE is S256. The redirect URI is built from `appUrl()`, never from input. BYO client secrets are encrypted per org and never returned (`hasSecret: true`).
- **Cursors** are HMAC-signed and bound to account, folder and query, so a Graph nextLink is never client-controlled.
- **Tenant isolation:**
  - Every `/v1` account route goes through `loadAccount` (env check, 404). Deliveries, webhooks and outbox filter by org and env. Dashboard routes use `requireOrg` + `requirePermission`.
  - The admin API is behind `ADMIN_EMAILS` (magic-link sign-in proves the email).
  - `/metrics` is closed without `METRICS_TOKEN` in production. `/api/dev/*` returns 404 unless `E2E_OUTBOX=1`. Cron routes need `CRON_SECRET`.
- **Hooks:** Gmail requires a per-env token, plus an RS256 OIDC JWT check (issuer, audience, expiry, service account) when configured. Graph checks `clientState` per item, and `validationToken` is echoed as `text/plain`.
- **Stripe webhook:** the signature is checked on the raw body, the event id is recorded only after success, the entitlement is recomputed from Stripe, and other apps' customers are ignored. Plans come only from Stripe or a signed licence, never from a client flag. `effectivePlan` checks expiry at read time.
- **Licences:** Ed25519, offline verification with 1 day skew and 30 day grace, private key only in env.
- **Webhook signing:** HMAC-SHA256 over `t.body` with a 5 min tolerance, and the event id is the same on retry and replay. The 72 h auto-disable and owner email are correct.
- **Logs:** `log` scrubs token/secret/password/email keys, and message bodies are never logged.
- **Claims:**
  - Prices match `product.ts` and the brief. $708 is 49% of $1,450 (emailengine.app, dated 3 Nov 2026).
  - The CASA copy does not promise verification. The security page says there is no SOC 2 and no BAA.
- **Accessibility:**
  - Global `:focus-visible` ring, and native `<dialog>` (focus trap, Escape, focus return).
  - Reduced motion is handled.
  - Body-text contrast is at least 4.5:1 on every surface in both themes. The tightest is muted on sunken in light mode, 4.62.

## Still open after the m9 pass (one-line reasons)
- P1-7 `MASTER_KEY` rotation: needs a rehearsal against a production backup.
- P2 DNS rebinding pinning for IMAP/SMTP/webhooks: needs connecting by IP with SNI, a transport change to test against live servers.
- P2 flaky `m4-live` SSE timing test: did not fail in this pass's runs.
- Log scrubbing now also redacts e-mail addresses inside string values and nested objects (`tests/unit/m9-handy.test.ts`).
