# Manual steps for Inboxwire by BufferSol (owner-only; deep link first). Nothing blocks the build: stubs are used until done.

## A. Google Cloud: OAuth client for our own demo/test (needed to test Gmail end to end)
1. https://console.cloud.google.com/projectcreate : project name `inboxwire-dev` (under buffersoltech.com org if present).
2. https://console.cloud.google.com/apis/library/gmail.googleapis.com : Enable Gmail API. Then https://console.cloud.google.com/apis/library/pubsub.googleapis.com : Enable Cloud Pub/Sub API.
3. https://console.cloud.google.com/auth/branding : app name `Inboxwire by BufferSol`, support email contact@buffersoltech.com, home page https://inboxwire.buffersoltech.com, privacy https://buffersoltech.com/privacy (replace when ready), authorised domain `buffersoltech.com`. Audience: External, **Testing** (up to 100 test users; add your Gmail as test user).
4. https://console.cloud.google.com/auth/scopes : add `https://www.googleapis.com/auth/gmail.readonly`, `gmail.modify`, `gmail.send`, `openid`, `email`.
5. https://console.cloud.google.com/auth/clients : Create client, type Web application, name `inboxwire-cloud`. Authorised redirect URIs: `https://inboxwire.buffersoltech.com/api/connect/callback/google` and `http://localhost:3000/api/connect/callback/google`. Paste back: client ID and secret into Vercel env `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (or give to the orchestrator as environment variables).
6. Pub/Sub: https://console.cloud.google.com/cloudpubsub/topic/list : create topic `inboxwire-gmail`; Permissions: add principal `gmail-api-push@system.gserviceaccount.com` role Pub/Sub Publisher. Subscriptions: create **push** subscription to `https://inboxwire.buffersoltech.com/api/hooks/gmail/<envId>` with authentication enabled (service account of your choice, audience = that URL). The product's OAuth wizard prints these exact gcloud commands for customers.
Done when: connecting your Gmail from the hosted connect page returns a `messageNew` webhook.

## B. Microsoft Entra app registration
1. https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/CreateApplicationBlade/isMSAApp~/false : name `Inboxwire by BufferSol (dev)`, supported accounts: Multitenant + personal.
2. Redirect URI (Web): `https://inboxwire.buffersoltech.com/api/connect/callback/microsoft`.
3. API permissions (delegated, Microsoft Graph): `Mail.ReadWrite`, `Mail.Send`, `offline_access`, `openid`, `email`, `User.Read`. Certificates & secrets: new client secret. Microsoft is bring-your-own per environment: paste the Application (client) ID and secret in Settings, OAuth clients (no env var is read).
Done when: Outlook.com mailbox connects and Graph notification hits `/api/hooks/graph/<envId>`.

