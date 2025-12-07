FROM node:22-slim

# VOLUME /data

ENV REPLICA_STORAGE_PATH=/data/replica/replica.db
ENV PGDATA=/data/postgresql

ENV PORT=8080
ENV NODE_OPTIONS="--enable-source-maps"

# # Install PostgreSQL
RUN apt-get update \
  && apt-get install -y --no-install-recommends postgresql \
  && rm -rf /var/lib/postgresql /var/lib/apt/lists/*

RUN mkdir -p "$PGDATA" \
  && chown -R postgres:postgres "$PGDATA"

# Build the app
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

EXPOSE $PORT

RUN ls -la && ls -la scripts && chmod +x scripts/entrypoint.sh

ENTRYPOINT [ "scripts/entrypoint.sh" ]
CMD ["pnpm", "start-self-hosted"]
