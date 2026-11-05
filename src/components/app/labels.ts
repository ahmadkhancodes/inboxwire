import type { MeterId } from "@/config/product";

/** Product-facing names for each meter. A new product edits this map. */
export const METER_LABELS: Record<MeterId, { singular: string; plural: string; period: string }> = {
  mailboxes: { singular: "mailbox", plural: "mailboxes", period: "" },
  environments: { singular: "environment", plural: "environments", period: "" },
  seats: { singular: "seat", plural: "seats", period: "" },
  log_days: { singular: "day of delivery log", plural: "days of delivery log", period: "" },
  events: { singular: "event", plural: "events", period: "this month" },
};

export const METERS_SHOWN: MeterId[] = ["mailboxes", "environments", "seats"];
export const fmt = (n: number) => new Intl.NumberFormat("en").format(n);
