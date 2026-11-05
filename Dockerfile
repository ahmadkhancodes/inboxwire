# syntax=docker/dockerfile:1
# Inboxwire by BufferSol: self-host image. Build: docker build -t inboxwire .
# The licence PUBLIC key is baked in at build time (--build-arg LICENCE_PUBLIC_KEY="$(cat public.pem)"); the private key never enters an image.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/sdk/package.json packages/sdk/package.json
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 BUILD_STANDALONE=1 DB_DRIVER=memory
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p public && npm run build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ARG LICENCE_PUBLIC_KEY=""
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN useradd --system --uid 10001 --create-home inboxwire
COPY --from=build --chown=inboxwire /app/.next/standalone ./
COPY --from=build --chown=inboxwire /app/.next/static ./.next/static
COPY --from=build --chown=inboxwire /app/public ./public
COPY --chown=inboxwire scripts/verify-licence.mjs scripts/selfhost-cron.mjs scripts/docker-entrypoint.sh ./scripts/
RUN chmod +x scripts/docker-entrypoint.sh && if [ -n "$LICENCE_PUBLIC_KEY" ]; then printf '%s\n' "$LICENCE_PUBLIC_KEY" > /app/licence-public.pem; fi
USER inboxwire
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["scripts/docker-entrypoint.sh"]
CMD ["node", "server.js"]
