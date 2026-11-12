# QA report: battle test of the P0 journeys (2026-11-12)

Method: production build (`next start`, `DB_DRIVER=memory`, `E2E_OUTBOX=1`, console mail), real Chromium, signed in through the real form and the e-mail outbox. Specs live in `tests/e2e/qa/`. Nothing was deployed.

## Journeys covered
- **Signed out crawl** (`journeys.spec.ts`): every public page loads clean, every internal link resolves, every `/app/*` route redirects to sign-in, no console or 5xx errors.
- **Sign-in**: blank, whitespace, malformed, HTML and spaced addresses are refused with a message; magic link works once, a reused link lands on sign-in with "link expired", a garbage token does not error.
- **New visitor to first screen**: sign-in link, onboarding (empty and HTML/emoji org name), all 15 signed-in screens load without the error boundary, no unnamed icon buttons, pointer cursor on every clickable, no horizontal scroll, sign out ends the session.
- **Every button** (`clicks.spec.ts`, 1440 and 375px): each enabled button on every app screen is clicked and must change the page, URL or send a request; disabled buttons must say why.
- **API keys, webhooks, members, profile** (`forms.spec.ts`): empty, long, HTML, unicode, duplicate and double-submit input; secrets shown once; delete asks first and Escape cancels.
- **Connect links**: API create, garbage/long/script tokens on `/connect/<token>` show a page, never a 500.
- **Isolation and scopes**: a second organisation cannot read, list or delete another org's lines through the API or the dashboard; a read-scope key cannot send or delete; unauthenticated API is 401; a mangled session cookie redirects to sign-in.
- **UX** (`ux.spec.ts`): home next steps, plan limits agree with pricing, keyboard-only sign-in with visible focus, 44px tap targets at 375px, light-only check, billing without Stripe keys explains itself.

## Defects found and fixed
| What the user would have seen | Fix | Regression test |
|---|---|---|
| `/app/settings/audit` (owners/admins) crashed with "This page could not load": a server page called `formatDate` from a `"use client"` module. | `formatDate` moved to a plain module `src/components/app/format-date.ts` (re-exported from `api.ts`). | `journeys.spec.ts` (every screen, no error boundary), `tests/unit/qa-format-date.test.ts` |
| Two-factor setup could never be enabled: Settings > Security > Enable failed with "Invalid password" because the product is passwordless. | `allowPasswordless: true` on the Better Auth two-factor plugin. | `journeys.spec.ts` "two-factor setup" |
| Creating an API key with a name of 33 to 60 characters failed with "The name length is either too large or too small", although the field allows 60. | `maximumNameLength: 60` on the API key plugin. | `forms.spec.ts` API keys (36 character name) |
| The signed-in home page showed developer scaffold copy ("Replace `src/app/app/page.tsx` with the screen people use every day"). | Replaced with a four step "Get to your first webhook" list linking to keys, webhooks, lines, ticker. | `ux.spec.ts` home |
| Disabled buttons gave no reason (Save credentials, Save changes, Sign out other sessions) and, because of `pointer-events: none`, never showed the not-allowed cursor or a tooltip. | `title` reasons added; `pointer-events-none` removed from disabled buttons. | `clicks.spec.ts` |
| Tap targets under 44px at 375px: wordmark links (auth, app sidebar, footer) were 28px, billing Monthly/Yearly toggle 32px. | `min-h-11` on those. | `ux.spec.ts` mobile |
| Test infrastructure: the dev e-mail outbox could be a different array per route bundle, so the outbox endpoint saw no mail after a UI sign-in. | Outbox stored on `globalThis`. | every QA spec signs in through it |

