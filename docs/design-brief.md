# Design brief: Inboxwire by BufferSol (redesign, 12 Nov 2026)

Replaces the "switchboard" system in docs/DESIGN.md (warm paper + amber lamp + Chivo). The founder said that system reads as typical AI "Claude style" UI, and he is right: cream paper, an orange/amber accent, a heavy grotesque headline on the left with a product panel on the right, and every section set as a two column "heading left, content right" block is the most common shape AI tools produce today. This brief is the gate for the redesign (DESIGN_PLAYBOOK §1). Light only.

## 1. Research (screenshots in docs/design/refs/2026-11-12/, taken 12 Nov 2026 at 1440 and 375 with Playwright)

| Site | Hero claim / visual | Palette | Type | Density | Proof / pricing shape | CTA |
|---|---|---|---|---|---|---|
| emailengine.app (leader) | "The self-hosted email API for Gmail, Microsoft 365 and IMAP"; navy JSON webhook panel with traffic-light dots | White, navy code panel, blue links | Josefin Sans headings | Medium | "200+ companies in 38 countries", price under CTA ($1,450/yr) | "Install & start a free trial" |
| nylas.com | "The data layer behind every communication workflow"; centred text over black with teal glow | Black, teal/green glow | Manrope-like geometric | Low | Logo wall, AI banner | "Build Now" pill |
| nango.dev | "Integrations for agents"; abstract blue wireframe shape | Pale blue wash, white | Light geometric sans | Low | Logo strip + "1,200+ / 10,000+ / 1M+" stat strip | "Talk to us" pill |
| unipile.com | "Unified API for Messaging, Email & Scheduling"; floating UI cards | Navy + yellow buttons | Bold geometric | Medium | "Trusted by 6,000+ SaaS", eyebrow pill | "Build Now" |
| aurinko.io | "INBOX INTEGRATION HEADACHES ELIMINATED!"; centred, orange circuit lines | White, orange, purple | Heavy caps | Low | G2 stars | "Get a Demo" |
| postmarkapp.com (adjacent, loved) | "The email delivery service that people actually like"; tweets column | Flat yellow, black | Heavy slab-ish serif | Medium | Real named tweets | "Start free trial" |
| resend.com (adjacent, loved) | "Email for developers"; 3D cube on black | Black, white serif | Serif display + sans | Low | Logos | "Get started" |
| tailscale.com / oxide.computer (adjacent, loved) | Centred grey hero / dark rack photo with mono UI | Grey, dark green | Grotesk + mono | Medium | Named customers | "Get started" |

**What they all do (category clichés):** centred or split hero over a dark or glowing field; one dark code panel with traffic-light dots; geometric sans everywhere; pill CTAs and eyebrow pills; logo walls and "N+ teams" stat strips; card grids. Two camps: dark-glow (Nylas, Resend, Oxide, Unipile) and soft-pale (Nango, Aurinko).
**What the current Inboxwire site does that reads as AI:** cream paper + amber (the Claude palette), Chivo heavy headline + right panel, every section the same split, rounded boxes in a bento grid, word-reveal on a grey paragraph.
**Gap we own:** nobody treats the page like what this buyer works with every day, **an email message and its headers**. Engineers who integrate mail read RFC 5322 headers, MIME trees and delivery logs. A crisp, printed-spec look (ruled lines, field labels, monospace values, a highlighter pen on what matters) is native to them, and nobody in the category uses it.

## 2. Intake (one batch)
- Primary action: **Start free** (Developer tier, 3 mailboxes, no card). Secondary: read the docs.
- Offer: self-host $708/yr unlimited mailboxes, Cloud from $24.99/mo, Developer free (docs/brief.md Pricing).
- Conversion: account created; second: docs visit.
- Problem: mailbox sync (IMAP quirks, OAuth refresh, Gmail history, Graph subscriptions, MIME) is months of work outside the product.
- Top objections: will a small vendor keep up with Google/Microsoft; will you exist in two years; CASA; price creep.
- Traffic: search ("emailengine alternative", "nylas pricing"), HN/Reddit, docs links. Visitors know EmailEngine or Nylas already.
- Proof assets: none real yet (no logos, no quotes). Proof = exact dated price comparison, real product UI, open docs, OpenAPI. Testimonial slot stays a `{{testimonial}}` placeholder and is not rendered on the home page.
- Risk reversal: free tier, no card, cancel in two clicks, price locked 24 months.
- Voice: experienced mail engineer, dry and exact. Mobile priority: medium (status checks on phone; buying at a desk).

## 3. ICP card
CTO or backend lead at a 3 to 150 person SaaS in the US, Canada or UK (CRM, helpdesk, ATS, AI email agent). Lives in an editor, a terminal and API docs; reads raw headers when debugging. Pays under $1,500 a year by card without a call. Fears lock-in, per-mailbox price creep, and a vendor that disappears. Trusts: Stripe and Postmark docs, Linear's precision, Tailscale/Oxide plainness, an RFC that says exactly what happens. Distrusts glow, mascots, "AI-powered", stat strips. Reads at a 1440 desk screen; phone only to check if a line is down.

