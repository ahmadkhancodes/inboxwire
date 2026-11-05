# DESIGN: Inboxwire by BufferSol

Concept "the switchboard": each connected mailbox is a **line** with a status **lamp**; webhooks print on a paper **ticker tape**. Source: brief.md "Design direction", confirmed against the competitor audit below. Tokens in this file are final unless the orchestrator asks for changes.

## 1. Research (screenshots in docs/design/refs/, read 5 Nov 2026)
| Site | Hero claim / visual | Palette | Type | Density | Notes |
|---|---|---|---|---|---|
| emailengine.app (leader) | "The self-hosted email API for Gmail, Microsoft 365 and IMAP"; dark JSON webhook panel with traffic-light dots | White, blue links, navy code panel | Josefin Sans headings, system body | Medium, docs-first | Credible, plain, price in hero ($1,450/yr). Admin UI is a stock template. |
| nylas.com/pricing | "From build to scale, you're covered."; four equal plan cards | Near-black, teal glow gradient, mint | Manrope/Poppins | Medium, busy | Many products in one table; the polished-enterprise look. |
| nango.dev/pricing | "Fair and transparent pricing"; hairline boxes on pale grid | Off-white, black | Albert Sans | Medium | Clean grid, catalogue feel. |
| unipile.com, aurinko.io | Pay-as-you-go tables | Light grey, Poppins | Poppins/Inter | Low | Generic; Aurinko sparse. |
| mailgun.com, postmarkapp.com, resend.com (adjacent loved) | Dev email vendors | Mailgun white; Postmark warm paper; Resend black | Host Grotesk / Rund Text / domaine+Inter | Medium | Postmark's warm paper and Resend's craft are what devs trust. |

**Category defaults to avoid:** dark terminal panel with traffic-light dots, teal/purple glow, Poppins/Inter, four equal plan cards, logo walls, envelope imagery.
**Gap we own:** nobody shows *state over time*. Everyone shows a request/response snippet; we show lines, lamps and a ticker with delivery stamps. This matches the real product gap (delivery log + replay).

## 2. ICP card
CTO/backend lead at a 3-150 person US/CA/UK SaaS, working in an editor and terminal, signs off under $1,500/yr on a card, fears vendor lock-in, per-mailbox price creep and a vendor that disappears. Loves Stripe/Postmark/Linear-grade docs. Reads on a 1440 desk screen; phone only to check status.

## 3. Positioning
For SaaS teams who must read, sync and send from their users' Gmail, Microsoft 365 and IMAP mailboxes, Inboxwire by BufferSol is the email sync API that runs on your servers for $708 a year or on ours from $24.99 a month, unlike EmailEngine (no hosted option, no delivery log) or Nylas (per-mailbox pricing, copies stored in their cloud).
Layout type: **A** (classic hero + sections) with a live demo panel; compare pages use type **D**.

## 4. Palette (CSS variable names verbatim; Tailwind v4 `@theme`)
| Token | Light | Dark ("night exchange") |
|---|---|---|
| ink / text | #16191C | #E7ECE8 |
| paper / bg | #FAFBF8 | #0F1211 |
| surface | #FFFFFF | #181C1B |
| soft | #F1F4F0 | #1F2423 |
| line | #D5DBD6 | #2A302E |
| muted | #5B6560 | #9AA59F |
| lamp (accent) | #F5A524 | #F5A524 |
| lamp-hover | #E08F0B | #FFB940 |
| live | #157A41 | #3DD68C |
| warn | #9A4A06 | #FFB940 |
| error | #C42B2B | #FF7A7A |
| cable (links, selection) | #2459A6 | #7FB0F5 |
Rules: one accent (amber lamp). Ink text on amber (8.6:1); never white on amber. Flat surfaces, no background gradients. No pure #000. Muted on paper 5.6:1; cable on paper 6.9:1. State never by colour alone: lamp + label + shape (● live, ◐ syncing, ■ error).
Override note (DESIGN_PLAYBOOK §3): dark backgrounds #0F1211/#181C1B/#1F2423 and amber accent are a deliberate brand override of the repo's dark whitelist, because the switchboard concept needs a warm-green night tone distinct from the category's blue-black.

