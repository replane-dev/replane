FROM node:22-slim
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

ARG NEXT_PUBLIC_BUILD_SHA
ENV NEXT_PUBLIC_BUILD_SHA=$NEXT_PUBLIC_BUILD_SHA

RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
COPY .env.example .env
RUN pnpm build

ENV PORT=3000
EXPOSE 3000

# Use package.json start script which runs the custom server (tsx server.ts)
CMD ["pnpm", "start-self-hosted"]
