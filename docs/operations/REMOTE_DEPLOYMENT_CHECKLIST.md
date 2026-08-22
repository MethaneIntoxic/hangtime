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

## First release

- [ ] Run CI on the exact main SHA and retain the workflow URL.
- [ ] Run the trusted Preview workflow; exercise real sign-in, create/join/vote/confirm, map/list fallback, installability, and encrypted location verification.
- [ ] Run the protected Production workflow with the verified SHA and Preview URL.
- [ ] Confirm `/api/health` reports that SHA, demo switching returns 404, authenticated APIs are no-store, and anonymous private APIs return 401.
- [ ] Record the Vercel deployment ID/URL, Turso database/schema, active location-key version, and approver without recording secrets or private data.

## Recovery and operations

- [ ] Create a PITR branch and prove an isolated restore before broader beta.
- [ ] Choose an encrypted offsite dump destination if recovery beyond 24 hours is required.
- [ ] Monitor Vercel and Turso quota dashboards and production health.
- [ ] Capture physical iOS and Android PWA installation evidence.
- [ ] Upgrade hosting before any commercial or advertising use.
