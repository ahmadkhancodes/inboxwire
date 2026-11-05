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