## Open
- ~~**Medium: React error #418 on the first load of `/sign-in` on a cold production server.**~~ Resolved by the dark-mode removal (the theme script mutated `<html>`): three fresh contexts on a cold server hydrate clean (`tests/e2e/qa2/cold.spec.ts`), and the #418 tolerances in `qa/journeys.spec.ts` and `qa/ux.spec.ts` are removed. Original note: The server HTML is identical between requests; the client re-renders the document, which drops `data-theme` once (a brief flash of the light theme for dark-mode users) and logs the error. Not reproducible in `next dev` or on later loads, so the cause (suspected: first-load chunk ordering with the streamed dynamic page) is not found. The QA specs tolerate exactly this error in the signed-out crawl and load `/sign-in` twice in the dark-theme test. Needs a look with an unminified production build.
- **Low: refresh buttons (Deliveries, Outbox, Webhooks) give no visible feedback when nothing changed.** Left as is; a "Updated just now" stamp would fix it (design call).
- **Low: a foreign or missing `/app/lines/<id>` returns HTTP 200 with the 404 UI** (Next streams not-found after the layout). No data leaks; search engines do not index `/app`.
- **Info: per-IP throttles are real.** Better Auth allows 5 magic-link requests per minute per IP and the dashboard API 60 requests per minute; rapid reloading shows the "Too many attempts" message (correct, tested copy).
- **Not testable here (needs real services):** Stripe checkout return, Gmail/Microsoft OAuth consent, IMAP connect against a live server, live webhook delivery to an external URL, and the P0 items that live outside the web app (own MTA, Postfix, ops stack, CI registry).

## Hardening pass (2026-11-12)
Added: `/api/health` real dependency probe (`tests/e2e/qa/ops.spec.ts`, unit tests), Deliveries "Export CSV" (formula-injection safe, session required), provider errors mapped to codes, keyed e-mail digest in deletion records, nested/e-mail log scrubbing, confirm dialog cannot be dismissed while busy. Lint, typecheck, 276 unit tests and build green; the new e2e spec passes. Built client bundle grepped for Stripe/webhook/master key patterns: none. Not done in this pass: a full Playwright suite re-run, a browser CSP audit, new multi-tenant tests beyond the existing ones, and the onboarding/import/keyboard-shortcut work, which stay open.


## Post-redesign regression pass (2026-11-12, specs in `tests/e2e/qa2/`)
Method: same production build and memory DB as `playwright.config.ts`; real Chromium at 1440 and 375px, light theme.

### Journeys covered
- **New visitor** (`public.spec.ts`): every sitemap URL plus 404, sign-in and legal pages at both widths: HTTP status, console/hydration errors, failed requests, horizontal scroll, `data-theme`/`dark` leftovers, `color-scheme`, fonts (only IBM Plex; Chivo and other families fail), clipped text, WCAG contrast of every text node over its opaque background, pointer cursor and labels, every internal link and in-page anchor resolves, compiled CSS has no amber/Chivo/dark-scheme rules, OG/Twitter/icon images return images, mobile menu (open, Escape, focus return, navigate, close), keyboard Tab order with a visible ring and skip link first.
- **Free user and user over the plan limit** (`app.spec.ts`, 1440 and 375px): all 15 signed-in screens with 0 and with 6 lines on a 3 line plan get the same scan, plus console and request watching; deep link through sign-in and onboarding, signed-in `/sign-in`, open-redirect attempts, pricing hand-off to `/app/billing?plan=`, sign-out landing, checkout return URLs, mobile app menu with Escape, keyboard-only focus rings, plan prices and limits on `/pricing` equal `src/config/product.ts` (yearly and monthly toggle).
- **Cold start** (`cold.spec.ts`): first `/sign-in` hydration clean three times.
- Copy audit: every `$` amount and "N mailboxes" claim on all public pages was extracted and traced to `product.ts`, `competitors.ts` (dated 3 Nov 2026) or `docs/brief.md`. No invented logos, counts or testimonials found.

