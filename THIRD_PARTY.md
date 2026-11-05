# Third-party libraries added for mail backends (M2)

| Package | Licence | Used for |
|---|---|---|
| `googleapis` | Apache-2.0 | Gmail API backend (`src/lib/backends/gmail.ts`, via the `gmail` subpath) |
| `@microsoft/microsoft-graph-client` | MIT | Microsoft Graph backend (`src/lib/backends/graph.ts`) |
| `imapflow` | MIT | IMAP backend (`src/lib/backends/imap.ts`) |

| `nodemailer` (M3) | MIT-0 (v10.3.1) | SMTP transport for IMAP/SMTP accounts' sends (`src/lib/backends/smtp.ts`). MIT-0 is MIT without the attribution clause, so it ships in the self-host image without conditions. No `@types` package: minimal typings live in `src/types/nodemailer.d.ts`. |

`google-auth-library` (Apache-2.0) comes with `googleapis` and is used only for its `OAuth2Client` token holder.
All three are permissive, so they can ship inside the self-host image. Re-check with `npx license-checker --summary` before each release.

**M4:** no new runtime dependency. The zip writer (`src/lib/zip.ts`), the SDK generator (`src/lib/sdk-gen.ts`), the Prometheus text output and the SSE stream use only the Node standard library. `packages/sdk` has no dependencies (MIT, ours). The Docker image adds only `node:22-bookworm-slim` (MIT) and, in compose, `mongo:7` (SSPL: it runs as a separate container the customer pulls themselves; Inboxwire does not redistribute it).
