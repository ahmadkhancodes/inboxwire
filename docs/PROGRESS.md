# Progress: Inboxwire by BufferSol

## State (5 Nov 2026)
- Phase 0 done and merged (PR #1): DESIGN, SECTION_PLAN, ARCHITECTURE, ROADMAP, MANUAL_STEPS, design mock (docs/design/mock.html + mock-1440/375 png), competitor refs in docs/design/refs/.
- Waiting for: orchestrator design approval and "kit-v1 ready".
- Next: attach postslot read-only, copy kit per KIT_COPY.md, apply DESIGN.md tokens, create Mongo db/user, Stripe products, Vercel project, then M1.

## Update (5 Nov 2026, later)
- Design APPROVED by orchestrator. Infra notes: use VERCEL_TOKEN_NEW_ACCOUNT via CLI/REST only (team ahmad-code; the Vercel MCP connector is the old account); build on DB_DRIVER=memory until MONGODB_URI arrives.
- Built `packages/mailcore` (pure TS, no UI, 17 tests green): MailBackend/Watcher interfaces, unified search parser + Gmail/IMAP/Graph translators, HMAC webhook signing + retry schedule, Ed25519 licence issue/verify (grace, skew, tamper), AES-256-GCM envelope crypto, provider autodiscovery. To be moved into the app after kit-v1 copy.
- Still waiting for "kit-v1 ready" before any app code.
