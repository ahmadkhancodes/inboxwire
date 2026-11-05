# Progress: Inboxwire by BufferSol

## State (5 Nov 2026)
- Phase 0 merged (design, architecture, roadmap, manual steps, mock). Design approved by orchestrator.
- `packages/mailcore` merged: pure TS library (interfaces, search translators, webhook signing, Ed25519 licence, crypto, autodiscovery), 17 tests.
- M1 in progress: kit copied (postslot @ 03398f3), tokens/fonts/product config applied, landing + compare (EmailEngine, Nylas, Unipile) + pricing copy rewritten. lint/typecheck/45 tests/build green on DB_DRIVER=memory.
- Remaining for M1: Stripe test catalogue (connector), Vercel project + deploy (VERCEL_TOKEN_NEW_ACCOUNT, team ahmad-code), /status page, QA screenshots in docs/qa/, legal copy pass.
- Blocked/waiting: MONGODB_URI (orchestrator), STRIPE_SECRET_KEY_TEST, RESEND_API_KEY, Cloudflare keys.
