<div align="center">

# Replane

Versioned, auditable application configuration. Self‑hosted.

</div>

Status: early but usable. Expect changes to schemas and endpoints before v1.0.

## What it does

Replane is a small web app for managing JSON configs with:

- Version history and instant rollback (append‑only snapshots)
- Audit log for who changed what and when
- Optional JSON Schema validation
- Roles (owner/editor/viewer)
- API keys (create/revoke) for programmatic access

If you’ve outgrown ad‑hoc env files or spreadsheets, this gives you a focused, auditable UI.

## Typical use cases

- Feature toggles and parameterized settings (limits, thresholds)
- Operational tuning without redeploys (cache TTLs, batch sizes)
- Gradual rollouts (percentages or cohorts stored as config)
- Incident mitigation (revert to a known‑good version quickly)
- Shared platform/internal tool settings across multiple services

Non‑engineering teammates (product, operations, support) can safely change values in the UI when a JSON Schema is attached—invalid or out‑of‑range inputs are blocked before save.

## Requirements

- PostgreSQL (tested with 17; 14+ should work)
- Node.js 22+ and pnpm (for running from source)
- One OAuth provider for sign‑in (GitHub or Okta)

## Quick start (local)

1. Install deps

```bash
pnpm install
```

2. Start a local Postgres (via included compose)

```bash
docker compose up -d
```

3. Configure environment

```bash
cp .env.example .env
# set NEXTAUTH_SECRET and your OAuth provider credentials
```

4. Run the app

```bash
pnpm dev
```

Open http://localhost:3000 → sign in with your provider → create a config → edit → restore a previous version → inspect audit log.

## Self‑hosting with Docker

Use the published image (replace <org-or-user> if needed) or build locally.

Run against an existing Postgres:

```bash
docker run --rm -p 3000:3000 \
   -e DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:5432/replane \
   -e NEXTAUTH_URL=http://localhost:3000 \
   -e NEXTAUTH_SECRET=change-me \
   -e GITHUB_CLIENT_ID=... \
   -e GITHUB_CLIENT_SECRET=... \
   ghcr.io/<org-or-user>/replane:latest
```

Example docker‑compose.yml (app + db):

```yaml
services:
  db:
    image: postgres:17
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: replane
    volumes:
      - replane-db:/var/lib/postgresql/data
    ports:
      - '5432:5432'

  app:
    image: ghcr.io/<org-or-user>/replane:latest
    depends_on:
      - db
    environment:
      DATABASE_URL: postgresql://postgres:postgres@db:5432/replane
      NEXTAUTH_URL: http://localhost:3000
      NEXTAUTH_SECRET: change-me
      # Pick one provider (GitHub example below)
      GITHUB_CLIENT_ID: your-client-id
      GITHUB_CLIENT_SECRET: your-client-secret
    ports:
      - '3000:3000'

volumes:
  replane-db:
```

Notes

- The container entrypoint runs DB migrations automatically before starting.
- Health check: GET /api/health → `{ "status": "ok" }`.

## Environment variables

Minimum required:

- DATABASE_URL – Postgres connection string
- NEXTAUTH_URL – e.g. http://localhost:3000 or your external URL
- NEXTAUTH_SECRET – long random string (used to sign sessions)
- Authentication provider (choose one):
  - GitHub: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET
  - Okta: OKTA_CLIENT_ID, OKTA_CLIENT_SECRET, OKTA_ISSUER

Optional (local helpers):

- FORCE_COLOR=1 – pretty test output

See `.env.example` for a working template.

## Running from source (production‑like)

```bash
# Install dependencies
pnpm install

# Prepare environment
cp .env.example .env
# set DATABASE_URL, NEXTAUTH_* and provider creds

# Run migrations and generate DB types
pnpm run migrate

# Build and start
pnpm build
pnpm start
```

## Upgrading

- Docker: pull the new image and restart; migrations run automatically on boot.
- Source: `git pull`, `pnpm install`, `pnpm run migrate`, `pnpm build`, `pnpm start`.

## Backups

All state is in Postgres. Use your standard backup/restore process for the database (e.g. `pg_dump`/`pg_restore`).

## Development

- Tests: `pnpm test`
- Lint: `pnpm lint`
- Local DB: `docker compose up -d` (uses `postgres:17` by default)

## Security notes

- Always set a strong `NEXTAUTH_SECRET`.
- Run behind HTTPS in production (via reverse proxy or platform LB).
- Restrict database network access to the app only.

## Related

- JavaScript SDK lives in `/replane-javascript`.

## License

MIT
