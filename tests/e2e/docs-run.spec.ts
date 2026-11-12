import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { product } from "../../src/config/product";
import { docs } from "../../src/content/docs";
import { operationCurl } from "../../src/lib/docs-curl";
import { operations } from "../../src/lib/openapi";
import { homeConnectCurl } from "../../src/lib/snippets";

// "Docs must work": every curl, Python, Go and TypeScript sample in the in-app docs (src/content/docs), the /docs/api
// reference and the home page is EXECUTED against the running app. Provider mailboxes are replaced by the local sandbox
// backend (src/lib/backends/sandbox.ts, E2E only). The self-host page is the only exception: it needs Docker and a VM.
// Webhook signature samples are executed in tests/unit/docs-samples.test.ts.

const PROD = product.url.replace(/\/+$/, "");
const SKIP_PAGES = new Set(["self-host"]);

async function setup(page: Page, baseURL: string) {
  const email = `docs+${Date.now()}@studio.test`;
  const origin = { origin: baseURL };
  await page.request.post("/api/auth/sign-in/magic-link", { data: { email, callbackURL: "/app" }, headers: origin });
  const box = await (await page.request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json();
  await page.goto(/https?:\/\/\S+magic-link\/verify\S+/.exec(box.messages.at(-1).text)![0]);
  const org = await page.request.post("/api/auth/organization/create", { data: { name: "Docs Runner", slug: `docs-${Date.now()}` }, headers: origin });
  const orgId = (await org.json()).id as string;
  await page.request.post("/api/auth/organization/set-active", { data: { organizationId: orgId }, headers: origin });
  const key = await page.request.post("/api/auth/api-key/create", { data: { name: "docs", organizationId: orgId, metadata: { scopes: ["read", "send", "admin"] } }, headers: origin });
  expect(key.ok()).toBeTruthy();
  const seed = await page.request.post("/api/dev/seed?sandbox=1", { headers: origin });
  expect(seed.ok()).toBeTruthy();
  return { orgId, key: (await key.json()).key as string, accountId: (await seed.json()).accountId as string };
}

const local = (code: string, base: string) => code.split(PROD).join(base).split(`https://${product.host}`).join(base);

/** Runs a bash sample; curl fails the step on any HTTP error and prints the body. */
function bash(code: string, env: Record<string, string>) {
  const prelude = `set -e\ncurl() { command curl -sS --fail-with-body --max-time 30 "$@"; echo; }\n`;
  return execFileSync("bash", ["-c", prelude + code], { env: { ...process.env, ...env }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

test.describe.configure({ mode: "serial" });

test("every bash sample in the docs runs and succeeds against the app", async ({ page, baseURL }) => {
  const s = await setup(page, baseURL!);
  const env = { INBOXWIRE_KEY: s.key, ACCOUNT_ID: s.accountId };
  let ran = 0;
  for (const d of docs) {
    if (SKIP_PAGES.has(d.slug)) continue;
    for (const sec of d.sections) {
      if (sec.code?.lang !== "bash") continue;
      const code = local(sec.code.code, baseURL!).replace("your_key_here", s.key);
      let out = "";
      try { out = bash(code, env); } catch (e) { throw new Error(`/docs/${d.slug} "${sec.heading}" failed:\n${code}\n${(e as { stdout?: string; stderr?: string }).stdout}${(e as { stderr?: string }).stderr}`); }
      expect(out.length, `${d.slug} ${sec.heading}`).toBeGreaterThan(0);
      ran++;
    }
  }
  expect(ran).toBeGreaterThanOrEqual(4);

  // Home page connect-link example
  const home = bash(local(homeConnectCurl(PROD), baseURL!).split("\n\n#")[0]!, env);
  const created = JSON.parse(home) as { url: string; expiresAt: string; environment: string };
  expect(created.url).toContain(`${baseURL}/connect/cl_`);
  expect(created.environment).toBe("production");
  expect(Date.parse(created.expiresAt)).toBeGreaterThan(Date.now());
  // The documented response shape on the home page names the real fields.
  expect(homeConnectCurl(PROD)).toContain('"expiresAt"');
});

test("every /docs/api curl runs against the app (destructive calls last)", async ({ page, baseURL }) => {
  const s = await setup(page, baseURL!);
  const env = { INBOXWIRE_KEY: s.key };
  const run = (id: string, ids: Parameters<typeof operationCurl>[2]) => {
    const op = operations.find((o) => o.id === id)!;
    const code = operationCurl(op, baseURL!, ids);
    try { return bash(code, env); } catch (e) { throw new Error(`/docs/api ${id} failed:\n${code}\n${(e as { stdout?: string }).stdout}${(e as { stderr?: string }).stderr}`); }
  };
  const ids = { account: s.accountId, message: "sbx_3", attachment: "att_1", outbox: "", webhook: "", delivery: "" };
  const sent = JSON.parse(run("sendMessage", ids)) as { id: string };
  ids.outbox = sent.id;
  const hook = JSON.parse(run("createWebhook", ids)) as { id: string };
  ids.webhook = hook.id;
  const order = ["listAccounts", "getAccount", "getUsage", "createConnectLink", "listFolders", "listMessages", "getMessage", "listAttachments", "getAttachment", "getOutboxItem", "listWebhooks", "getWebhook", "updateWebhook", "listDeliveries", "replayFailedDeliveries"];
  for (const id of order) run(id, ids);
  // replayDelivery needs a logged delivery: the dev seed adds a delivery log, then the documented curl replays one.
  expect((await page.request.post("/api/dev/seed", { headers: { origin: baseURL! } })).ok()).toBeTruthy();
  const list = JSON.parse(run("listDeliveries", ids)) as { items: { id: string }[] };
  expect(list.items.length).toBeGreaterThan(0);
  ids.delivery = list.items[0]!.id;
  run("replayDelivery", ids);
  run("deleteWebhook", ids);
  run("deleteAccount", ids);
  const covered = new Set([...order, "sendMessage", "createWebhook", "deleteWebhook", "deleteAccount", "replayDelivery"]);
  expect(operations.map((o) => o.id).filter((id) => !covered.has(id))).toEqual([]);
});

test("Python, Go and TypeScript quickstart samples run against the app", async ({ page, baseURL }) => {
  const s = await setup(page, baseURL!);
  const qs = docs.find((d) => d.slug === "quickstart")!;
  const sample = (lang: string, heading?: string) => local(qs.sections.find((x) => x.code?.lang === lang && (!heading || x.heading === heading))!.code!.code, baseURL!);
  const dir = mkdtempSync(join(tmpdir(), "iw-docs-"));
  const env = { ...process.env, INBOXWIRE_KEY: s.key, HOME: dir, GOCACHE: join(dir, "gocache"), GOPATH: join(dir, "gopath"), GOFLAGS: "", GO111MODULE: "off" };

  // Python: `requests` is not installed in CI (no network), so a faithful urllib-backed stand-in provides the same calls.
  mkdirSync(join(dir, "py"));
  writeFileSync(join(dir, "py", "requests.py"), REQUESTS_SHIM);
  writeFileSync(join(dir, "py", "quickstart.py"), sample("python", "Python"));
  const py = execFileSync("python3", [join(dir, "py", "quickstart.py")], { env: { ...env, PYTHONPATH: join(dir, "py") }, encoding: "utf8", cwd: join(dir, "py") });
  expect(py).toContain("Invoice 1042");

  // Go: standard library only.
  writeFileSync(join(dir, "main.go"), sample("go", "Go"));
  const go = execFileSync("go", ["run", join(dir, "main.go")], { env, encoding: "utf8", cwd: dir, timeout: 120_000 });
  expect(go).toContain("me@sandbox.example");

  // TypeScript SDK: same code, the client pointed at this server (the sample's default is the production URL).
  const ts = sample("ts", "TypeScript").replace("createClient({ apiKey: process.env.INBOXWIRE_KEY! })", `createClient({ apiKey: process.env.INBOXWIRE_KEY!, baseUrl: ${JSON.stringify(`${baseURL}/v1`)} })`);
  expect(ts).toContain(`baseUrl: ${JSON.stringify(`${baseURL}/v1`)}`);
  const tsDir = join(process.cwd(), "test-results", "docs-run");
  mkdirSync(tsDir, { recursive: true });
  writeFileSync(join(tsDir, "quickstart.mts"), ts);
  const out = execFileSync("npx", ["tsx", join(tsDir, "quickstart.mts")], { env, encoding: "utf8", timeout: 120_000 });
  expect(out).toContain("Lunch on Friday?");
});

const REQUESTS_SHIM = `
import json as _json, urllib.request, urllib.parse, urllib.error

class HTTPError(Exception):
    pass

class Response:
    def __init__(self, status, body):
        self.status_code = status
        self.text = body.decode()
    def json(self):
        return _json.loads(self.text)
    def raise_for_status(self):
        if self.status_code >= 400:
            raise HTTPError(f"{self.status_code}: {self.text}")

def request(method, url, headers=None, params=None, json=None, timeout=None):
    if params:
        url += "?" + urllib.parse.urlencode(params)
    data = None
    h = dict(headers or {})
    if json is not None:
        data = _json.dumps(json).encode()
        h["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return Response(r.status, r.read())
    except urllib.error.HTTPError as e:
        return Response(e.code, e.read())

def get(url, **kw):
    return request("GET", url, **kw)

def post(url, **kw):
    return request("POST", url, **kw)
`;
