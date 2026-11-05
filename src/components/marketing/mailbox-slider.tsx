"use client";
import { useState } from "react";
import { emailengine, nylas, READ_ON } from "@/config/competitors";
import { product } from "@/config/product";
import { cloudBill, emailengineMonthly, nylasBill, selfHostMonthly } from "@/lib/pricing";

const MIN = 1;
const MAX = 1000;

const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: product.currency.toUpperCase(), minimumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);

export function MailboxSlider({ id = "mailbox-slider" }: { id?: string }) {
  const [n, setN] = useState(100);
  const clamp = (v: number) => Math.min(MAX, Math.max(MIN, Math.round(v) || MIN));
  const cloud = cloudBill(n);
  const nyl = nylasBill(n);
  const rows = [
    { key: "cloud", name: `${product.name} Cloud`, cents: cloud.cents, note: cloud.label, ours: true },
    { key: "self", name: `${product.name} Self-host`, cents: selfHostMonthly(), note: "Unlimited mailboxes, billed yearly", ours: true },
    { key: "ee", name: `${emailengine.name} (${emailengine.host})`, cents: emailengineMonthly(), note: `${money(emailengine.yearlyUsd)} a year, unlimited mailboxes`, ours: false },
    { key: "ny", name: nylas.name, cents: nyl.cents, note: `${nyl.label}, published monthly rate`, ours: false },
  ];
  const top = Math.max(...rows.map((r) => r.cents), 1);

  return (
    <div id={id} className="grid gap-8 lg:grid-cols-12 lg:gap-16">
      <div className="flex flex-col gap-6 lg:col-span-5">
        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-count`} className="title-3 text-text">How many mailboxes will you connect?</label>
          <input
            id={`${id}-count`}
            type="number"
            inputMode="numeric"
            min={MIN}
            max={MAX}
            value={n}
            onChange={(e) => setN(clamp(Number(e.target.value)))}
            className="block min-h-11 w-32 rounded-md border border-border-strong bg-surface px-3 py-2 body-6 tabular-nums text-text focus-visible:focus-ring"
          />
        </div>
        <input
          type="range"
          aria-label="Mailbox count"
          min={MIN}
          max={MAX}
          value={n}
          onChange={(e) => setN(clamp(Number(e.target.value)))}
          className="h-11 w-full accent-action focus-visible:focus-ring"
        />
        <div className="caption-2 flex justify-between text-text-subtle"><span>{MIN}</span><span>{MAX}</span></div>
        <p className="body-6 text-text-subtle">
          Cloud Growth includes 100 mailboxes. Each one above that is {money(product.extraMailbox.usd)} a month, prorated daily. Self-host has no mailbox limit.
        </p>
      </div>

      <div className="lg:col-span-7" aria-live="polite">
        <p className="title-3 mb-4 text-text">Monthly bill for {n.toLocaleString("en-US")} mailboxes</p>
        <ul className="flex flex-col">
          {rows.map((r) => (
            <li key={r.key} className="border-t border-border py-4 last:border-b">
              <div className="flex items-baseline justify-between gap-4">
                <span className={r.ours ? "title-2 text-text" : "title-2 text-text-subtle"}>{r.name}</span>
                <span className="heading-6 tabular-nums text-text">{r.cents === 0 ? "$0" : money(r.cents)}<span className="body-6 text-text-subtle"> a month</span></span>
              </div>
              <div aria-hidden className="mt-2 h-2 rounded-sm bg-surface-sunken">
                <div className={r.ours ? "h-2 rounded-sm bg-action" : "h-2 rounded-sm bg-border-strong"} style={{ width: `${Math.max(2, Math.round((r.cents / top) * 100))}%` }} />
              </div>
              <p className="caption-2 mt-2 text-text-subtle">{r.note}</p>
            </li>
          ))}
        </ul>
        <p className="caption-2 mt-4 text-text-subtle">
          Compared with the {money(emailengine.yearlyUsd)}/yr licence at {emailengine.host} and Nylas&apos; published monthly rates, read {READ_ON}. Competitor prices change; check theirs before you decide.
        </p>
      </div>
    </div>
  );
}
