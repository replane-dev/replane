<div align="center">

# Replane

Manage live application configuration with confidence.

</div>

> Early prototype. Expect breaking changes while we iterate quickly.

## Why Replane?

Modern products need fast, safe, observable config changes. Environment files, ad‑hoc admin UIs, and feature flag hacks break down as teams grow. Replane gives you a single place to:

**Ship safely** – Validate every config change before it reaches production, and instantly roll back if something misbehaves.

**Know the story** – A permanent audit trail answers: Who changed what? When? What did it look like before? Compliance & root‑cause questions stop being a fire drill.

**Collaborate without fear** – Roles (owner / editor / viewer) let product, platform, and SRE teams work together without accidental overwrites or silent drift.

**Recover instantly** – Point‑in‑time restore creates a fresh version from any previous snapshot. No manual diffing or guessing.

**Prevent bad values** – Optional JSON Schema guardrails block malformed or out‑of‑range config before it can break a deploy.

**Issue secure access** – Create & revoke API keys with one‑time token reveal. Stop passing long‑lived secrets informally.

**Eliminate “it worked on staging” mysteries** – One consistent, versioned source of truth instead of scattered environment variables and chat messages.

## Core Benefits (Feature → Outcome)

| Feature                           | Outcome / Benefit                            |
| --------------------------------- | -------------------------------------------- |
| Versioned configs                 | Instant rollback & historical context        |
| Structured audit log              | Compliance, accountability, forensic clarity |
| Role‑based access                 | Safe collaboration across teams              |
| One‑click restore                 | Faster MTTR during incidents                 |
| JSON Schema validation            | Fewer production outages from invalid data   |
| Membership change logging         | Transparent governance & ownership clarity   |
| API key lifecycle (create/delete) | Controlled programmatic access               |
| Concurrency protection            | No silent last‑write‑wins bugs               |

## Typical Use Cases

1. Dynamic feature settings (limits, thresholds, toggles with structured payloads)
2. Operational runtime tuning (cache TTLs, batching sizes) without redeploys
3. Gradual rollout values (e.g. percentage ramps stored as config)
4. Incident mitigation (quickly revert to a known good version)
5. Internal tooling / platform settings shared across multiple services

## Quick Start (Local Evaluation)

1. Clone & install:
   ```bash
   pnpm install
   ```
2. Start the bundled database:
   ```bash
   docker compose up -d
   ```
3. Copy & tweak env:
   ```bash
   cp .env.example .env
   ```
4. Launch:
   ```bash
   pnpm dev
   ```
5. Open http://localhost:3000 and authenticate (GitHub OAuth dev app vars required).

Create a config, change it, restore an older version, and inspect the audit log—this is the core product loop.

## Mental Model

Replane treats each config as a small timeline:

1. You create it (version 1)
2. Every edit appends a new immutable snapshot (version N)
3. Restoring an older version just appends N+1 with the previous content (never destructive)
4. All state transitions emit a human‑readable audit event

## Workflow Example

1. Product creates `checkout_rules` with a JSON schema preventing invalid states.
2. An engineer adjusts a limit; validation passes; version advances.
3. Incident occurs; on‑call restores version from earlier in the day (one click) – new version appears; dashboards recover.
4. Security reviews audit log: clear record of change, author, before/after.

## Roles (High Level)

| Role   | What they can do                                                   |
| ------ | ------------------------------------------------------------------ |
| Viewer | Browse & read configs, see history                                 |
| Editor | Everything a viewer can + change config content & restore versions |
| Owner  | Full control incl. membership & deletion                           |

## API Keys (Why You Care)

Grant programmatic read/write access (future external consumption) without sharing user credentials. Keys are shown exactly once—encouraging secure storage habits.

## Roadmap (User‑Facing Themes)

- Namespaces / environments
- Secret value masking & encryption
- Diff visualization for version comparisons
- Webhooks / outbound change events
- Stronger token hashing & rotation policies
- Bulk role administration

## Contributing / Feedback

Have a use case we missed? Open an issue: https://github.com/tilyupo/replane/issues

If this direction interests you, star the repo to follow progress.

## Status & Expectations

This is pre‑1.0 software. Data model & endpoints may change. Don’t put mission‑critical production traffic on it yet without reviewing the code and risks.
