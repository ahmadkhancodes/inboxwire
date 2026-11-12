# ROADMAP (mapped to docs/brief.md P0 numbering)
- **M1 Landing, pricing, auth, billing, legal, deploy** (P0 #1, #2 partly, #9 billing part): kit copy, tokens, landing + pricing + compare pages, Better Auth, orgs/envs/API keys, Stripe products, legal, Vercel deploy, GitHub Actions CI.
- **M2 Connect + backends** (P0 #3 mail via Mailer, #4, #5): OAuth wizard, connect links + hosted page, Gmail/Graph/IMAP backends, realtime hooks, cron polling, cron worker.
- **M3 API + webhooks** (P0 #6, #7): read/search/send, outbox, signed webhooks, delivery log, replay, auto-disable, OpenAPI.
- **M4 Dashboard, licences, self-host, compliance** (P0 #8, #9, #10, #11, #12 partial): Lines/Ticker/Deliveries/Outbox/Keys/OAuth/Billing screens, Ed25519 licences, Docker image to GHCR, CASA kit, deletion API, metrics, status page, SDK, docs.
- **M5 QA + launch** (P0 #13): Playwright 375/1440 light in docs/qa/, Lighthouse 90+, design scorecard, launch checklist, runbooks.
- **Deferred to VPS** (not buildable on Vercel): own Postfix/OpenDKIM/Dovecot + warm-up, IMAP IDLE workers, full Prometheus/Grafana/Loki/ntfy/Gatus stack, Forgejo/Woodpecker, pgBackRest (Mongo Atlas backups instead).
- v1/v2 per brief "Later" list; not in this build.
