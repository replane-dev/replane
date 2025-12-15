<div align="center">

# Replane

Dynamic configuration manager for your apps and services. Self‑hosted.

</div>

Status: early but usable. Expect changes to schemas and endpoints before v1.0.

## What it does

Replane is a small web app for managing JSON configs with:

- Version history and instant rollback (append‑only snapshots)
- Proposals (review/approve changes before applying)
- Realtime updates via Server-Sent Events (SSE)
- Audit log for who changed what and when
- Optional JSON Schema validation
- Roles (owner/editor/viewer)
- SDK keys (create/revoke) for programmatic access

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
- One or more OAuth providers for sign‑in (GitHub, GitLab, Google, or Okta)

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
      BASE_URL: http://localhost:8080
      SECRET_KEY_BASE: change-me-to-a-long-random-string
      # Pick one or more providers (GitHub example below)
      GITHUB_CLIENT_ID: your-github-client-id
      GITHUB_CLIENT_SECRET: your-github-client-secret
      # Optional: add more providers
      # GITLAB_CLIENT_ID: your-gitlab-client-id
      # GITLAB_CLIENT_SECRET: your-gitlab-client-secret
      # GOOGLE_CLIENT_ID: your-google-client-id
      # GOOGLE_CLIENT_SECRET: your-google-client-secret
      # OKTA_CLIENT_ID: your-okta-client-id
      # OKTA_CLIENT_SECRET: your-okta-client-secret
      # OKTA_ISSUER: https://your-domain.okta.com
    ports:
      - '8080:8080'

volumes:
  replane-db:
```

Open your browser at http://localhost:8080.

Notes

- The container entrypoint runs DB migrations automatically before starting.
- Health check: GET /api/health → `{ "status": "ok" }`.

## Environment variables

### Required

- `DATABASE_URL` – Postgres connection string
- `BASE_URL` – e.g. http://localhost:8080 or your external URL
- `SECRET_KEY_BASE` – long random string (used to sign sessions)

### Authentication Providers

Configure at least one OAuth provider. You can enable multiple providers simultaneously:

**GitHub**

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`

[Create OAuth App](https://github.com/settings/developers) with callback URL: `{BASE_URL}/api/auth/callback/github`

**GitLab**

- `GITLAB_CLIENT_ID`
- `GITLAB_CLIENT_SECRET`

[Create OAuth Application](https://gitlab.com/-/profile/applications) with redirect URI: `{BASE_URL}/api/auth/callback/gitlab`

**Google**

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

[Create OAuth credentials](https://console.cloud.google.com/apis/credentials) with authorized redirect URI: `{BASE_URL}/api/auth/callback/google`

**Okta**

- `OKTA_CLIENT_ID`
- `OKTA_CLIENT_SECRET`
- `OKTA_ISSUER` (e.g. https://your-domain.okta.com)

[Create OAuth 2.0 Application](https://developer.okta.com/docs/guides/implement-oauth-for-okta/main/) with redirect URI: `{BASE_URL}/api/auth/callback/okta`

### Optional

- `DATABASE_SSL_CA` – custom SSL/TLS certificate authority (CA) for PostgreSQL connections. Use this when connecting to databases that require custom SSL certificates.
- `DATABASE_MAX_CONNECTIONS` – maximum number of connections in the PostgreSQL connection pool. Defaults to `10`.

### Error Tracking (Sentry)

Replane supports optional [Sentry](https://sentry.io) integration for error tracking and performance monitoring. When enabled, errors from the server, SDK API, and client-side UI are automatically reported.

- `SENTRY_DSN` – Your Sentry Data Source Name (DSN). Enables Sentry when set.
- `SENTRY_ENVIRONMENT` – Environment name for Sentry (e.g., `production`, `staging`).
- `SENTRY_TRACES_SAMPLE_RATE` – Sample rate for performance tracing (0.0 to 1.0). Defaults to `0.1` (10%).

Example configuration:

```yaml
environment:
  SENTRY_DSN: https://xxx@xxx.ingest.sentry.io/xxx
  SENTRY_ENVIRONMENT: production
  SENTRY_TRACES_SAMPLE_RATE: '0.1'
```

## JavaScript SDK

Install:

```bash
# npm
npm i @replanejs/sdk
# pnpm
pnpm add @replanejs/sdk
# yarn
yarn add @replanejs/sdk
```

Basic usage:

```ts
import {createReplaneClient, createInMemoryReplaneClient} from '@replanejs/sdk';

interface PasswordRequirements {
  minLength: number;
  requireSymbol: boolean;
}

interface Configs {
  'new-onboarding': boolean;
  'password-requirements': PasswordRequirements;
  'billing-enabled': boolean;
}

const replane = await createReplaneClient<Configs>({
  // Each SDK key is tied to one project only
  sdkKey: process.env.REPLANE_SDK_KEY!,
  baseUrl: 'https://api.my-host.com',
});

// Get config value (receives realtime updates via SSE in background)
try {
  const featureFlag = replane.get('new-onboarding'); // TypeScript knows: boolean
  console.log('Feature flag:', featureFlag);
} catch (error) {
  // Handle error (e.g., config not found)
  console.log('Feature flag not found, using default: false');
}

// Typed config - no need to specify type again
const passwordRequirements = replane.get('password-requirements');
console.log('Min length:', passwordRequirements.minLength);

// With context for override evaluation
const billingEnabled = replane.get('billing-enabled', {
  context: {
    userId: 'user-123',
    plan: 'premium',
  },
});

if (billingEnabled) {
  console.log('Billing enabled for this user!');
}

// When done, clean up resources
replane.close();
```

Notes

- Create an SDK key in the Replane UI. It's shown once; store it securely.
- Each SDK key is tied to a specific project. If you need configs from multiple projects, create separate SDK keys and initialize separate clients for each project.
- The Replane client receives realtime updates via SSE in the background and maintains an up-to-date cache.
- Works in Node (18+) and modern browsers. Provide `fetchFn` if your environment doesn't expose `fetch`.

## Backups

All state is in Postgres. Use your standard backup/restore process for the database (e.g. `pg_dump`/`pg_restore`).

## Security

- Always set a strong `SECRET_KEY_BASE`.
- Run behind HTTPS in production (via reverse proxy or platform LB).
- Restrict database network access to the app only.

For detailed security guidelines and to report vulnerabilities, see [SECURITY.md](SECURITY.md).

## Related

- JavaScript SDK lives in https://github.com/replane-dev/replane-javascript.

## License

MIT
