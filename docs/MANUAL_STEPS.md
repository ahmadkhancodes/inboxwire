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
3. API permissions (delegated, Microsoft Graph): `Mail.ReadWrite`, `Mail.Send`, `offline_access`, `openid`, `email`, `User.Read`. Certificates & secrets: new client secret. Paste back: Application (client) ID and secret to Vercel env `MS_CLIENT_ID`/`MS_CLIENT_SECRET`.
Done when: Outlook.com mailbox connects and Graph notification hits `/api/hooks/graph/<envId>`.

## C. Accounts and keys (already tracked by orchestrator)
`STRIPE_SECRET_KEY_TEST`, `RESEND_API_KEY`, `CLOUDFLARE_SAAS_TOKEN`, `CLOUDFLARE_SAAS_ACCOUNT_ID`; Vercel Pro upgrade before real money (https://vercel.com/account/billing); npm token for `@buffersol/inboxwire-sdk` (https://www.npmjs.com/settings/~/tokens); DNS record `inboxwire` CNAME to Vercel for the subdomain.

## D. Later (not blocking MVP)
- **Google verification + CASA** for any production Gmail with restricted scopes on OUR app: only if we choose to publish our own app; default policy is customers bring their own client, so skip. If chosen: https://console.cloud.google.com/auth/verification then a lab (Secusy/TAC, AL1 $499-$855 est.).
- Microsoft publisher verification (only for multi-tenant shared app, v2).
- VPS handover: IMAP IDLE workers, Postfix/DKIM (DNS: SPF, DKIM, DMARC p=none, MTA-STS, TLS-RPT for buffersoltech.com), port 25 unblocking request to Hetzner/OVH.
