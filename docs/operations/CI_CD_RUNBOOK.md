# Hangtime free-tier release runbook

Hangtime's personal tester deployment uses Vercel Hobby in `sin1` and two isolated Turso Free databases. It is not a commercial hosting configuration. Advertising, paid placement, or other commercial operation requires moving off Hobby.

## Environments

| Tier | Compute | Data | Purpose |
|---|---|---|---|
| pull request | GitHub runner/local libSQL | disposable file | untrusted, secret-free checks |
| preview | Vercel Preview | `hangtime-preview` Turso DB | trusted main-branch acceptance |
| production | Vercel Production | `hangtime-production` Turso DB | invite-only tester app |

Preview and Production must use different database tokens, location keyrings, auth secrets, email identities, and `APP_URL` values. Never expose production secrets to a pull request.

## GitHub configuration

Repository secrets:

- `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`
- `TURSO_PREVIEW_DATABASE_URL`, `TURSO_PREVIEW_AUTH_TOKEN`, `LOCATION_PREVIEW_KEYRING_B64`

Production-environment secrets:

- `TURSO_PRODUCTION_DATABASE_URL`, `TURSO_PRODUCTION_AUTH_TOKEN`
- `LOCATION_PRODUCTION_KEYRING_B64`, `AUTH_SECRET`, `RESEND_API_KEY`

Production variables:

- `PRODUCTION_URL` — exact public HTTPS origin
- `AUTH_EMAIL_FROM` — verified Resend sender, for example `Hangtime <sign-in@domain.sg>`

Protect the `production` GitHub environment with a required reviewer. Keep the repository in the user's personal GitHub account because Hobby cannot connect organization-owned repositories.

## Vercel configuration

Create one personal Hobby project and set the same runtime variables in Vercel's Preview and Production environments. Sensitive values must be marked Sensitive. Set `RELEASE_CHANNEL=preview` or `production`, `AUTH_EMAIL_DRIVER=resend`, and `HANGTIME_DEMO_MODE=false`. Preview email should use a sandbox/test sender or remain disabled until a controlled inbox is available.

The runtime fails closed on Vercel if Turso credentials are missing. Builds and cold starts do not run remote schema migrations. `vercel.json` pins Functions to Singapore.

## Release flow

1. A pull request and main push run lint, types, 53 unit tests, browser UAT, production PWA checks, map checks, build, and encrypted-location checks.
2. A successful trusted main push runs `Deploy trusted preview`. It migrates only the Preview database, builds the exact source SHA, deploys it, and smoke-tests the immutable Vercel URL.
3. Manually run `Deploy production` with that full source SHA and preview URL.
4. The protected job rechecks Preview, migrates Production, validates the complete production environment, creates a staged Production deployment with `--skip-domain`, smoke-tests it, and only then promotes it.
5. Record the workflow URLs, source SHA, immutable deployment URL, schema versions, key version, and approver. Never record tokens, invite URLs, precise origins, or database dumps.

All schema changes must remain backward-compatible with the immediately previous deployment. Do not combine column removal with code that stops supporting the old shape.

## Rollback and data recovery

For a code-only regression, run `Roll back production code` with a previously verified Vercel deployment URL and SHA after confirming the current schema is compatible.

For data corruption, do not point old code at the live database or overwrite it. Turso Free PITR retains 24 hours and may omit roughly the latest 15 seconds:

1. Create a new database from the affected database at an RFC3339 timestamp using `turso db create <restore-name> --from-db <source-name> --timestamp <time>`.
2. Create a new database-scoped token.
3. Run the integrity, location-decryption, row-count, auth, and canary checks against an isolated Vercel deployment.
4. Change Production's Turso URL/token to the verified restored database and redeploy the last known-good source.
5. Retain the old database until the incident is closed; never delete it automatically.

PITR is not long-term backup. Before public beta, add a user-controlled encrypted daily logical dump outside GitHub and complete a restore drill. Vercel Hobby's daily cron timing is not adequate for timely notification delivery or availability monitoring; use an external free uptime monitor if needed.

## Operating limits

- Vercel Hobby is personal/non-commercial and may pause when included usage is exhausted.
- Turso Free quota exhaustion returns failures; monitor row reads/writes and storage.
- Push notification dispatch, live booking availability, and live transit claims remain out of the tester MVP.
- A production map or provider outage must leave the venue list usable and label local estimates honestly.