## 5. Type
- Display: **Chivo** 600/800 (800 allowed; 900 banned). Body: **Public Sans** 400/500/600. Mono: **Martian Mono** 400/500 (IDs, events, code, prices in tape). Loaded with `next/font/google` (self-hosted at build, no CDN request at runtime). No italics. No Inter/Space Grotesk/Geist.
- Scale (px size/line, weight): display 48/56 800 (mobile 34/40), h1 32/40 800, h2 24/32 600, h3 18/26 600, body 15/24 400, small 13/20 500, mono 12.5/20 400. `text-wrap: balance` on headings, `pretty` on body. Tabular numerals in tables.
- Named classes: `display`, `h1`..`h3`, `body`, `small`, `mono`, `button`. No loose size utilities.

## 6. Spacing, radius, elevation, motion
- Spacing tokens only: 4, 8, 12, 16, 24, 32, 48, 64 (section padding 96 desktop / 48 mobile is 2x48). Container 1200, hero text max 680.
- Radius sm/md/lg = 2/4/8. Square-ish is the personality (switchboard hardware). `radius.jack` 999px for lamps and toggles only. Nested: inner = outer minus gap (>2 else square).
- Borders: 1px solid line, all four sides or none. Shadow panel `0 1px 0 rgba(22,25,28,.06),0 1px 3px rgba(22,25,28,.08)` (dark: border only). Modal `0 12px 32px rgba(22,25,28,.18)`. Focus: 2px lamp + 1px ink outline, offset 2.
- Motion: curve cubic-bezier(.2,0,0,1); fast 120 / base 160 / slow 280 ms (never under 120 for UI feedback; scroll reveals 600ms, 24px rise, once). Transform and opacity only. Reduced motion: opacity only. One signature motion: the ticker prints new lines (translateY 8px to 0 + opacity); lamp "breathes" once on state change.
- Mandatory tagline reveal (playbook B11): word-by-word scroll reveal of "Nothing outsourced. Your mail data is handled only by our code on our servers." Full opacity under reduced motion.

## 7. Density, iconography, imagery
- App: patch-panel table, 36px compact / 44px comfortable rows, sticky headers, mono IDs, right ticker (hidden <1024px). Marketing: medium density, big type moments, asymmetric sections (split, ledger, bento), no three-equal-cards.
- Icons: Phosphor regular (1.5px stroke, 16/20) + 6 custom glyphs (jack, plug, lamp, tape, sorter, key). No emoji, no icon-in-circle.
- Imagery: no stock, no illustrations of people. Technical line drawings (patch cords, sorting frame) in ink + amber, and **real UI components** with believable data (lines, ticker, delivery stamps). Data viz: per-line sparklines, latency histogram, segmented delivery tape; no donuts.
- Signature: the **ticker tape**, a perforated paper strip printing each webhook in Martian Mono with a stamp ("200 ✓ 84 ms"). Appears in hero, ticker page, delivery drawer, and OG image.
- Wordmark: "Inboxwire" Chivo 800 + "by BufferSol" Martian Mono 500 on an amber jack tab. Favicon: amber lamp in square jack.

## 8. Voice
Experienced mail engineer: calm, exact, a little dry. US English. Exact numbers, dated comparisons. "Webhook delivered in 84 ms (200)." not "Supercharge your inbox!". Sentence case. No exclamation marks. Never "magical/effortless/AI-powered/seamless/unlock". Always the full name "Inboxwire by BufferSol" in titles and legal; "Inboxwire" alone only in running UI copy after the full name is established on the page (brief rule: never bare in UI/emails/docs/invoices; so nav wordmark and `<title>` use the full name; UI strings use "Inboxwire by BufferSol" where a product name is needed).

## 9. Do / don't
Do: real components with believable, non-round data (84 ms, 1,204 lines); lamps with labels; dated price claims; "where they are better" boxes; docs link beside every CTA; light + dark equal quality.
Don't: purple/blue gradients, glass, glow blobs, fake logos/testimonials/"trusted by", stock photos, envelope/paper-plane art, AI sparkles, identical rounded cards, eyebrow pills, gradient text beyond hero H1, Material icons, font CDNs.

## 10. Why it fits better than the competitors
- Differs from EmailEngine/Nylas/Nango on palette (warm paper + amber vs white/blue, black/teal, grey), type (Chivo/Public Sans/Martian Mono vs Josefin/Manrope/Albert), imagery (live ticker + lines vs JSON panel/plan cards) and layout (ledger/ticker rhythm vs card grids): all four axes.
- Speaks to the buyer's trust signals: exact numbers, status you can read without colour, docs-first, a price in the hero, dated comparisons, no tracking scripts (matches the zero-third-party promise).
- Makes the real differentiator (delivery log + replay, per-line state) visible in the hero instead of claimed.
