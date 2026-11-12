# Design QA scorecard (DESIGN_PLAYBOOK §9)

Run 5 Nov 2026 on a production build (`npm run build && npm start`, memory driver). Screenshots: `docs/qa/2026-11-05/` (375 and 1440, light; routes `/`, `/pricing`, `/docs`, `/docs/getting-started`, `/legal/privacy`, `/legal/terms`, `/compare/emailengine`, `/status`, `/casa`, `/sign-in`, 404). `scripts/screenshots.ts` also fails on horizontal overflow: none found at 375 or 1440.

| # | Category | Score | Worst problem |
|---|---|---|---|
| 1 | Message clarity | 5 | Hero H1 names the three providers and "one API"; single primary CTA "Start free". |
| 2 | ICP fit | 4 | Amber "lamp" accent and mono wordmark differ from the competitors' blue/enterprise look; the palette is still pending the orchestrator's registry check. |
| 3 | Hero and product proof | 4 | Live ticker panel uses example addresses (marked as examples); crop at 375 is ticker only. |
| 4 | Structure and rhythm | 4 | New pages follow the same section rhythm; /status is deliberately plain. |
| 5 | Typography | 5 | Only named scale utilities; no arbitrary sizes found by grep. |
| 6 | Spacing and radius | 4 | Token spacing only; status strip bars use `rounded-sm` at 3 px wide, which reads as flat. |
| 7 | Color and contrast | 4 | One accent, flat surfaces. Warning-tone text in the `Most popular` label was not re-measured. |
| 8 | Motion and states | 4 | Slider and calculator are instant (no motion). Status page has empty ("no data yet") and error (notice) states. |
| 9 | Content honesty | 5 | Competitor prices dated 3 Nov 2026 and sourced from docs/brief.md; CASA costs marked as estimates; kit download stated as not yet live; legal placeholders flagged. |
| 10 | Responsive and ship | 4 | No overflow at 375; 44 px targets; meta/OG on new pages. |

**Total 43/50. No category below 3. Hard fails: none** (greps for arbitrary sizes, banned fonts, gradients, `transition-all`, banned words and `href="#"` are clean; the only `linear-gradient` besides the hero text is the hard-stop half fill in the "syncing" lamp shape, which is a symbol, not a background).

## Failures found and fixed this pass
- **Header at 375**: `Sign in` and `Start free` showed and clipped the menu button, because `buttonClass` sets `inline-flex`, which overrode `hidden`. Now `max-md:hidden`. The wordmark tab no longer wraps.
- **Footer** linked to `/compare/web3forms` (404); now `/compare/emailengine`, plus CASA kit and Status links.
- **Compare page final CTA** talked about forms; now about mailboxes.
- **Legal pages** described a form product; rewritten for Inboxwire.
- **Screenshot route list** pointed at dead routes; updated. The script waits for `load` instead of `networkidle`.

## Residual
- Palette registry check (amber) is still open with the orchestrator.
- Status page shows "no data yet" until the Mongo driver is set, since the memory driver does not share state between serverless instances.
