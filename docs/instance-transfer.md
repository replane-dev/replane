# Move a Replane instance

Set `INSTANCE_TRANSFER_TOKEN` to a long random secret on each instance to enable
**Settings → Instance → Backup & restore**. Enter that instance's token to export
or import. The token is an instance-wide operator credential, independent of
workspace roles; only share it with operators. Unset it after the migration.

1. Run the same Replane version on source and destination. Configure the destination's
   database, authentication providers, email, and other environment variables separately.
   Use a fresh destination `SECRET_KEY` so sessions from the previous destination or
   source cannot authenticate as a different imported user with the same numeric ID.
2. Stop writes to the source for the final export. Download the JSON backup from settings.
   Protect this file: it contains password hashes, OAuth credentials, API key hashes,
   and private configuration. It is not encrypted.
3. Keep application traffic to the destination stopped. Sign in using a temporary account
   to access settings, select the backup, enter the destination transfer token, and type
   `REPLACE`. The temporary account and all other destination data will be replaced.
4. Restart **all** destination Replane processes after a successful import, including
   edge processes, before routing any application traffic. Restore invalidates replication
   consumers; running edge processes may exit and be restarted by their supervisor.
   Restarting rebuilds local replicas from the restored database.
5. Sign in with an imported account, verify configs and SDK access, switch clients to
   the new URL, and disable `INSTANCE_TRANSFER_TOKEN`. Existing SDK/admin keys and
   password logins are preserved. OAuth requires matching provider configuration and
   redirect URLs. Sessions and pending magic links must be recreated by signing in.

The backup includes all database-backed workspaces, projects, environments, configs,
variants, proposals, version history, audit logs, memberships, users, password hashes,
OAuth accounts, notification preferences, and SDK/admin API keys and scopes.
Environment variables and browser-local preferences are not included. Database
migration records are checked for compatibility, not replaced. Session tokens,
verification tokens, event queues, and replication consumers are discarded on restore.

Import supports files up to 100 MiB. It validates the format, complete table/column
sets, and migration fingerprint, and restores in one PostgreSQL transaction. Invalid
relationships or other database errors roll back the entire import. Export uses a
consistent database snapshot. Route/proxy upload and timeout limits may need adjusting
for larger backups; this operation is intended for a maintenance window.

For an empty destination without an account, the same token-protected endpoint is
available directly: `POST /api/instance-transfer?action=export` or `?action=import`,
with `x-instance-transfer-token` set to the source/destination token respectively.
Import takes the JSON file as the body and requires `x-confirm-replace-instance: replace`.
Use `Content-Type: application/json`. No account or workspace permission substitutes
for the operator token.
