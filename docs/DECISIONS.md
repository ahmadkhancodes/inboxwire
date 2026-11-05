# Decisions

Standing decisions are in docs/factory/BATCH1_PLAN.md (Mongo instead of Postgres, Better Auth, Stripe first, Mailer interface, Vercel-first, keep 3 deployments).

## 5 Nov 2026 (Phase 0)
- Design: brief's switchboard direction adopted as-is (docs/DESIGN.md); dark palette is a deliberate override of the playbook's dark whitelist.
- IMAP is cron-polled (1 min) on Vercel; IDLE moves behind `IdleWatcher` on the VPS.
- Gmail push uses a Pub/Sub push subscription (OIDC-verified) to a Vercel route instead of a pull worker.
- CI/registry: GitHub Actions + GHCR instead of Forgejo/Woodpecker until a VPS exists.
- Self-host stack uses MongoDB (not Postgres) to keep one data layer.
- Own MTA (P0 #3) deferred to VPS; `Mailer` provider adapter + suppression list now.

## 5 Nov 2026 (M1 kit copy)
- Kit copied from postslot main @ 03398f3 (kit-v1 tag not yet created). Plans: free "Developer", starter "Cloud Starter" (monthly only), growth "Cloud Growth" (monthly + annual $1,043.88), selfhost (monthly $59.99 + annual $708). Extra mailbox $0.99 is a metered/usage item handled in billing later.
- Meters: mailboxes, environments, seats, log_days, events. Assumptions not in the brief: Developer tier delivery-log retention 7 days; seats 3/3/10 (internal limits, not marketed).
- Landing follows docs/SECTION_PLAN.md; no testimonial/case-study block until a real design partner exists.
- Wordmark: "Inboxwire" + amber "by BufferSol" jack tab (brand/wordmark.tsx).
- 5 Nov (wind-up): extra-mailbox price is a licensed per-unit price (quantity = overage mailboxes) instead of a Stripe meter, for simplicity; revisit if proration needs change. Vercel env `DB_DRIVER=memory` is informational only (the kit picks memory when MONGODB_URI is absent). Accent amber pending PALETTE_REGISTRY check.

## 5 Nov 2026 (M1-C)
- **Extra mailbox price lives in `product.extraMailbox`** (99 cents, lookup key `inboxwire_extra_mailbox_monthly`), applies on Cloud Growth only (above 100). Starter has no extras, so the slider never shows Starter + extras undercutting Growth. Competitor figures live in `src/config/competitors.ts` with the read date (3 Nov 2026); Nylas is included because its tiers are in docs/brief.md (Free 5, Essentials $15/10, Pro $49/25 + $2 each).
- **/status** reads `uptime_checks` (Db interface, TTL 100 days). Probe job `uptime-probe` runs every minute from the Cloudflare cron but stores a sample only every 5 minutes (about 26k rows per 90 days per target set). Daily Vercel cron kept as a fallback.
- **/casa kit download** is not live yet (kit is generated per release tag in M4); the page says so rather than linking a dead file.
- Legal copy drafted for a metadata-only mail API; not lawyer-reviewed, flagged in MANUAL_STEPS section E.

## 5 Nov 2026 (M2)
- **mailcore lives in `src/lib/mailcore`** (workspace removed); its 17 tests run from `tests/unit/mailcore.test.ts` in `npm test`.
- **API keys reuse Better Auth org keys** (existing Settings, API keys UI) instead of a separate `api_keys` collection with argon2id; `authEnv()` maps the key's org to an environment (`x-environment` header, default `production`, created on demand). Per-key scopes and a dedicated per-environment key UI come with M4 Keys screen. `/v1/*` is a rewrite to `/api/v1/*`.
- **M2 collections** are behind the Db interface (`src/lib/db/mail-types.ts`, memory + Mongo drivers): environments, oauth_clients, accounts, account_credentials, sync_cursors, connect_links, org_keys. Indexes are in `ensureMailIndexes` (run by `npm run db:indexes`). `account_leases` is deferred to the VPS worker.
- **Envelope encryption**: per-org 32 byte data key wrapped by `MASTER_KEY` (base64, required in production; dev/test derive one from BETTER_AUTH_SECRET). Credentials, tokens and OAuth client secrets are only stored as AES-256-GCM blobs. Owner step: generate `MASTER_KEY` once (`openssl rand -base64 32`) and set it in Vercel before real mailboxes connect; losing it makes stored credentials unreadable.
- **Connect link** stores only the sha256 of the token. Single use is an atomic `consumeConnectLink`; IMAP verifies the login first so a typo (422) does not burn the link. OAuth state (hashed) and PKCE verifier live on the link, are single use, and are bound to the provider. Expired links are kept 7 days (TTL) so the page can say "expired".
- **BYO OAuth only** for Google and Microsoft (no shared client). Pub/Sub topic is optional: without it Gmail runs in polling mode.
- **Hook auth**: Gmail push needs a per-env `?token=` (HMAC-style hash of MASTER_KEY + envId) and, when the client has a push service account, a verified Google OIDC JWT (RS256, issuer, audience = hook URL, service account email). Graph uses `clientState` = the same per-env token and the `validationToken` handshake. Hooks answer 2xx for unknown mailboxes so providers do not retry forever.
- **IMAP send is not wired**: no SMTP library is in the allowed set, so `ImapBackend.send` takes an injected `SmtpSend` and throws `smtp_not_configured` until M3 picks an approach (raw SMTP client written in-repo, or the provider Mailer). Gmail and Graph send work.
- **`poll-imap` cron** polls every account with `mode=polling` (IMAP plus Gmail/Graph without push), claims accounts by pushing `nextPollAt` out 2 minutes, supports sharding and a 45 s budget. Push accounts get their watch renewed in M3 (`watch.expiresAt` is stored, renewal job not built yet).
- Gmail/Graph backends are verified against hand-written fakes, not recorded provider fixtures or a Dovecot container; contract fixtures remain a M3/M5 item.
