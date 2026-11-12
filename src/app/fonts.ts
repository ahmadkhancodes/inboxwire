import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Sans_Condensed } from "next/font/google";

// Weights trimmed for mobile LCP (12 Nov 2026): headings are Semibold per the landing page library; mono is never the LCP, so it is not preloaded.
// docs/design-brief.md §6: one superfamily in three widths. Condensed for display, Sans for text, Mono for fields, ids and figures.
export const display = IBM_Plex_Sans_Condensed({ subsets: ["latin"], weight: ["600"], variable: "--font-kit-display", display: "swap" });
export const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-kit-sans", display: "swap" });
export const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-kit-mono", display: "swap", preload: false });
