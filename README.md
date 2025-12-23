<h1 align="center">Replane</h1>
<p align="center">Dynamic configuration for apps and services.</p>

<p align="center">
  <a href="https://hub.docker.com/r/replane/replane"><img src="https://img.shields.io/docker/v/replane/replane?label=docker" alt="Docker"></a>
  <a href="https://github.com/replane-dev/replane/blob/main/LICENSE"><img src="https://img.shields.io/github/license/replane-dev/replane" alt="License"></a>
  <a href="https://github.com/orgs/replane-dev/discussions"><img src="https://img.shields.io/badge/discussions-join-blue?logo=github" alt="Community"></a>
</p>

<picture>
    <source media="(prefers-color-scheme: dark)" srcset="./public/replane-window-screenshot-dark-v1.png">
    <source media="(prefers-color-scheme: light)" srcset="./public/replane-window-screenshot-light-with-border-v2.jpg">
    <img alt="Replane Screenshot" src="./public/replane-window-screenshot-light-with-border-v2.jpg">
</picture>

Replane is a dynamic configuration manager. Store feature flags, app settings, and operational config in one place—with version history, optional approvals, and realtime sync to your services. No redeploys needed.

## Quick Start

```sh
docker run -p 8080:8080 -e BASE_URL=http://localhost:8080 -e SECRET_KEY=xxx replane/replane
```

Open your browser at http://localhost:8080.

## Use cases

- **Feature flags** – toggle features, run A/B tests, roll out to user segments
- **Operational tuning** – adjust limits, TTLs, and timeouts without redeploying
- **Per-environment settings** – different values for production, staging, dev
- **Incident response** – instantly revert to a known-good version
- **Cross-service configuration** – share settings with realtime sync
- **Non-engineer access** – safe editing with schema validation

## Features

