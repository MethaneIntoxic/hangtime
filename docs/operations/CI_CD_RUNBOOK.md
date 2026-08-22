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

Optional repository variable:

- `FREE_TIER_DEPLOYMENTS_ENABLED` — set to the literal `true` only when an
  operator intentionally wants the trusted Preview workflow and protected
  deployment workflows to consume Vercel/Turso free-tier quota. Leave it
  unset (the safe default) to keep all deployments disabled.

Protect the `production` GitHub environment with a required reviewer. Keep the repository in the user's personal GitHub account because Hobby cannot connect organization-owned repositories.

GitHub Actions billing is an external gate for this checkout: if the account's
spending restriction blocks hosted runners, a workflow can be accepted with
zero steps and runner id `0`. Treat that as remote validation not executed,
not as a passing or failing application test. This runbook never changes
billing, spending limits, or paid-service settings.

## Zero-cost validation profiles

The same checks can run locally and on GitHub without deployment credentials:

| Command | Scope |
|---|---|
| `pnpm ci:fast` | workflow policy, lint, TypeScript, unit tests, PWA/map checks, build |
| `pnpm ci:browser` | hermetic Playwright desktop/mobile UAT |
| `pnpm ci:production` | production-shell E2E (explicit opt-in) |
| `pnpm ci:security` | `pnpm audit --prod --audit-level high` |
| `pnpm ci:local` | all of the above, including production-shell E2E |

`pnpm check:ci` enforces that actions are pinned to full commit SHAs, scheduled
runner jobs are absent, and workflows triggered by `pull_request` do not read
repository secrets. The security workflow uses only free private-repository
checks: Gitleaks for this personal repository and the pnpm production audit.
Dependency Review and CodeQL are not enabled because their private-repository
availability depends on GitHub Advanced Security, which is not assumed here.
There are no scheduled Actions jobs; availability and provider checks are
manual `workflow_dispatch` operations to prevent surprise runner usage.

## Vercel configuration

Create one personal Hobby project and set the same runtime variables in Vercel's Preview and Production environments. Sensitive values must be marked Sensitive. Set `RELEASE_CHANNEL=preview` or `production`, `AUTH_EMAIL_DRIVER=resend`, and `HANGTIME_DEMO_MODE=false`. Preview email should use a sandbox/test sender or remain disabled until a controlled inbox is available.

The runtime fails closed on Vercel if Turso credentials are missing. Builds and cold starts do not run remote schema migrations. `vercel.json` pins Functions to Singapore.

## Release flow

1. A pull request and main push run the secret-free fast validation and security workflows. Browser UAT and production-shell E2E remain separate jobs, so local operators can choose the cost/time boundary.
2. Set `FREE_TIER_DEPLOYMENTS_ENABLED=true` only for an intentional release window. A successful trusted main push then runs `Deploy trusted preview`; it migrates only the Preview database, builds the exact source SHA, deploys it, and smoke-tests the immutable Vercel URL. The workflow is restricted to a successful same-repository main push and never runs with pull-request secrets.
3. Manually run `Deploy production` with that full source SHA and preview URL, set the required `confirm_free_tier` input to `true`, and use the protected `production` environment.
4. The protected job rechecks Preview, migrates Production, validates the complete production environment, creates a staged Production deployment with `--skip-domain`, smoke-tests it, and only then promotes it.
5. `release:metadata` validates that the SHA is a real commit in the checked-out tree and records source SHA, channel, and immutable deployment URL in the workflow summary. Record the workflow URLs, source SHA, immutable deployment URL, schema versions, key version, and approver. Never record tokens, invite URLs, precise origins, or database dumps.

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

## Manual fallback when Actions are blocked

Run the local profiles above from the exact reviewed commit. If they pass, a
maintainer may use the Vercel CLI and Turso CLI manually during an explicit
release window, following the same source-SHA, isolated-environment,
backward-compatible-migration, and smoke-test gates. Do not copy production
secrets into a PR checkout. Keep `FREE_TIER_DEPLOYMENTS_ENABLED` unset until
hosted runners and the free-tier quotas have been checked. A local pass is
useful evidence, but it does not claim GitHub runner, Vercel deployment, Turso
remote migration, Resend delivery, or physical-device validation.

## Operating limits

- Vercel Hobby is personal/non-commercial and may pause when included usage is exhausted.
- Turso Free quota exhaustion returns failures; monitor row reads/writes and storage.
- Push notification dispatch, live booking availability, and live transit claims remain out of the tester MVP.
- A production map or provider outage must leave the venue list usable and label local estimates honestly.
