  <h1 align="center">
      Replane
  </h1>
  <p align="center">
    Dynamic configuration for apps and services.
  </p>

<picture>
    <source media="(prefers-color-scheme: dark)" srcset="./public/replane-window-screenshot-dark-v1.png">
    <source media="(prefers-color-scheme: light)" srcset="./public/replane-window-screenshot-light-v1.png">
    <img alt="Replane Screenshot" src="./public/replane-window-screenshot-light-v1.png">
</picture>

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

- Node.js 22+ and pnpm (for running from source)
- At least one authentication method: password auth, magic link (email), or OAuth (GitHub, GitLab, Google, Okta)

Optional: PostgreSQL database (14+).

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
      # Optional, Replane can start without an external database
      DATABASE_URL: postgresql://postgres:postgres@db:5432/replane
      BASE_URL: http://localhost:8080
      SECRET_KEY_BASE: change-me-to-a-long-random-string
      # Pick one or more providers (GitHub example below)
      GITHUB_CLIENT_ID: your-github-client-id
      GITHUB_CLIENT_SECRET: your-github-client-secret
      # Optional: enable password authentication (doesn't verify email addresses, use with caution)
      # PASSWORD_AUTH_ENABLED: true
      # Optional: add more providers
      # GITLAB_CLIENT_ID: your-gitlab-client-id
      # GITLAB_CLIENT_SECRET: your-gitlab-client-secret
      # GOOGLE_CLIENT_ID: your-google-client-id
      # GOOGLE_CLIENT_SECRET: your-google-client-secret
      # OKTA_CLIENT_ID: your-okta-client-id
      # OKTA_CLIENT_SECRET: your-okta-client-secret
      # OKTA_ISSUER: https://your-domain.okta.com
      # Optional: Magic link authentication via email
      # MAGIC_LINK_ENABLED: true  # Required to enable magic link sign-in
      # Connection string format (recommended):
      # EMAIL_SERVER: smtp://username:password@sandbox.smtp.mailtrap.io:2525
      # EMAIL_FROM: noreply@your-domain.com
      # Or individual variables format:
      # EMAIL_SERVER_HOST: sandbox.smtp.mailtrap.io
      # EMAIL_SERVER_PORT: 2525
      # EMAIL_FROM: noreply@your-domain.com
      # EMAIL_SERVER_USER: smtp-user
      # EMAIL_SERVER_PASSWORD: smtp-user-password
      # Optional: restrict registration to specific email domains
      # ALLOWED_EMAIL_DOMAINS: gmail.com,my-company.com
    ports:
      - '8080:8080'

volumes:
  replane-db:
```

Open your browser at http://localhost:8080.

Notes

- Replane includes an integrated database. No external database required.
- If using an integrated database, data is stored in `/data` inside the container. Mount a volume to persist data.
- Health check: GET /api/health → `{ "status": "ok" }`.

## Environment variables

### Required

- `BASE_URL` – e.g. http://localhost:8080 or your external URL
- `SECRET_KEY_BASE` – long random string (used to sign sessions)

### PostgreSQL Database

By default, Replane uses an integrated database. To use an external database instead:

- `DATABASE_URL` – Postgres connection string (e.g., `postgresql://user:pass@host:5432/replane`).
- `DATABASE_SSL_CA` – Custom SSL/TLS certificate authority (CA) for external PostgreSQL connections.
- `DATABASE_MAX_CONNECTIONS` – Maximum connections in the pool. Defaults to `10`.

### Authentication Providers

Configure at least one authentication provider. You can enable multiple providers simultaneously:

**Password Authentication**

Traditional email/password sign-in. This does not verify email addresses, use with caution.

- `PASSWORD_AUTH_ENABLED=true` – Enables password-based registration and sign-in

When enabled, users can create accounts with email and password, and sign in using their credentials. Passwords must be at least 8 characters.

**Email (Magic Link)**

The email provider sends passwordless magic links to users for authentication. When enabled, an email input field appears on the sign-in page.

**Required:**

- `MAGIC_LINK_ENABLED=true` – Explicitly enables magic link authentication

**Configuration Format 1: Connection String** (recommended)

- `EMAIL_SERVER` – SMTP connection string (e.g., `smtp://username:password@smtp.gmail.com:587`)
- `EMAIL_FROM` – Email address to send magic links from (e.g., `noreply@your-domain.com`)

**Configuration Format 2: Individual Variables**

- `EMAIL_SERVER_HOST` – SMTP server hostname (e.g., `smtp.gmail.com`)
- `EMAIL_SERVER_PORT` – SMTP server port (e.g., `587` for TLS, `465` for SSL)
- `EMAIL_FROM` – Email address to send magic links from (e.g., `noreply@your-domain.com`)
- `EMAIL_SERVER_USER` – (Optional) SMTP username for authentication
- `EMAIL_SERVER_PASSWORD` – (Optional) SMTP password for authentication

**Note:** Email server configuration can be used for other purposes (notifications, alerts, etc.) without enabling magic link authentication. Set `MAGIC_LINK_ENABLED=true` only if you want to allow users to sign in via magic links.

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

- `ALLOWED_EMAIL_DOMAINS` – comma-separated list of email domains allowed for user registration (e.g., `gmail.com,my-company.com`). If not set, all email domains are allowed. Users with email addresses from other domains will be blocked from signing up.

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

**User Feedback:** When Sentry is enabled, a "Send Feedback" option appears in the application sidebar. Users can submit feedback, report issues, or suggest features directly through the UI. All feedback is captured in your Sentry.

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

All state is stored in PostgreSQL when `DATABASE_URL` is not set. For the integrated database, back up the `/data` volume. For PostgreSQL, use your standard backup/restore process (e.g., `pg_dump`/`pg_restore`).

## Security

- Always set a strong `SECRET_KEY_BASE`.
- Run behind HTTPS in production (via reverse proxy or platform LB).
- Restrict database network access to the app only.

For detailed security guidelines and to report vulnerabilities, see [SECURITY.md](SECURITY.md).

## Related

- JavaScript SDK lives in https://github.com/replane-dev/replane-javascript.

## License

MIT
