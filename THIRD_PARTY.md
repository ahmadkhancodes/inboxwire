# Third-party libraries added for mail backends (M2)

| Package | Licence | Used for |
|---|---|---|
| `googleapis` | Apache-2.0 | Gmail API backend (`src/lib/backends/gmail.ts`, via the `gmail` subpath) |
| `@microsoft/microsoft-graph-client` | MIT | Microsoft Graph backend (`src/lib/backends/graph.ts`) |
| `imapflow` | MIT | IMAP backend (`src/lib/backends/imap.ts`) |

`google-auth-library` (Apache-2.0) comes with `googleapis` and is used only for its `OAuth2Client` token holder.
All three are permissive, so they can ship inside the self-host image. Re-check with `npx license-checker --summary` before each release.
