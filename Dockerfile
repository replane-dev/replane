FROM node:22-slim AS base

VOLUME /data

ENV REPLICA_STORAGE_PATH=/data/replica/replica.db
ENV PGDATA=/data/postgresql

# # Install PostgreSQL to allow running Replane without an external database
RUN apt-get update \
  && apt-get install -y --no-install-recommends postgresql \
  && rm -rf /var/lib/postgresql /var/lib/apt/lists/*

RUN mkdir -p "$PGDATA" \
  && chown -R postgres:postgres "$PGDATA"

FROM base AS builder

# Build the app
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM base AS runner
WORKDIR /app
COPY --from=builder /app/.next/standalone .next/standalone

ENV HOSTNAME=0.0.0.0
ENV PORT=8080

EXPOSE $PORT

COPY scripts/entrypoint.sh .

RUN chmod +x entrypoint.sh

ENTRYPOINT [ "./entrypoint.sh" ]
CMD [ "node", "--optimize-for-size", "--enable-source-maps", "--max-old-space-size=4096", ".next/standalone/server.js" ]
