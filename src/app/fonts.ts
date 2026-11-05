import { Chivo, Public_Sans, Martian_Mono } from "next/font/google";

// docs/DESIGN.md: Chivo display (600/800), Public Sans body, Martian Mono for IDs, events and code.
export const display = Chivo({ subsets: ["latin"], weight: ["600", "800"], variable: "--font-kit-display", display: "swap" });
export const sans = Public_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-kit-sans", display: "swap" });
export const mono = Martian_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-kit-mono", display: "swap" });
