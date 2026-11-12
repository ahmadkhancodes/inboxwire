import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { docs } from "@/content/docs";
import { VERIFY_NODE } from "@/lib/docs-curl";
import { magicLinkEmail } from "@/lib/mail/templates";
import { signPayload } from "@/lib/webhooks/outbound";

// Executes the webhook-verification and self-host samples of the docs (the HTTP samples run in tests/e2e/docs-run.spec.ts).
const SECRET = "whsec_docs_sample";
const BODY = JSON.stringify({ id: "evt_1", type: "messageNew", created: 1, data: { accountId: "acc_1" } });
const code = (slug: string, heading: string) => docs.find((d) => d.slug === slug)!.sections.find((s) => s.heading === heading)!.code!.code;
const dir = mkdtempSync(join(tmpdir(), "iw-samples-"));
// Inside the repo so bare imports (@buffersol/inboxwire-sdk) resolve through node_modules.
const repoTmp = resolve("test-results", "docs-samples");
mkdirSync(repoTmp, { recursive: true });

async function header(t = Math.floor(Date.now() / 1000)) { return signPayload(SECRET, BODY, t); }
async function tampered() { return (await header()).replace(/v1=./, (m) => `v1=${m.at(-1) === "0" ? "1" : "0"}`); }

describe("webhook verification samples accept our real signature and reject forgeries", () => {
  it("/docs/webhooks Node sample", async () => {
    const f = join(dir, "webhooks.mjs");
    writeFileSync(f, code("webhooks", "Verify a signature in Node"));
    const { verify } = await import(pathToFileURL(f).href);
    expect(verify(BODY, await header(), SECRET)).toBe(true);
    expect(verify(BODY, await tampered(), SECRET)).toBe(false);
    expect(verify(BODY, await header(Math.floor(Date.now() / 1000) - 600), SECRET)).toBe(false);
  });

  it("/docs/api Node sample", async () => {
    const f = join(dir, "api.mjs");
    writeFileSync(f, VERIFY_NODE);
    const { verify } = await import(pathToFileURL(f).href);
    expect(verify(SECRET, BODY, await header())).toBe(true);
    expect(verify(SECRET, BODY + " ", await header())).toBe(false);
  });

  it("/docs/quickstart Node handler with the SDK's verifyWebhook", async () => {
    const f = join(repoTmp, "handler.ts");
    writeFileSync(f, code("quickstart", "Verify a webhook: Node"));
    process.env.INBOXWIRE_WEBHOOK_SECRET = SECRET;
    const { POST } = await import(pathToFileURL(f).href);
    const req = async (h: string) => POST(new Request("https://app.example.com/hooks", { method: "POST", body: BODY, headers: { "inboxwire-signature": h } }));
    expect((await req(await header())).status).toBe(200);
    expect((await req(await tampered())).status).toBe(400);
  });

  it("/docs/quickstart Python sample", async () => {
    const f = join(dir, "verify.py");
    writeFileSync(f, `${code("quickstart", "Verify a webhook: Python")}\n\nimport sys\nprint(verify(sys.argv[1], sys.argv[2].encode(), sys.argv[3]))\n`);
    const run = (h: string) => execFileSync("python3", ["-I", f, SECRET, BODY, h], { encoding: "utf8" }).trim();
    expect(run(await header())).toBe("True");
    expect(run(await tampered())).toBe("False");
  });

  it("/docs/quickstart Go sample", async () => {
    const f = join(dir, "verify.go");
    writeFileSync(f, `package main\n\nimport (\n\t"crypto/hmac"\n\t"crypto/sha256"\n\t"encoding/hex"\n\t"fmt"\n\t"os"\n\t"strconv"\n\t"strings"\n\t"time"\n)\n\n${code("quickstart", "Verify a webhook: Go")}\n\nfunc main() { fmt.Println(verify(os.Args[1], []byte(os.Args[2]), os.Args[3])) }\n`);
    const env = { ...process.env, HOME: dir, GOCACHE: join(dir, "gocache"), GOPATH: join(dir, "gopath"), GO111MODULE: "off" };
    const good = await header();
    const bad = await tampered();
    const out = execFileSync("bash", ["-c", `go run "$0" "$1" "$2" "$3" && go run "$0" "$1" "$2" "$4"`, f, SECRET, BODY, good, bad], { env, encoding: "utf8", timeout: 120_000 });
    expect(out.trim().split("\n")).toEqual(["true", "false"]);
  }, 150_000);
});

describe("self-host quickstart", () => {
  const sample = code("self-host", "Start it");

  it("the .env block generates every secret docker-compose.yml requires", () => {
    const envBlock = /cat > \.env <<EOF\n[\s\S]*?\nEOF/.exec(sample)?.[0];
    expect(envBlock).toBeTruthy();
    const d = mkdtempSync(join(tmpdir(), "iw-selfhost-"));
    copyFileSync("docker-compose.yml", join(d, "docker-compose.yml"));
    execFileSync("bash", ["-c", envBlock!], { cwd: d });
    const clean = { ...process.env };
    for (const k of ["NEXT_PUBLIC_APP_URL", "BETTER_AUTH_SECRET", "MASTER_KEY", "CRON_SECRET", "ALTCHA_HMAC_KEY"]) delete clean[k];
    // Passes with the documented .env, and refuses without it (printing the command that makes the secret).
    execFileSync("docker", ["compose", "config", "-q"], { cwd: d, env: clean });
    copyFileSync(join(d, ".env"), join(d, "env.bak"));
    writeFileSync(join(d, ".env"), "");
    let err = "";
    try { execFileSync("docker", ["compose", "config", "-q"], { cwd: d, env: clean, stdio: "pipe" }); } catch (e) { err = String((e as { stderr?: Buffer }).stderr); }
    expect(err).toMatch(/openssl rand|NEXT_PUBLIC_APP_URL/);
  });

  it("the documented log grep finds the printed magic link", () => {
    const grep = /docker compose logs app \| (grep .+)$/m.exec(sample)?.[1];
    expect(grep).toBeTruthy();
    // What the console mailer prints with MAIL_CONSOLE_PRINT=1 (the docker-compose default).
    const printed = `\n--- mail 1 ---\n${magicLinkEmail("https://mail.example.com/api/auth/magic-link/verify?token=abc&callbackURL=%2Fapp").text}\n---\n`;
    const out = execFileSync("bash", ["-c", grep!], { input: printed, encoding: "utf8" });
    expect(out).toContain("https://mail.example.com/api/auth/magic-link/verify?token=abc");
  });
});
