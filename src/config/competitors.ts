/**
 * Competitor list prices used by the pricing-page mailbox slider. USD cents.
 * Source: docs/brief.md, competitor sheet. Every figure carries the date it was read.
 * Update the figures and `READ_ON` together, never one without the other.
 */
export const READ_ON = "3 Nov 2026";

export const emailengine = {
  name: "EmailEngine",
  host: "emailengine.app",
  /** Flat annual licence, unlimited mailboxes, annual billing only. */
  yearlyUsd: 145_000,
} as const;

export const nylas = {
  name: "Nylas",
  /** Published monthly tiers: [max accounts, monthly price]. Pro adds extraUsd per account above its allowance. */
  tiers: [
    { name: "Free", maxAccounts: 5, monthlyUsd: 0 },
    { name: "Essentials", maxAccounts: 10, monthlyUsd: 1_500 },
    { name: "Pro", maxAccounts: 25, monthlyUsd: 4_900 },
  ],
  proExtraMonthlyUsd: 200,
} as const;