- **Version history** – every change creates a snapshot; restore any previous state
- **Change proposals** – require review before changes go live; per-project or per-environment
- **Realtime updates** – SDKs receive latest changes via Server-Sent Events
- **Audit log** – track who changed what, when, and why
- **JSON Schema validation** – prevent invalid configs; auto-generate TypeScript types
- **Environments** – different values for production, staging, development
- **Overrides** – return different values based on context (user ID, plan, region)
- **Role-based access** – workspace admins, project maintainers, config editors
- **Email notifications** – notify approvers and authors on proposal events
- **High availability** – each node [can operate independently](https://replane.dev/docs/concepts/architecture/#high-availability) if others are down
- **Low latency** – sub-millisecond config reads; sub-second propagation via SSE

## Official SDKs

| Technology | Package             | Links                                                                                                                |
| ---------- | ------------------- | -------------------------------------------------------------------------------------------------------------------- |
| JavaScript | `@replanejs/sdk`    | [npm](https://www.npmjs.com/package/@replanejs/sdk) · [GitHub](https://github.com/replane-dev/replane-javascript)    |
| React      | `@replanejs/react`  | [npm](https://www.npmjs.com/package/@replanejs/react) · [GitHub](https://github.com/replane-dev/replane-javascript)  |
| Next.js    | `@replanejs/next`   | [npm](https://www.npmjs.com/package/@replanejs/next) · [GitHub](https://github.com/replane-dev/replane-javascript)   |
| Svelte     | `@replanejs/svelte` | [npm](https://www.npmjs.com/package/@replanejs/svelte) · [GitHub](https://github.com/replane-dev/replane-javascript) |
| Python     | `replane`           | [PyPI](https://pypi.org/project/replane/) · [GitHub](https://github.com/replane-dev/replane-python)                  |
| .NET       | `Replane`           | [NuGet](https://www.nuget.org/packages/Replane) · [GitHub](https://github.com/replane-dev/replane-dotnet)            |

## Self‑hosting with Docker

You can launch a Replane container for trying it out with:

```sh
docker run -p 8080:8080 -e BASE_URL=http://localhost:8080 -e SECRET_KEY=xxx replane/replane
```

Replane will now be reachable at http://localhost:8080/.

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

  replane:
    image: replane/replane:latest
    depends_on:
      - db
    ports:
      - '8080:8080'
    environment:
      # Replane can start without an external database, mount /data to persist data
      DATABASE_URL: postgresql://postgres:postgres@db:5432/replane
      BASE_URL: http://localhost:8080
      SECRET_KEY: change-me-to-a-long-random-string

      # Password authentication (enabled by default if no other providers are enabled)
      # PASSWORD_AUTH_ENABLED: true

      # GITHUB_CLIENT_ID: your-github-client-id
      # GITHUB_CLIENT_SECRET: your-github-client-secret

      # GITLAB_CLIENT_ID: your-gitlab-client-id
      # GITLAB_CLIENT_SECRET: your-gitlab-client-secret

      # GOOGLE_CLIENT_ID: your-google-client-id
      # GOOGLE_CLIENT_SECRET: your-google-client-secret

      # OKTA_CLIENT_ID: your-okta-client-id
      # OKTA_CLIENT_SECRET: your-okta-client-secret
      # OKTA_ISSUER: https://your-domain.okta.com

      # Magic link authentication via email (requires email server configuration)
      # MAGIC_LINK_ENABLED: true

      # Email server configuration
      # Connection string format:
      # EMAIL_SERVER: smtp://username:password@sandbox.smtp.mailtrap.io:2525
      # EMAIL_FROM: noreply@your-domain.com
      # Or individual variables format:
      # EMAIL_SERVER_HOST: sandbox.smtp.mailtrap.io
      # EMAIL_SERVER_PORT: 2525
      # EMAIL_SERVER_USER: smtp-user
      # EMAIL_SERVER_PASSWORD: smtp-user-password
      # EMAIL_FROM: noreply@your-domain.com

      # Disable new user registration (existing users can still sign in)
      # DISABLE_REGISTRATION: true

      # Restrict sign-up to specific email domains
      # ALLOWED_EMAIL_DOMAINS: gmail.com,my-company.com

      # Set the port to listen on (defaults to 8080)
      # PORT: 12345

      # Custom health check path (defaults to /api/health)
      # HEALTHCHECK_PATH: /api/health

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
- `SECRET_KEY` – long random string (used to sign sessions)

### PostgreSQL Database

By default, Replane uses an integrated database. To use an external database instead:

**Configuration Format 1: Connection String**

- `DATABASE_URL` – Postgres connection string (e.g., `postgresql://user:pass@host:5432/replane`).

**Configuration Format 2: Individual Variables**

- `DATABASE_USER` - PostgreSQL username
- `DATABASE_PASSWORD` - PostgreSQL password
- `DATABASE_HOST` - PostgreSQL host
- `DATABASE_PORT` - PostgreSQL port
- `DATABASE_NAME` - PostgreSQL database name

**Optional knobs**

- `DATABASE_SSL_CA` – Custom SSL/TLS certificate authority (CA) for external PostgreSQL connections.
- `DATABASE_MAX_CONNECTIONS` – Maximum connections in the pool. Defaults to `10`.

### Authentication Providers

Configure at least one authentication provider. You can enable multiple providers simultaneously:

#### Password Authentication

Traditional email/password sign-in. This does not verify email addresses, use with caution. Enabled by default if no other authentication providers are configured.

- `PASSWORD_AUTH_ENABLED=true` – Enables password-based registration and sign-in

When enabled, users can create accounts with email and password, and sign in using their credentials. Passwords must be at least 8 characters.

#### Email Magic Link

The email provider sends passwordless magic links to users for authentication. When enabled, an email input field appears on the sign-in page.

- `MAGIC_LINK_ENABLED=true` – Explicitly enables magic link authentication

#### Email Server Configuration

Email server configuration is required for magic link authentication. It can be used for other purposes (notifications, alerts, etc.) without enabling magic link authentication.

**Configuration Format 1: Connection String**

- `EMAIL_SERVER` – SMTP connection string (e.g., `smtp://username:password@smtp.gmail.com:587`)
- `EMAIL_FROM` – Email address to send magic links from (e.g., `noreply@your-domain.com`)

**Configuration Format 2: Individual Variables**

- `EMAIL_SERVER_HOST` – SMTP server hostname (e.g., `smtp.gmail.com`)
- `EMAIL_SERVER_PORT` – SMTP server port (e.g., `587`)
- `EMAIL_FROM` – Email address to send magic links from (e.g., `noreply@your-domain.com`)
- `EMAIL_SERVER_USER` – SMTP username for authentication
- `EMAIL_SERVER_PASSWORD` – SMTP password for authentication

#### GitHub

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`

[Create OAuth App](https://github.com/settings/developers) with callback URL: `{BASE_URL}/api/auth/callback/github`

#### GitLab

- `GITLAB_CLIENT_ID`
- `GITLAB_CLIENT_SECRET`

[Create OAuth Application](https://gitlab.com/-/profile/applications) with redirect URI: `{BASE_URL}/api/auth/callback/gitlab`

#### Google

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

[Create OAuth credentials](https://console.cloud.google.com/apis/credentials) with authorized redirect URI: `{BASE_URL}/api/auth/callback/google`

#### Okta

- `OKTA_CLIENT_ID`
- `OKTA_CLIENT_SECRET`
- `OKTA_ISSUER` (e.g. https://your-domain.okta.com)

[Create OAuth 2.0 Application](https://developer.okta.com/docs/guides/implement-oauth-for-okta/main/) with redirect URI: `{BASE_URL}/api/auth/callback/okta`

### Optional

- `DISABLE_REGISTRATION=true` – Disables new user registration. Existing users can still sign in. Useful for private instances or when you want to manage users manually.
- `ALLOWED_EMAIL_DOMAINS` – comma-separated list of email domains allowed for user registration (e.g., `gmail.com,my-company.com`). If not set, all email domains are allowed. Users with email addresses from other domains will be blocked from signing up.
- `HEALTHCHECK_PATH` – custom path for the health check endpoint. Defaults to `/api/health`.

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

## Backups

All state is stored in PostgreSQL when `DATABASE_URL` is set. For the integrated database, back up the `/data` volume. For PostgreSQL, use your standard backup/restore process (e.g., `pg_dump`/`pg_restore`).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for instructions on building from source and contributing to Replane.

## Security

- Always set a strong `SECRET_KEY`.
- Run behind HTTPS in production (via reverse proxy or platform LB).
- Restrict database network access to the app only.

For detailed security guidelines and to report vulnerabilities, see [SECURITY.md](https://github.com/replane-dev/.github/blob/main/SECURITY.md).

## Community

Have questions or want to discuss Replane? Join the conversation in [GitHub Discussions](https://github.com/orgs/replane-dev/discussions).

## License

MIT
