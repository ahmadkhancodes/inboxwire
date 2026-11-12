# Landing page library audit, 12 Nov 2026

Before and after screenshots of `/` and `/pricing` at 375 and 1440 (light) are in `before/` and `after/`, taken from a local `next start` build.

## Uniqueness proof (for the PR description)

| | Inboxwire |
|---|---|
| Palette | ink `#101418` (text and action), white `#FFFFFF` surface, sunken `#F4F5F6`, rules `#DDE1E5` / `#B9C0C7`, highlighter `#D9F45B` (only ever behind ink text), lamp states success `#17793A`, warning `#8A5300`, danger `#B8262D` |
| Fonts | IBM Plex Sans Condensed 600 (display), IBM Plex Sans 400/500/600 (body), IBM Plex Mono 400/500 (fields, ids, figures) |
| Radius feel | Square printed spec: structure 0, controls 2px, status lamps round |
| Layout type | A, classic hero plus sections: the product is understood from one screenshot of the Lines table and delivery log |
| Hero composition | Set as an email header: mono `From:` / `To:` / `Subject:` field rows, the H1 is the subject line with a highlighter mark, one action, then the real Lines + webhook ticker on a ruled full width band |
| Signature element | The message header hero and the webhook delivery "tape" (timestamp, event, `200 ✓ 84 ms`) that recurs in How it works and Features |

How it differs from the other six: the only white API docs page; monochrome ink with a single lime highlighter instead of a brand colour (Postslot warm paper and stamp, Wirebook green ledger, DockCrate steel stencil, Hotrail navy rail, Stepclimb blueprint, Straightpin newsprint), and its hero is a literal email header, not a centred headline.

## Measured after the change
- Hero h1 680px wide at 1440 (was 1009), subheading 680px or less; 343px at 375. No horizontal overflow at 375, 390 or 1440.
- Font sizes on the page: 12, 14, 16, 18, 20, 24, 30, 36, 48, 60px only (11px wordmark size removed). No weight above 600.
- Above the fold: one CTA ("Start free"), proof line, real product visual.
- Tagline reveal: words start at 30% opacity and turn on one by one (Playwright reads computed opacity per word mid scroll and after); full opacity at once under reduced motion.
- Lighthouse 12 mobile performance (local `next start`, this CI container): `/pricing` 0.98 on three runs; `/` median 0.95 over six runs (0.92 to 0.98). Observed LCP equals FCP (about 210ms); the simulated LCP is the spread.
