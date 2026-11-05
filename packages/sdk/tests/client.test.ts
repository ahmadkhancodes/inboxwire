import { describe, expect, it } from "vitest";
import { createClient, InboxwireError, operations, signWebhook, verifyWebhook } from "../src";

type Call = { url: string; init: RequestInit };
function fakeFetch(responses: (Response | Error)[]) {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = responses.shift() ?? new Response("{}", { status: 200 });
    if (r instanceof Error) throw r;
    return r;
  }) as unknown as typeof fetch;
  return { f, calls };
}
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });

describe("client", () => {
  it("builds the URL, path params, query and auth headers", async () => {
    const { f, calls } = fakeFetch([json({ items: [] })]);
    const c = createClient({ apiKey: "k1", baseUrl: "https://mail.example.com/v1/", environment: "staging", fetch: f });
    await c.listMessages({ id: "acc/1", query: { q: "from:a@b.test", limit: 5, folder: undefined } });
    expect(calls[0]!.url).toBe("https://mail.example.com/v1/accounts/acc%2F1/messages?q=from%3Aa%40b.test&limit=5");
    expect(calls[0]!.init.method).toBe("GET");
    expect(calls[0]!.init.headers).toMatchObject({ authorization: "Bearer k1", "x-environment": "staging" });
    expect(calls[0]!.init.body).toBeUndefined();
  });

  it("sends JSON bodies and the Idempotency-Key", async () => {
    const { f, calls } = fakeFetch([json({ id: "ob1", status: "queued" }, 202)]);
    const c = createClient({ apiKey: "k", fetch: f });
    const r = await c.sendMessage({ id: "a1", idempotencyKey: "order-9", body: { to: [{ address: "x@y.test" }], text: "hi" } });
    expect(r).toMatchObject({ id: "ob1" });
    expect(calls[0]!.url).toBe("https://inboxwire.buffersoltech.com/v1/accounts/a1/messages/send");
    expect(calls[0]!.init.method).toBe("POST");
    expect(calls[0]!.init.headers).toMatchObject({ "content-type": "application/json", "idempotency-key": "order-9" });
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ to: [{ address: "x@y.test" }], text: "hi" });
  });

  it("throws InboxwireError with status, code and details", async () => {
    const { f } = fakeFetch([json({ error: "mailbox_limit", details: { limit: 3 } }, 402)]);
    const err = await createClient({ apiKey: "k", fetch: f }).getUsage().catch((e) => e);
    expect(err).toBeInstanceOf(InboxwireError);
    expect(err).toMatchObject({ status: 402, code: "mailbox_limit", details: { limit: 3 } });
  });

  it("retries GET on 5xx but never an un-keyed send", async () => {
    const g = fakeFetch([json({}, 503, { "retry-after": "0" }), json({ items: [] })]);
    await createClient({ apiKey: "k", fetch: g.f }).listAccounts();
    expect(g.calls).toHaveLength(2);
    const p = fakeFetch([json({ error: "x" }, 503), json({ id: "ok" }, 202)]);
    await expect(createClient({ apiKey: "k", fetch: p.f }).sendMessage({ id: "a", body: { to: [{ address: "a@b.test" }], text: "t" } })).rejects.toMatchObject({ status: 503 });
    expect(p.calls).toHaveLength(1);
  });

  it("returns ArrayBuffer for downloads and requires path params", async () => {
    const { f } = fakeFetch([new Response(new Uint8Array([1, 2, 3]))]);
    const c = createClient({ apiKey: "k", fetch: f });
    expect(new Uint8Array(await c.getAttachment({ id: "a", mid: "m", aid: "x" }))).toEqual(new Uint8Array([1, 2, 3]));
    await expect(c.getAccount({ id: "" })).rejects.toThrow(/missing path parameter: id/);
  });

  it("has a client method for each operation in the table", () => {
    const c = createClient({ apiKey: "k", fetch: fakeFetch([]).f }) as unknown as Record<string, unknown>;
    for (const id of Object.keys(operations)) expect(typeof c[id]).toBe("function");
    expect(Object.keys(operations)).toEqual(expect.arrayContaining(["getUsage", "deleteAccount", "replayDelivery"]));
  });
});

describe("webhook verification", () => {
  const body = '{"id":"e1","type":"messageNew"}';
  it("accepts a fresh valid signature and rejects tampering, wrong secret and old timestamps", async () => {
    const now = 1_800_000_000;
    const h = await signWebhook("whsec_a", body, now);
    expect(h).toMatch(/^t=1800000000,v1=[0-9a-f]{64}$/);
    expect(await verifyWebhook("whsec_a", body, h, { now })).toBe(true);
    expect(await verifyWebhook("whsec_a", body + " ", h, { now })).toBe(false);
    expect(await verifyWebhook("whsec_b", body, h, { now })).toBe(false);
    expect(await verifyWebhook("whsec_a", body, h, { now: now + 301 })).toBe(false);
    expect(await verifyWebhook("whsec_a", body, h, { now: now + 301, toleranceSeconds: 600 })).toBe(true);
    for (const bad of [null, "", "garbage", "t=abc,v1=00", `t=${now}`]) expect(await verifyWebhook("whsec_a", body, bad, { now })).toBe(false);
  });
  it("interoperates with the server's signer (mailcore sign: HMAC-SHA256 of t.body)", async () => {
    const { createHmac } = await import("node:crypto");
    const t = 1_800_000_000;
    const serverSide = `t=${t},v1=${createHmac("sha256", "whsec_a").update(`${t}.${body}`).digest("hex")}`;
    expect(await verifyWebhook("whsec_a", body, serverSide, { now: t })).toBe(true);
  });
});
