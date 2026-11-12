# Self-host guide

Inboxwire by BufferSol runs on your own server as three containers: `app` (dashboard + REST API), `worker` (calls the app's cron endpoints every minute: IMAP polling, webhook retries, outbox, watch renewal, post-cancel purge) and `mongo`. The same material is published as `/docs/self-host`.

## Requirements
- A Linux host with Docker 24+ and Compose v2, 2 GB RAM, 10 GB disk (mail bodies are not stored).
- A public HTTPS URL (OAuth redirects and provider push need it). Put Caddy, nginx or a cloud load balancer in front of port 3000.
- Your own Google and/or Microsoft OAuth clients (BYO only). Google's yearly CASA assessment for restricted scopes applies to your app wherever our code runs (see `/casa`).

## Install
```sh
git clone https://github.com/ahmadkhancodes/inboxwire && cd inboxwire
cat > .env <<'EOF'
NEXT_PUBLIC_APP_URL=https://mail.example.com
BETTER_AUTH_SECRET=<openssl rand -base64 32>
MASTER_KEY=<openssl rand -base64 32>
CRON_SECRET=<openssl rand -hex 24>
ALTCHA_HMAC_KEY=<openssl rand -hex 24>
ADMIN_EMAILS=you@example.com
EOF
# replace each <...> with the output of the command inside it, then:
docker compose up -d
```
`docker-compose.yml` refuses to start when a required secret is missing and prints the command that makes it.

**Back up `MASTER_KEY`.** It wraps the per-organisation keys that encrypt mailbox credentials and OAuth client secrets. Without it every stored credential is unreadable and every user has to reconnect.

## First sign-in (the admin URL)
Open `NEXT_PUBLIC_APP_URL` and enter an address from `ADMIN_EMAILS`. With `MAIL_PROVIDER=console` (the default) the magic link is printed in `docker compose logs app`. Set `MAIL_PROVIDER=smtp` or `resend` plus `MAIL_FROM` for real email.

## Licence
1. Buy the Self-host plan on the hosted site. When the invoice is paid, an Ed25519 licence key appears in **Billing**.
2. Set it as `INBOXWIRE_LICENCE` in `.env` and run `docker compose up -d`.
3. The key is verified **offline** against `/app/licence-public.pem`, baked into the image at build time. Nothing phones home.

| State | When | What happens |
|---|---|---|
| valid | until expiry (+/- 24 h clock skew) | Self-host plan: no limits |
| grace | up to 30 days after expiry | Everything works, the dashboard shows a warning banner |
| expired | after the grace period | Developer limits (3 mailboxes), banner |
| invalid | tampered or malformed key | Developer limits, banner |

Check a key by hand (exit 0 valid, 2 grace, 1 expired or invalid):
```sh
docker compose run --rm --entrypoint node app scripts/verify-licence.mjs "$INBOXWIRE_LICENCE"
```
The container entrypoint runs the same check on every start and logs the result. It never refuses to start.

## Operate
- **Health:** `GET /api/health`. **Metrics:** `GET /metrics` with `Authorization: Bearer $METRICS_TOKEN` (Prometheus text: mailboxes by state, outbox and delivery counts).
- **Private networks:** IMAP/SMTP hosts and webhook URLs that resolve to loopback, private, link-local or single-label names are refused. If your mail server or webhook receiver is on your own network, set `ALLOW_PRIVATE_NETWORK_TARGETS=1`.
- **Backups:** the `mongo-data` volume, or `docker compose exec -T mongo mongodump --archive > backup.archive`.
- **Update:** set `INBOXWIRE_VERSION` to a release tag without the `v`, then `docker compose pull && docker compose up -d`. The worker creates the MongoDB indexes (the `ensure-indexes` job) each time it starts, so an update needs no manual step.
- **Delete a mailbox:** `DELETE /v1/accounts/{id}` revokes the Google token and writes a `deletion_record`.
- **Scaling:** the app is stateless. Run one `app` and one `worker` today; several `app` replicas behind a proxy work for the web and API, but horizontal scaling is not load-tested yet (the compare page says the same).

## Limits of the self-host build today
- IMAP changes are detected by polling (about 60 s), not IDLE. An IDLE worker is planned for always-on hosts.
- No bundled TLS termination, SMTP server or Prometheus/Grafana stack.
- The licence grace period shows a banner; it does not make the instance read-only.
- The image is built by `.github/workflows/docker.yml` on a `v*` tag; no image is published yet.