### Defects found and fixed
| What the user would have seen | Fix | Regression test |
|---|---|---|
| Back from Stripe via the cancel link (`/app/billing?checkout=canceled`) the billing page showed nothing, as if the click had done nothing. | "Checkout canceled. Nothing was charged" notice. | `app.spec.ts` checkout return |
| Signing out (or an expired session) left background prefetches of `/app/*` redirecting to `/sign-in`; on plain-http hosts the CSP `upgrade-insecure-requests` turned those into failed `ERR_SSL_PROTOCOL_ERROR` requests (red in the console). The earlier fix keyed on `next-router-prefetch`, but Next 16 strips that header and `rsc` before the proxy runs, so it never fired (the `qa/journeys` new-user spec was failing on it). | `proxy.ts` now answers any signed-out background fetch (`Sec-Fetch-Dest: empty`) with 204; document navigations still redirect and a client navigation falls back to a full page load. | `tests/unit/proxy-redirect.test.ts`, `qa/journeys.spec.ts` new-user, `qa2/app.spec.ts` redirects |
| Sign-in e-mail, OG image and favicons still used the pre-redesign near-black `#181818`, greys `#767676/#404040/#f7f7f7`, and rounded 6-12px corners, off the carbon ramp and the square system. | Moved to ink `#101418`, `#4a525a`, `#626b74`, `#f4f5f6`, `#dde1e5`, 0-2px radii. | `tests/unit/qa2-brand.test.ts` |
| The last-resort error page (`global-error`) had no IBM Plex font variables and fell back to the system font. | Font variables on its `<html>`. | `tests/unit/qa2-brand.test.ts` |
| Test debt: the React #418 tolerance in two specs hid regressions. | Removed (see Open, resolved). | `qa2/cold.spec.ts` |

### Open
- **Low: e-mail, OG image and icon use system sans** (no web fonts inside e-mail clients or `next/og` without bundling font files). Colour and shape now match the system.
- **Low:** the earlier open items (refresh buttons give no visible feedback; foreign `/app/lines/<id>` returns 200 with the 404 UI) are unchanged.
- **Not testable here:** Stripe-hosted checkout and portal pages, real Gmail/Microsoft consent, live provider mail. The CSP `form-action` allows `checkout.stripe.com` and `billing.stripe.com` and the app navigates with `window.location.assign` (not a form), so the dashboard buttons are not blocked; confirmed by the "every enabled button does something" spec showing the explanatory notice when Stripe is not configured.

## Usefulness pass (2026-11-12, specs `tests/e2e/personas.spec.ts`, `tests/e2e/docs-run.spec.ts`)
Method: same production build and memory DB as `playwright.config.ts`, real Chromium, sign-in through the form and the e-mail outbox. Personas from the brief's ICP. Nothing deployed.

### Personas and their week (before the fixes)
- **Felix, founder of a 3-person AI email agent startup** (brief persona "Founder Felix"). Day 1: signs up, lands on the overview. The checklist says "Connect a mailbox: create a connect link from the API", but the Lines screen only offers "Read the connect docs". To see a single line he must create a key, read the quickstart and run curl. The default key scope is read, and the first quickstart call (connect link) needs admin, so his first curl answers 403. Day 2: creates a key; the reveal shows only the raw key, no command. Day 7: nothing tells him how far he got; the checklist never changes.
- **Clara, CTO of a 20-person vertical CRM** ("CTO Clara"). Day 2: invites her backend lead (works, e-mail arrives). Day 7: her customers connect mailboxes from her product; the fourth is refused on Developer. The end user sees "Ask the app owner to upgrade"; Clara sees nothing: no e-mail, no notice until she happens to open the dashboard. Creating another link from the API at the cap succeeds and fails later at her customer.
- **Ian, ops engineer wiring n8n** ("Internal-tools Ian"). Day 1: follows Getting started: "Open Settings, then API keys" (no such path; it is Keys), "upgrade from Settings, then Billing" (Billing is top level). Day 2: adds a webhook; the webhooks guide names headers x-webhook-* while the quickstart and SDK use Inboxwire-Signature. Self-host trial: `docker compose up` fails with a YAML error before anything starts, and the documented `grep -i "sign-in"` never finds the printed magic link.

