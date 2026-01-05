FROM node:22-slim AS base

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

VOLUME /data

ARG EMBEDDED_POSTGRES=false
ENV EMBEDDED_POSTGRES=${EMBEDDED_POSTGRES}
ENV PGDATA=/data/postgresql

COPY scripts/install-pg.sh .
RUN chmod +x install-pg.sh
RUN ./install-pg.sh

# Install Python and datamodel-code-generator for Python type generation
RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 \
  python3-pip \
  && pip3 install --no-cache-dir --break-system-packages datamodel-code-generator \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/.next/standalone .next/standalone

ENV REPLICA_STORAGE_PATH=/data/replica/replica.db
ENV HOSTNAME=0.0.0.0
ENV PORT=8080

EXPOSE $PORT

COPY scripts/entrypoint.sh .

RUN chmod +x entrypoint.sh

ENTRYPOINT [ "./entrypoint.sh" ]
CMD [ "node", "--enable-source-maps", "--max-old-space-size=4096", ".next/standalone/server.js" ]
