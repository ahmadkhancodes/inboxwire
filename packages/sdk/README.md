# @buffersol/inboxwire-sdk

TypeScript client for the [Inboxwire by BufferSol](https://inboxwire.buffersoltech.com) API. Types and the operation table are generated from `/v1/openapi.json` (`npm run sdk:generate` in the repository root); the client and the webhook verifier are small and have no dependencies.

```ts
import { createClient, verifyWebhook } from "@buffersol/inboxwire-sdk";

const inboxwire = createClient({ apiKey: process.env.INBOXWIRE_KEY! });
const { items } = await inboxwire.listAccounts();
await inboxwire.sendMessage({ id: items[0].id, idempotencyKey: "order-1042", body: { to: [{ address: "ana@example.com" }], subject: "Hello", text: "Hi" } });

// In your webhook route, with the raw body string:
const ok = await verifyWebhook(process.env.INBOXWIRE_WEBHOOK_SECRET!, rawBody, req.headers.get("inboxwire-signature"));
```

Self-hosting? Pass `baseUrl: "https://mail.example.com/v1"`.
Publishing to npm needs an npm token (docs/MANUAL_STEPS.md); until then use it from the repository workspace.
