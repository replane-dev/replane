<div align="center">

# Replane

Versioned, auditable application configuration. Self‑hosted.

</div>

Status: early but usable. Expect changes to schemas and endpoints before v1.0.

## What it does

Replane is a small web app for managing JSON configs with:

- Version history and instant rollback (append‑only snapshots)
- Realtime updates via Server-Sent Events (SSE)
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

## Self‑hosting with Docker

Example docker‑compose.yml:

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

  app:
    image: ghcr.io/replane-dev/replane:latest
    depends_on:
      - db
    environment:
      DATABASE_URL: postgresql://postgres:postgres@db:5432/replane
      BASE_URL: http://localhost:3000
      SECRET_KEY_BASE: change-me
      # Pick one provider (GitHub example below)
      GITHUB_CLIENT_ID: your-client-id
      GITHUB_CLIENT_SECRET: your-client-secret
    ports:
      - '3000:3000'

volumes:
  replane-db:
```

Open your browser at http://localhost:3000.

Notes

- The container entrypoint runs DB migrations automatically before starting.
- Health check: GET /api/health → `{ "status": "ok" }`.

## Environment variables

Minimum required:

- DATABASE_URL – Postgres connection string
- BASE_URL – e.g. http://localhost:3000 or your external URL
- SECRET_KEY_BASE – long random string (used to sign sessions)
- Authentication provider (choose one):
  - GitHub: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET
  - Okta: OKTA_CLIENT_ID, OKTA_CLIENT_SECRET, OKTA_ISSUER

Optional:

- ORGANIZATION_NAME – display name shown in the UI (e.g. sidebar project switcher). If not set, the label is omitted.

See `.env.example` for a working template.

## JavaScript SDK

Install:

```bash
# npm
npm i replane-sdk
# pnpm
pnpm add replane-sdk
# yarn
yarn add replane-sdk
```

Basic usage:

```ts
import {createReplaneClient} from 'replane-sdk';

const client = createReplaneClient({
  apiKey: process.env.REPLANE_API_KEY!,
  baseUrl: 'https://api.my-replane-host.com',
});

// One-off fetch

const featureFlag = await client
  .getConfigValue<boolean>('new-onboarding')
  // Ignore errors and use `false` if config is missing or fetch fails
  .catch(() => false);

// Typed example
interface PasswordRequirements {
  minLength: number;
  requireSymbol: boolean;
}

const passwordRequirements = await client
  .getConfigValue<PasswordRequirements>('password-requirements')
  .catch(() => ({minLength: 8, requireSymbol: false}));

// Watching a config with realtime updates via SSE (initial fetch must succeed)
const billingEnabled = await client.watchConfigValue<boolean>('billing-enabled');

// Later, read the latest value (automatically updated in realtime)
if (billingEnabled.get()) {
  console.log('Billing enabled!');
}

// When done, clean up resources
billingEnabled.close();

// Or, if you don't need the client anymore
client.close();
```

Notes

- Create an API key in the Replane UI. It’s shown once; store it securely.
- The client logs errors and returns the provided fallback if the request fails.
- Works in Node (18+) and modern browsers. Provide `fetchFn` if your environment doesn’t expose `fetch`.\

## Backups

All state is in Postgres. Use your standard backup/restore process for the database (e.g. `pg_dump`/`pg_restore`).

## Security notes

- Always set a strong `SECRET_KEY_BASE`.
- Run behind HTTPS in production (via reverse proxy or platform LB).
- Restrict database network access to the app only.

## Related

- JavaScript SDK lives in https://github.com/replane-dev/replane-javascript.

## License

MIT
