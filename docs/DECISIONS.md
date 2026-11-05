# Decisions

Standing decisions are in docs/factory/BATCH1_PLAN.md (Mongo instead of Postgres, Better Auth, Stripe first, Mailer interface, Vercel-first, keep 3 deployments).

## 5 Nov 2026 (Phase 0)
- Design: brief's switchboard direction adopted as-is (docs/DESIGN.md); dark palette is a deliberate override of the playbook's dark whitelist.
- IMAP is cron-polled (1 min) on Vercel; IDLE moves behind `IdleWatcher` on the VPS.
- Gmail push uses a Pub/Sub push subscription (OIDC-verified) to a Vercel route instead of a pull worker.
- CI/registry: GitHub Actions + GHCR instead of Forgejo/Woodpecker until a VPS exists.
- Self-host stack uses MongoDB (not Postgres) to keep one data layer.
- Own MTA (P0 #3) deferred to VPS; `Mailer` provider adapter + suppression list now.
