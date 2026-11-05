import { product as p } from "@/config/product";
import type { DocPage } from "./types";

const base = `${p.url}/v1`;

export const quickstart: DocPage = {
  slug: "quickstart",
  title: "Quickstart by language",
  description: "Connect a mailbox, list its messages, send with an idempotency key and verify a webhook, in curl, TypeScript, Python and Go.",
  sections: [
    {
      heading: "Before you start",
      body: [
        "You need an API key (Keys in the dashboard, scope read to list and search, send to send, admin to create connect links and webhooks) and, for Gmail or Microsoft 365, your own OAuth client saved under OAuth clients. IMAP mailboxes need no client.",
        `Every example uses ${base}. Self-hosting? Use your own URL instead. Add an x-environment header (development, staging or production) to pick an environment; production is the default.`,
      ],
    },
    {
      heading: "1. Create a connect link (curl)",
      body: ["Send your user to the returned url. It works once, for 24 hours. After they finish, an accountConnected webhook fires and the line appears in the dashboard."],
      code: { lang: "bash", code: `curl -X POST ${base}/connect-links \\\n  -H "Authorization: Bearer $INBOXWIRE_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"externalId":"user_42","redirectUrl":"https://app.example.com/connected"}'` },
    },
    {
      heading: "2. List messages (curl)",
      body: ["q accepts one syntax on every provider: from:, to:, subject:, after:, before:, has:attachment and plain words."],
      code: { lang: "bash", code: `curl -G ${base}/accounts/$ACCOUNT_ID/messages \\\n  -H "Authorization: Bearer $INBOXWIRE_KEY" \\\n  --data-urlencode "q=from:billing@example.com has:attachment" \\\n  --data-urlencode "limit=20"` },
    },
    {
      heading: "TypeScript",
      body: ["The SDK is generated from the OpenAPI document (packages/sdk in the repository, @buffersol/inboxwire-sdk once published). Methods are typed from the same schemas the server validates with."],
      code: { lang: "ts", code: `import { createClient } from "@buffersol/inboxwire-sdk";\n\nconst inboxwire = createClient({ apiKey: process.env.INBOXWIRE_KEY! });\n\nconst { items } = await inboxwire.listAccounts();\nconst page = await inboxwire.listMessages({ id: items[0].id, query: { q: "after:2026-11-01", limit: 20 } });\nconsole.log(page.items.map((m) => m.subject));\n\n// Safe to retry: the same key returns the same outbox item for 7 days.\nawait inboxwire.sendMessage({\n  id: items[0].id,\n  idempotencyKey: "invoice-1042",\n  body: { to: [{ address: "ana@example.com" }], subject: "Your invoice", text: "Attached." },\n});` },
    },
    {
      heading: "Python",
      body: ["No SDK needed; the API is plain JSON over HTTPS."],
      code: { lang: "python", code: `import os, requests\n\nAPI = "${base}"\nH = {"Authorization": f"Bearer {os.environ['INBOXWIRE_KEY']}"}\n\naccounts = requests.get(f"{API}/accounts", headers=H, timeout=30).json()["items"]\nr = requests.get(f"{API}/accounts/{accounts[0]['id']}/messages", headers=H, params={"q": "from:billing@example.com", "limit": 20}, timeout=30)\nr.raise_for_status()\nfor m in r.json()["items"]:\n    print(m["subject"])\n\nrequests.post(\n    f"{API}/accounts/{accounts[0]['id']}/messages/send",\n    headers={**H, "Idempotency-Key": "invoice-1042"},\n    json={"to": [{"address": "ana@example.com"}], "subject": "Your invoice", "text": "Attached."},\n    timeout=30,\n).raise_for_status()  # 202, queued` },
    },
    {
      heading: "Go",
      body: ["Standard library only."],
      code: { lang: "go", code: `package main\n\nimport (\n\t"encoding/json"\n\t"fmt"\n\t"net/http"\n\t"os"\n)\n\nfunc main() {\n\treq, _ := http.NewRequest("GET", "${base}/accounts", nil)\n\treq.Header.Set("Authorization", "Bearer "+os.Getenv("INBOXWIRE_KEY"))\n\tres, err := http.DefaultClient.Do(req)\n\tif err != nil {\n\t\tpanic(err)\n\t}\n\tdefer res.Body.Close()\n\tvar out struct {\n\t\tItems []struct{ ID, Email, State string } \`json:"items"\`\n\t}\n\tjson.NewDecoder(res.Body).Decode(&out)\n\tfor _, a := range out.Items {\n\t\tfmt.Println(a.Email, a.State)\n\t}\n}` },
    },
    {
      heading: "Verify a webhook: Node",
      body: ["Verify the signature on the raw body before you parse it. The header is Inboxwire-Signature: t=<unix>,v1=<hex>, the HMAC-SHA256 of t.rawBody with your endpoint secret. Reject anything older than five minutes."],
      code: { lang: "ts", code: `import { verifyWebhook } from "@buffersol/inboxwire-sdk";\n\nexport async function POST(req: Request) {\n  const raw = await req.text();\n  const ok = await verifyWebhook(process.env.INBOXWIRE_WEBHOOK_SECRET!, raw, req.headers.get("inboxwire-signature"));\n  if (!ok) return new Response("bad signature", { status: 400 });\n  const event = JSON.parse(raw); // { id, type, created, data }\n  // Dedupe on event.id: retries and replays keep the same id.\n  return new Response("ok");\n}` },
    },
    {
      heading: "Verify a webhook: Python",
      body: ["Use a constant-time compare."],
      code: { lang: "python", code: `import hashlib, hmac, time\n\ndef verify(secret: str, raw_body: bytes, header: str, tolerance: int = 300) -> bool:\n    parts = dict(p.split("=", 1) for p in header.split(","))\n    t = int(parts["t"])\n    if abs(time.time() - t) > tolerance:\n        return False\n    mac = hmac.new(secret.encode(), f"{t}.".encode() + raw_body, hashlib.sha256).hexdigest()\n    return hmac.compare_digest(mac, parts["v1"])` },
    },
    {
      heading: "Verify a webhook: Go",
      body: ["Read the body once, verify, then decode."],
      code: { lang: "go", code: `func verify(secret string, body []byte, header string) bool {\n\tvar t int64\n\tvar v1 string\n\tfor _, p := range strings.Split(header, ",") {\n\t\tkv := strings.SplitN(p, "=", 2)\n\t\tif len(kv) != 2 { continue }\n\t\tif kv[0] == "t" { t, _ = strconv.ParseInt(kv[1], 10, 64) }\n\t\tif kv[0] == "v1" { v1 = kv[1] }\n\t}\n\tif d := time.Now().Unix() - t; d > 300 || d < -300 { return false }\n\tmac := hmac.New(sha256.New, []byte(secret))\n\tfmt.Fprintf(mac, "%d.", t)\n\tmac.Write(body)\n\tgot, err := hex.DecodeString(v1)\n\treturn err == nil && hmac.Equal(mac.Sum(nil), got)\n}` },
    },
    {
      heading: "Errors, usage and deleting a mailbox",
      body: [
        "Errors are JSON: {\"error\": \"code\"}. 402 mailbox_limit means the plan's mailbox allowance is full (Developer and Cloud Starter); Cloud Growth bills extra mailboxes instead. GET /v1/usage returns used, included and extra mailboxes.",
        "DELETE /v1/accounts/{id} (admin scope) revokes the Google token, deletes the account, its credentials and queued sends, and returns a deletionRecordId you can keep as evidence.",
      ],
    },
  ],
};