## C. Accounts and keys (already tracked by orchestrator)
`STRIPE_SECRET_KEY_TEST`, `RESEND_API_KEY`, `CLOUDFLARE_SAAS_TOKEN`, `CLOUDFLARE_SAAS_ACCOUNT_ID`; Vercel Pro upgrade before real money (https://vercel.com/account/billing); npm token for `@buffersol/inboxwire-sdk` (https://www.npmjs.com/settings/~/tokens); DNS record `inboxwire` CNAME to Vercel for the subdomain.

## D. Later (not blocking MVP)
- **Google verification + CASA** for any production Gmail with restricted scopes on OUR app: only if we choose to publish our own app; default policy is customers bring their own client, so skip. If chosen: https://console.cloud.google.com/auth/verification then a lab (Secusy/TAC, AL1 $499-$855 est.).
- Microsoft publisher verification (only for multi-tenant shared app, v2).
- VPS handover: IMAP IDLE workers, Postfix/DKIM (DNS: SPF, DKIM, DMARC p=none, MTA-STS, TLS-RPT for buffersoltech.com), port 25 unblocking request to Hetzner/OVH.

## E. Owner values needed (legal copy placeholders)
The legal pages under `src/content/legal/*` render these placeholders verbatim until you give the real values. Both live in one place: `src/config/product.ts` → `legal.jurisdiction` and `legal.address`.
- `{{jurisdiction}}`: governing law and courts for the terms (country/state of BufferSol Technologies' registration).
- `{{registered address}}`: registered business address of BufferSol Technologies, used in the privacy policy, terms and DPA.
Also confirm before launch: `legal@buffersoltech.com` as the security-report and legal contact, and the 12-month liability cap and transfer wording in `terms.ts`/`dpa.ts` (drafted by us, not reviewed by a lawyer).

## F. M4 owner steps (licences, metrics, image, SDK)
1. **Licence keypair** (once, on a trusted machine): `openssl genpkey -algorithm ed25519 -out licence-private.pem && openssl pkey -in licence-private.pem -pubout -out licence-public.pem`. Put the private PEM in the cloud environment as `LICENCE_SIGNING_KEY` (Vercel project env, production; `\n` escapes are accepted) and nowhere else, then delete the file. Add the public PEM as a GitHub repository **variable** `LICENCE_PUBLIC_KEY` (https://github.com/ahmadkhancodes/inboxwire/settings/variables/actions) so the image build bakes it in. Without the private key no licence is issued after `invoice.paid`.
2. **METRICS_TOKEN**: `openssl rand -hex 24`, set in Vercel env; point Prometheus (or any scraper) at `/metrics` with it as a bearer token.
3. **Indexes**: `npm run db:indexes` once Mongo is connected (adds `licences` and `deletion_records`).
4. **Cloudflare cron worker**: redeploy `infra/cron-worker` so `JOBS` includes `purge-canceled` (wrangler.toml already lists it).
5. **GHCR**: the first `git tag v0.1.0 && git push --tags` builds and pushes `ghcr.io/ahmadkhancodes/inboxwire` and attaches `casa-kit.zip` to the release; make the package public at https://github.com/users/ahmadkhancodes/packages after the first push.
6. **SDK on npm**: needs an npm token for the `@buffersol` scope (https://www.npmjs.com/settings/buffersol/tokens), then `npm publish -w @buffersol/inboxwire-sdk --access public`.

## G. M5 review: launch blockers and owner checks (see docs/REVIEW.md)
1. **Legal placeholders (blocker, REVIEW P0-7).** Fill `legal.jurisdiction` and `legal.address` in `src/config/product.ts` (section E). Until then the privacy policy, terms and DPA show `{{...}}`.
2. **Cloudflare cron worker (blocker, REVIEW P0-8).**
   - Needs `CLOUDFLARE_SAAS_TOKEN` + `CLOUDFLARE_SAAS_ACCOUNT_ID`.
   - Deploy `infra/cron-worker` with `CRON_SECRET` and the app URL. `JOBS` already lists `webhook-retries,uptime-probe,poll-imap,outbox-send,renew-watches,purge-canceled`.
   - Without it, the hosted app runs these once a day (vercel.json). IMAP accounts never poll, and webhook and send retries wait up to 24 h.
3. **Sub-processor DPAs.** Confirm a signed or click-through DPA with Vercel, MongoDB, Stripe and Resend (dashboard links: https://vercel.com/legal/dpa, https://www.mongodb.com/legal/data-processing-agreement, https://stripe.com/legal/dpa, https://resend.com/legal/dpa). Then restore the sentence "Each is bound by a written data processing agreement" in `src/content/legal/subprocessors.ts`.
4. **Back up `MASTER_KEY` offline** (password manager, two people). There is no rotation yet (REVIEW P1-7). Losing or changing it makes every stored mailbox credential unreadable and breaks push hooks.
5. **Self-host only:** to sync an on-prem mail server or post webhooks to a private address, set `ALLOW_PRIVATE_NETWORK_TARGETS=1` in the container env (documented in docs/selfhost.md).

## H. Launch hardening (10 Nov 2026)
1. **Indexes:** nothing new is required (the new fields `syncLeaseUntil`, `syncDirty` and the delivery lease reuse existing collections and indexes); indexes still auto-create on first connection.
2. **P1-7 stays open (MASTER_KEY rotation).** Back the key up offline (G4) before real customers connect mailboxes. A rotation design needs a database backup and a rehearsal first.
3. **Deploy is still yours:** this pass changed code and tests only. Playwright could not run in the CI container (no browsers installed); run `npx playwright install chromium && npx playwright test` before deploying, and re-take the Settings, OAuth clients screenshots (new environment picker).
4. **Resend:** if the sending domain is not verified, magic links now fail quietly (logged as `mail_send_failed`, code only). Check https://resend.com/domains before launch and watch the logs for that message.

