import { product } from "@/config/product";

// Source text of the CASA Readiness Kit. The kit covers OUR components only; the customer's own OAuth app, assessor and
// answers stay theirs. Nothing here claims a certification we do not hold (no SOC 2, no ISO). Edit the text here, the zip is built from it.

export interface KitFile { path: string; body: string }

const n = product.name;

export function kitFiles(v: { version: string; date: string }): KitFile[] {
  return [
    { path: "README.md", body: `# ${n} CASA Readiness Kit

Version ${v.version}, generated ${v.date}. Free on every plan.

Google requires an annual security assessment (CASA) for apps that request restricted Gmail scopes and keep or send the data through a server. The assessment is for **your** OAuth app. ${n} gives you the evidence for **our** part of the data path. You still hire your own assessor and answer for your own code. We never resell or pay for an assessment.

Which apps do not need it: send-only apps (gmail.send is sensitive, not restricted), Google Workspace "Internal" apps, apps in Testing under 100 users, and IMAP/SMTP connections with app passwords. Microsoft 365 has no CASA. Check yours at ${product.url}/casa.

## Contents
| File | What it is |
|---|---|
| 01-saq-checklist.md | Checklist: which assessment questions our components answer, and which stay with you |
| 02-data-flow-template.md | Data-flow diagram, pre-filled for ${n}, with blanks for your app |
| 03-data-inventory-template.md | Data inventory, pre-filled for ${n}, with blanks for your app |
| 04-evidence-index.md | Index of evidence, where each item lives, who holds it |
| 05-encryption-notes.md | How tokens and metadata are encrypted at rest and in transit |
| 06-deletion-evidence.md | The deletion API, what it removes, and the record it writes |
| 07-architecture.md | Components and trust boundaries |
| zap/zap-baseline.conf | Rule configuration for the OWASP ZAP baseline scan of the API |
| manifest.json | Kit version, date and the sha256 of every file |

## Honest limits
- Mail bodies are not stored by default; message metadata and event payloads are encrypted and expire.
- The latest ZAP report is attached to each tagged release by CI (see 04-evidence-index.md). A kit downloaded from a build without a release has no report in it, and says so.
- This is not legal advice and not a compliance certificate.
` },
    { path: "01-saq-checklist.md", body: `# Assessment checklist (our components)

Mark each line when you have the evidence. "Ours" means ${n} provides it. "Yours" means your app must answer it.

| # | Area | Question you will be asked | Who | Evidence |
|---|---|---|---|---|
| 1 | Authentication | Are API credentials hashed and shown once? | Ours | API keys are stored hashed, shown once at creation, scoped read, send, admin |
| 2 | Authentication | Is MFA available for dashboard users? | Ours | TOTP and passkeys on every account (Settings, Security) |
| 3 | Authorization | Are roles enforced server side? | Ours | Owner, admin, developer, read-only roles; a read-only member cannot create keys; a read-scope key gets 403 on send |
| 4 | Transport | Is all traffic TLS? | Ours | HTTPS only with HSTS; hooks and webhooks need https |
| 5 | Data at rest | Are tokens and secrets encrypted? | Ours | AES-256-GCM, per-organisation data key wrapped by a master key (05-encryption-notes.md) |
| 6 | Data minimisation | Is mail content stored? | Ours | No by default. Metadata only; bodies fetched on request from the provider and never stored |
| 7 | Retention | Are retention periods defined and enforced? | Ours | Outbox payloads dropped when terminal (7 day TTL), delivery log TTL by plan, all customer data deleted 30 days after cancellation |
| 8 | Deletion | Can a user's data be deleted on request, with proof? | Ours | DELETE /v1/accounts/{id} and a deletion_record (06-deletion-evidence.md) |
| 9 | Third parties | Which sub-processors touch the data? | Ours | ${product.subProcessors.map((s) => s.name).join(", ")}. No analytics, ad or AI processors |
| 10 | Logging | Are secrets and bodies kept out of logs? | Ours | Structured logs carry ids and codes only |
| 11 | Vulnerability scanning | Is a dynamic scan run on each release? | Ours | OWASP ZAP baseline, OSV dependency scan in CI (zap/zap-baseline.conf) |
| 12 | Scopes | Are the narrowest Gmail scopes requested? | Yours | You choose the scopes of your OAuth client; the wizard shows a sensitivity badge per scope |
| 13 | Limited Use | Does your app comply with Google's Limited Use rules? | Yours | No human reads mail, no ads, no transfer except to your own endpoint |
| 14 | Your code | Secure development, your own scans, your own storage of what our webhooks send you | Yours | Your own assessor |
| 15 | Privacy policy | Does your policy describe your Gmail data use? | Yours | Link ours as the sub-processor description: ${product.url}/legal/privacy |
` },
    { path: "02-data-flow-template.md", body: `# Data-flow diagram

## ${n} (pre-filled)

\`\`\`
 Mailbox provider                ${n}                         Your server
 (Gmail / Microsoft 365 / IMAP)  (API + webhooks)             (your app)

 [1] user signs in with your
     OAuth client  ------------> hosted connect page
                                 [2] tokens encrypted (AES-256-GCM)
                                     and stored; password for IMAP too
 [3] push / poll for changes <-- watcher (Pub/Sub, Graph, cron poll)
 [4] metadata of new mail ----->  event payload (encrypted, expires)
                                 [5] signed webhook ---------------> endpoint verifies
                                                                     Inboxwire-Signature
 [6] message body on request <-- GET /v1/accounts/{id}/messages/{mid}
                                 streamed to caller, never stored
\`\`\`

Trust boundaries: provider | ${n} | your server. Mail content crosses ${n} in step 6 in transit only.

## Your application (fill in)

| Step | Source | Destination | Data | Protocol | Stored? | Encrypted at rest? |
|---|---|---|---|---|---|---|
| | | | | | | |
| | | | | | | |
| | | | | | | |

Add: where the webhook payload lands, where you store message bodies (if you do), who can read them.
` },
    { path: "03-data-inventory-template.md", body: `# Data inventory

## ${n} (pre-filled)

| Data | Purpose | Where | Retention | Encrypted | Deleted by |
|---|---|---|---|---|---|
| OAuth access and refresh tokens | Read and send on the user's behalf | account_credentials | Until the account is deleted | Yes, per-organisation key | DELETE /v1/accounts/{id}, 30 day purge |
| IMAP/SMTP settings and password | Connect to the mailbox | account_credentials | Until the account is deleted | Yes | Same |
| Your OAuth client secret | Run the OAuth flow | oauth_clients | Until you remove it | Yes | Settings, or organisation deletion |
| Mailbox address | Identify the line | accounts | Until the account is deleted | Not field-level (hashed in deletion records) | Same |
| Sync cursors | Resume sync | sync_cursors | Until the account is deleted | No (opaque positions) | Same |
| Webhook payloads | Deliver and replay events | webhook_deliveries | 7 to 90 days by plan | Signed in transit; log rows expire | TTL, organisation deletion |
| Outbox payloads | Send and retry | outbox | Dropped once sent or failed, row 7 days | Yes | TTL |
| Message bodies and attachments | Served on request | Not stored | n/a | n/a | n/a |
| Sign-in data | Dashboard access | user, session | While the account exists | Hashed secrets | Account deletion |
| Audit log | Accountability | audit_log | Append-only, ids only | No PII beyond ids | Kept |
| Deletion records | Proof of deletion | deletion_records | Kept | Address only as sha256 | Kept |

## Your application (fill in)

| Data | Purpose | Where | Retention | Encrypted | Deleted by |
|---|---|---|---|---|---|
| | | | | | |
| | | | | | |
` },
    { path: "04-evidence-index.md", body: `# Evidence index

Status: **Ours** items are produced by ${n}. Collect each file for your assessor.

| # | Evidence | Where to find it | Holder | Cadence |
|---|---|---|---|---|
| E1 | Assessment checklist | 01-saq-checklist.md | ${n} | Each release |
| E2 | Data-flow diagram | 02-data-flow-template.md (yours: fill in) | You | When your flow changes |
| E3 | Data inventory | 03-data-inventory-template.md (yours: fill in) | You | When your data changes |
| E4 | ZAP configuration | zap/zap-baseline.conf | ${n} | Each release |
| E5 | Latest ZAP baseline report | Attached to the GitHub release of the same version (zap-report.html) | ${n} | Each release tag |
| E6 | Dependency scan (OSV) | CI run of the same commit | ${n} | Every push |
| E7 | Encryption notes | 05-encryption-notes.md | ${n} | Each release |
| E8 | Deletion evidence | 06-deletion-evidence.md; export your own records with GET /v1 deletion record ids returned by DELETE | ${n} | On request |
| E9 | Architecture | 07-architecture.md | ${n} | Each release |
| E10 | Sub-processor list | ${product.url}/legal/privacy | ${n} | On change |
| E11 | Your OAuth consent screen and scopes | Google Cloud console | You | On change |
| E12 | Your own scan and pen-test results | Your assessor | You | Yearly |
` },
    { path: "05-encryption-notes.md", body: `# Encryption notes

- **In transit:** TLS for every connection to ${n}, to the mailbox providers and to your webhook endpoint (https required). Provider connections use TLS or STARTTLS; plain IMAP is refused.
- **At rest, secrets:** OAuth tokens, IMAP/SMTP passwords, OAuth client secrets and webhook secrets are stored only as AES-256-GCM blobs (random 96-bit nonce, authenticated).
- **Key hierarchy:** one 256-bit data key per organisation, itself wrapped (AES-256-GCM) by a master key held in the platform's secret store, not in the database. Losing the master key makes stored credentials unreadable; there is no back door. The key wrapper is an interface so the master key can move to a vault.
- **Webhook signing:** HMAC-SHA256 over \`<timestamp>.<raw body>\`, header \`Inboxwire-Signature: t=<unix>,v1=<hex>\`, constant-time compare, five minute tolerance.
- **API keys:** random, stored hashed, shown once.
- **Licence keys (self-host):** Ed25519 signatures verified offline; the private key never leaves our cloud environment.
- **Not encrypted at field level:** mailbox addresses and sync cursors. Mail bodies are not stored.
` },
    { path: "06-deletion-evidence.md", body: `# Deletion evidence

\`DELETE /v1/accounts/{id}\` (admin scope):

1. stops the provider watch (Gmail watch, Graph subscription) so no notification follows;
2. revokes the token where the provider supports it (Google: oauth2.googleapis.com/revoke). IMAP uses a password, and Microsoft Graph has no per-token revoke, so those report \`not_applicable\` (our copy is deleted in every case);
3. deletes the account, its credentials, sync cursors and queued sends;
4. writes a \`deletion_record\`: id, organisation, environment, account id, **sha256 of the address**, reason, revocation result, row counts, time. No mailbox content.

The response returns \`deletionRecordId\`, \`revocation\` and \`rows\`. Keep the response with your own deletion request log.

Automatic deletion: 30 days after a paid plan is cancelled, a daily job deletes every remaining mailbox of the organisation the same way (reason \`post_cancel_purge\`). Deleting an organisation or a user account removes the organisation's data as well. The audit log keeps ids only.

Example response:

\`\`\`json
{ "deleted": true, "deletionRecordId": "0190...", "revocation": "revoked", "rows": { "accounts": 1, "credentials": 1, "cursors": 2, "outbox": 0 } }
\`\`\`
` },
    { path: "07-architecture.md", body: `# Architecture

- **Web and API:** Next.js on Vercel (US). REST under /v1, hosted connect page, dashboard, docs.
- **Database:** MongoDB Atlas (AWS us-east-1). One database; every record carries the app name; TTL indexes expire logs and payloads.
- **Payments:** Stripe (checkout and portal; we never see card numbers).
- **Mail for the platform itself:** a transactional email provider for sign-in links and alerts.
- **Cron:** a Cloudflare worker calls /api/cron/<job> with a shared secret every minute (poll, retry, renew watches, purge).
- **Self-host:** the same app as a Docker image with MongoDB; nothing leaves your servers except traffic to the mail providers and your own webhook endpoints.

Trust boundaries: browser | edge/app | database | mail providers | customer webhook endpoints. Secrets exist in memory only after decryption and are never logged.

Banned by design: AI/LLM calls from the app, ads, analytics scripts, hosted error trackers.
` },
    { path: "zap/zap-baseline.conf", body: `# OWASP ZAP baseline rules for ${n}. Format: <rule id>\\t<IGNORE|WARN|FAIL>\\t(<description>)
# Run: docker run --rm -v "$PWD:/zap/wrk" ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t ${product.url} -c zap/zap-baseline.conf -r zap-report.html
10015\tFAIL\t(Incomplete or No Cache-control Header Set)
10020\tFAIL\t(Missing Anti-clickjacking Header)
10021\tFAIL\t(X-Content-Type-Options Header Missing)
10035\tFAIL\t(Strict-Transport-Security Header Not Set)
10038\tFAIL\t(Content Security Policy Header Not Set)
10054\tWARN\t(Cookie without SameSite Attribute)
10096\tWARN\t(Timestamp Disclosure)
90033\tWARN\t(Loosely Scoped Cookie)
` },
  ];
}
