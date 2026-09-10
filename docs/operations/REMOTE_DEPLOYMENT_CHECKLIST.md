# Remote deployment checklist

## User-owned accounts

- [ ] Create a personal GitHub repository and push `main`.
- [ ] Create a Vercel Hobby project in the user's personal account and select Singapore (`sin1`).
- [ ] Create separate `hangtime-preview` and `hangtime-production` Turso databases near Singapore.
- [ ] Create database-scoped tokens for each database.
- [ ] Verify a Resend sender/domain and choose the production HTTPS domain.

## Secrets and isolation

- [ ] Configure the GitHub repository and protected Production environment values listed in `CI_CD_RUNBOOK.md`.
- [ ] Configure matching, environment-scoped Vercel variables; mark secrets Sensitive.
- [ ] Confirm Preview and Production database URLs, tokens, keyrings, auth secrets, and email identities differ.
- [ ] Confirm no production secret is available to pull-request workflows.
- [ ] Leave `HOSTED_CI_ENABLED` unset unless an intentional GitHub-hosted
      runner validation window is open; set it to the literal `true` only for
      that window, then unset it.
- [ ] Leave `FREE_TIER_DEPLOYMENTS_ENABLED` unset unless an intentional
      free-tier release window is open; set it to `true` only for that window.
- [ ] Confirm no GitHub Actions schedule is enabled and that manual health
      checks are acceptable for the current zero-cost operating mode.

## First release

- [ ] Run `pnpm ci:fast` and `pnpm ci:security` locally on the exact main SHA;
      retain the workflow URL only if hosted Actions actually starts a runner.
- [ ] If hosted evidence is intentionally required, confirm account minutes
      and spending controls, then set `HOSTED_CI_ENABLED=true` before dispatch.
- [ ] If Actions is blocked before runner start by account billing/spending
      restrictions, record remote validation as not executed; do not change
      billing settings or claim the local result as remote evidence.
- [ ] Run the trusted Preview workflow; exercise real sign-in, create/join/vote/confirm, map/list fallback, installability, and encrypted location verification.
- [ ] Set `FREE_TIER_DEPLOYMENTS_ENABLED=true`, then run the protected Production
      workflow with `confirm_free_tier=true`, the verified SHA, and Preview URL.
- [ ] Confirm `/api/health` reports that SHA, demo switching returns 404, authenticated APIs are no-store, and anonymous private APIs return 401.
- [ ] Record the Vercel deployment ID/URL, Turso database/schema, active location-key version, and approver without recording secrets or private data.

## Recovery and operations

- [ ] Create a PITR branch and prove an isolated restore before broader beta.
- [ ] Choose an encrypted offsite dump destination if recovery beyond 24 hours is required.
- [ ] Monitor Vercel and Turso quota dashboards and production health.
- [ ] Capture physical iOS and Android PWA installation evidence.
- [ ] Upgrade hosting before any commercial or advertising use.
