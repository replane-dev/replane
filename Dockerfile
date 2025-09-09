###########
# Replane Production Dockerfile
# Multi-stage build for a Next.js 15 app using pnpm.
# Supports multi-arch when built via buildx (linux/amd64, linux/arm64).
###########

# 1) Base image
FROM node:22-slim AS base
WORKDIR /app
ENV NODE_ENV=production \
  NEXT_TELEMETRY_DISABLED=1

# 2) Dependencies (install all deps including dev for build)
FROM base AS deps
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# 3) Build
FROM base AS build
RUN corepack enable
ARG NEXT_PUBLIC_BUILD_SHA
ENV NEXT_PUBLIC_BUILD_SHA=$NEXT_PUBLIC_BUILD_SHA
COPY package.json pnpm-lock.yaml ./
COPY --from=deps /app/node_modules ./node_modules
COPY . .
COPY .env.example .env
RUN pnpm build

# 5) Runtime image
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
  NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_BUILD_SHA
ENV NEXT_PUBLIC_BUILD_SHA=$NEXT_PUBLIC_BUILD_SHA

# Copy production node_modules and build artifacts
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.ts ./next.config.ts

RUN corepack enable

EXPOSE 3000

# Basic healthcheck (adjust if you change the endpoint)
HEALTHCHECK --interval=30s --timeout=5s --retries=5 CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "node_modules/next/dist/bin/next", "start"]