### Top five frictions fixed
| Friction | Fix | Test |
|---|---|---|
| No way to see a first line without writing code (connect links were API-only). | Lines: "Connect a mailbox" panel, Create connect link -> copyable single-use URL + Open. 2 clicks from the overview (budget asserted). | `personas.spec.ts` Felix |
| New key, then a 403 or a blank terminal: no command, scope mismatch with the quickstart. | Key reveal shows a curl personalised with the real key and this host, chosen for the key's scope (admin: connect link; read/send: list accounts, and says what needs admin). Executed in the test exactly as shown. | `personas.spec.ts` Felix + Ian, `usefulness.test.ts` |
| Static onboarding checklist. | Overview shows "N of 4 done", a Done badge per finished step, and the next open step as the primary button (keys, endpoints, lines, deliveries read from the DB). | `personas.spec.ts`, `usefulness.test.ts` |
| Refused connects at the plan cap were invisible to the developer. | Owners get one e-mail per day: what happened, what to do, link to `/app/billing?plan=<next>`; the dashboard connect panel warns before handing out a link that would be refused. | `limit-notice-connect.test.ts`, `usefulness.test.ts`, `personas.spec.ts` Clara |
| Docs that did not match the product. | Home page connect example used `account`/`redirect` and an `expiresIn` response (fields that do not exist): now the real `externalId`/`redirectUrl`/`expiresAt`. Stale "Settings, then ..." paths fixed in five docs. /v1 + Bearer used everywhere (both /api/v1 and x-api-key still work). Webhook headers named consistently. `docker-compose.yml` was invalid YAML (unquoted `:?generate with: ...` messages): quoted. Self-host grep fixed to `magic-link`. /docs/api placeholders now name the right resource (`wh_123`, `out_123`). | `docs-run.spec.ts`, `docs-samples.test.ts` |

### Docs are executed
- Every bash/curl block in `src/content/docs` (except self-host, which needs Docker and a VM), every `/docs/api` operation curl (all 20 operations, destructive last; the test fails if an operation is added without being run), the home page example, the Python and Go quickstarts and the TypeScript SDK sample run against the app. Mailboxes are the E2E-only sandbox backend.
- Webhook verification samples (Node x3 incl. the SDK handler, Python, Go) verify a real signature from our signer and reject a forged and a stale one.
- Self-host: the `.env` block plus `docker compose config` passes, and refuses with the openssl hint when a secret is missing; the documented log grep finds the printed link. `docker compose up` itself (image build, Mongo) is not run here.
- Pricing: page and doc numbers come from `src/config/product.ts`; the home page's hard-coded $708, $0.99 and "3 mailboxes" and the product description are now asserted against it (`usefulness.test.ts`), in addition to the existing qa2 pricing checks.

### Billing path (`tests/unit/billing-journey.test.ts`)
Free org at 3 of 3 mailboxes -> Growth monthly Checkout Session (price from lookup key `inboxwire_growth_monthly`, `metadata.app=inboxwire` on session, subscription and customer, success `.../app/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`, cancel `...?checkout=canceled`, shared with the route via `checkoutReturnUrls`) -> `checkout.session.completed` activates Growth with metered mailboxes (100 included, $0.99 extra) and its environment limit -> portal session for that customer returning to billing -> cancel at period end keeps Growth -> `customer.subscription.deleted` returns to Developer (3 included, adding blocked). Not testable here: Stripe-hosted card entry and the real webhook signature from Stripe.

### Left open
- An "Updated just now" stamp on refresh buttons and the `/app/lines/<id>` 200-with-404 (unchanged, low).
- Import from Nylas/EmailEngine account lists and keyboard shortcuts were considered and not done (lower impact than the five above for these personas).
- The v1 `POST /v1/connect-links` still succeeds at the cap (the refusal happens at the end user's last step, now with an owner e-mail). Returning a warning field there changes the API contract and the SDK; left as a product decision.