## 4. Positioning
For SaaS teams who must read, sync and send from their users' Gmail, Microsoft 365 and IMAP mailboxes, Inboxwire by BufferSol is the email sync API that runs on your servers for $708 a year or on ours from $24.99 a month, with a delivery log you can replay, unlike EmailEngine (self-host only, $1,450 a year) or Nylas (per-mailbox pricing).
Layout type: **A** (classic hero + sections), with the hero set as a message header block. Compare pages stay type **D**.

## 5. Section plan (home)
1. Hero, "message header" block: `From / To / Subject` field rows in mono, the H1 as the subject line, sub, Start free + docs link, price proof line. Below it, full width, the real product UI (Lines table + delivery log) on a ruled sunken band, cropped to the table on 375.
2. Problem: three objections as a numbered list in a ruled ledger (not cards).
3. How it works: three steps as a single "transcript" column, request on the left, what happens on the right.
4. Tagline reveal on a full-bleed ink band (the only dark block; highlighter words light up).
5. Capabilities: a spec sheet (definition list, two columns, ruled), with the delivery log fragment as the one visual.
6. CASA: four paths as a decision table.
7. Pricing: plans as columns of one comparison table (not four cards), price the largest element.
8. Built for / Not for, FAQ (two-column, questions left), final CTA as a plain ruled block.
Hero copy: H1 "Read, sync and send from your users' mailboxes"; sub states Gmail, Microsoft 365, IMAP, webhooks, $708/yr self-host, $24.99/mo Cloud. Proof line: free tier facts + dated EmailEngine price.

## 6. Visual system (encoded in src/app/globals.css `@theme` + `src/app/fonts.ts`)

**Palette** ("carbon and highlighter"): cool neutral ramp, ink for actions, one highlighter accent used as a *mark* (selection, the current nav item, the reveal, key words in the hero), never as text colour.
| Role | Value | Notes |
|---|---|---|
| surface (page) | #FFFFFF | |
| surface-sunken | #F4F5F6 | bands, table heads |
| surface-raised | #FFFFFF | panels have a border, not a fill change |
| text | #101418 | 18.6:1 on white |
| text-subtle | #4A525A | 8.1:1 |
| text-muted | #626B74 | 5.4:1 |
| border / border-strong | #DDE1E5 / #B9C0C7 | hairlines; inputs use strong (3.1:1 vs white needs ink focus) |
| action (primary button) | #101418, hover #2B3238 | white text 18:1 |
| mark (accent) | #D9F45B | ink on mark 15:1; never text on white |
| success / warning / danger | #17793A / #8A5300 / #B8262D | each ≥5:1 on white, always with a label + shape |
Different from every competitor: no navy, no teal glow, no yellow field, no purple, and not cream + amber.

**Type** (next/font, self-hosted at build): Display **IBM Plex Sans Condensed** 600/700 (narrow, technical, printed-spec voice; big sizes only). Text **IBM Plex Sans** 400/500/600. Mono **IBM Plex Mono** 400/500 for field labels, ids, figures, code. One superfamily, three widths: a consistent engineering voice that no competitor uses. No italics, no 900. Scale = Tailwind steps via the named utilities (heading-1..6 etc.); headings tighter tracking (-0.015em).

**Grid:** 12 columns, 1200 container. Marketing sections use a fixed left "field" column (3 cols: mono label such as `Problem`, `Delivery`) and a 9 column body, like header fields above a message body. Not every section: hero, ink band and pricing break the grid on purpose.

**Radius and borders:** structure is square (panels, tables, bands: 0). Controls (buttons, inputs, tags) 2px. Status lamps round. Borders are 1px hairlines on all four sides or as full-width rules between rows. No shadows except dialogs/popovers (`0 12px 32px rgba(16,20,24,.16)`).

**Density:** marketing medium with big type moments; app high: 40px rows (44px tap targets on touch), sticky table heads, mono ids, tabular numerals.

**Imagery:** only real product components with believable data (Lines table, delivery log, connect form, curl). No icons-in-squares, no illustrations, no emoji.

**Motion:** restrained. Curve cubic-bezier(.22,1,.36,1), 200 to 300 ms colour/opacity, rows of the delivery log print in (8px rise). Tagline words switch from 35% to full with a highlighter underlay. Reduced motion: no movement, full opacity.

**Signature move:** the message header block. The hero, the app page headers and the final CTA use `Field: value` rows in Plex Mono above a condensed headline, and the highlighter marks the one thing that matters on each screen.

## 7. App direction
- Shell: top bar (wordmark, org, environment, account) + a text-only left index (no icon per item) grouped "Mail" / "Developers" / "Account", with the current item marked by a 3px ink bar and the highlighter. Mobile: top bar + horizontally scrolling section index.
- Page header: mono breadcrumb field (`northwind-crm / Lines`), condensed title, one primary action on the right, a one-line description.
- Tables: square, hairline rows, sticky sunken head, 40px rows, mono ids, status lamp + label.
- Empty states: a ruled box with what will appear here, a realistic example row in muted mono, and one action.
- Forms: labels above, 2px radius inputs with strong border, ink focus ring, inline specific errors.
- Dialogs: square panel with shadow, title + one primary action.

## 8. Self-critique log
See docs/design-qa.md (scores per round). Final screenshots: docs/qa/design/.
