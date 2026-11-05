import { api } from "./api";
import { authentication } from "./authentication";
import { billing } from "./billing";
import { gettingStarted } from "./getting-started";
import { quickstart } from "./quickstart";
import { selfHost } from "./self-host";
import type { DocPage } from "./types";
import { webhooks } from "./webhooks";

export type { DocPage, DocSection } from "./types";

export interface DocGroup {
  title: string;
  docs: DocPage[];
}

export const docs: DocPage[] = [gettingStarted, quickstart, authentication, billing, webhooks, api, selfHost];

export const docGroups: DocGroup[] = [
  { title: "Start here", docs: [gettingStarted, quickstart, authentication] },
  { title: "Build", docs: [api, webhooks, selfHost] },
  { title: "Account", docs: [billing] },
];

export const getDoc = (slug: string): DocPage | undefined => docs.find((d) => d.slug === slug);

export const sectionId = (heading: string): string =>
  heading.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
