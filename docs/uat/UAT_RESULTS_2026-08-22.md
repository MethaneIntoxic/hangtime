# Hangtime autonomous UAT and CI iteration — 2026-08-22

## Outcome

The Iteration 3 local acceptance gates pass and the pending-seat/migration hardening is deployed at commit `13e01c559daa1fbe6b11c0d16057f7db54ae18d5`, deployment `dpl_7cDkRk38gbSNUuBQjHR36k5SgP35`, immutable URL `https://hangtime-h4fmk7skg-hangtime1.vercel.app`, and alias `https://hangtime-weld.vercel.app`. Production Turso 0006 postconditions are verified (`m5=1`, `m6=1`, `columns=6`, `indexes=3`, `invite_rows preserved=0`). Local gates include `18 files/96 unit` and `50 E2E passed` with `2` intentional viewport-conditional skips; production smoke is `1 pass`, and build/lint/typecheck/PWA/maps/security checks pass. Live health returned 200 for the exact revision with security headers, and rendered sign-in showed no console errors.

This evidence does not claim authenticated deployed end-to-end or a real email resend. Preview remains unprovisioned; physical-device, backup/restore, and other external integration evidence remain open. The raw invite-token continuation path remains a hardening recommendation because it duplicates a bearer token in a continuation query; intended-account binding and body/header-only acceptance remain active controls. GitHub-hosted CI did not execute because of an existing account-level Actions restriction; no hosted CI pass is claimed and billing is not enabled.

## Sources and environments

- Reviewed source and deployed application source: Iteration 3 commit `13e01c559daa1fbe6b11c0d16057f7db54ae18d5`.
- Production immutable deployment: `https://hangtime-h4fmk7skg-hangtime1.vercel.app` (`dpl_7cDkRk38gbSNUuBQjHR36k5SgP35`).
- Production alias: `https://hangtime-weld.vercel.app`.
- Local browser fixtures: isolated seeded SQLite/libSQL data; no production mutation or email delivery.
- Production data: Turso Free, separate from Preview; Preview remains empty/unprovisioned.

The reviewed working tree includes readiness, plan-validity, accessibility, migration, route, UI, test, documentation, and post-scan remediation changes. Production code deployment is complete at the commit above; authenticated deployed end-to-end remains unproven.

## Automated source verification

| Gate | Result | Evidence |
|---|---|---|
| Lint and TypeScript | Pass | ESLint and `tsc --noEmit` both completed successfully |
| Unit/security/domain tests | Pass | 18 files, 96 tests |
| Full E2E browser UAT | Pass with two intentional viewport-conditional skips | 50 passed, 2 skipped across desktop/mobile Chromium |
| Production smoke/security contract | Pass | 1 pass; live health returned 200 for the exact deployed revision with security headers. Full authenticated deployed end-to-end remains pending. |
| Rendered production sign-in | Pass | Sign-in rendered without console errors; authenticated completion remains pending. |
| Next.js production build | Pass | Next.js 16.3.1 production build |
| PWA/map static policy | Pass | `PWA_STATIC_CHECK_PASS`, `MAP_CHECK_PASS` |
| CI workflow policy | Pass | `CI_POLICY_PASS workflows=7` |
| Production dependency audit | Pass | No known production vulnerabilities |
| Live map provider boundary | Pass | Map-provider verification completed successfully |
| Production policy audit | Pass | Production audit completed successfully against the checked-out source contract |
| Disposable location-encryption verification | Pass | `LOCATION_ENCRYPTION_VERIFICATION_PASS rows=8`; all 8 disposable fixture rows were encrypted and decryptable with the test keyring |
| Migration hardening | Pass | The explicit migration preflights four duplicate identity classes transactionally before unique indexes; local migration tests pass |
| Diff hygiene | Pass | `git diff --check` |

New acceptance coverage includes pending-invite seat reservation, intended-account acceptance, revocation/reissue/expiry, capacity and final-seat races, safe projections, deliberate readiness UI, required readiness evidence, readiness and derived-state invalidation, version-conflict safety, idempotent concurrent recommendation generation, stale ballot/confirmation rejection, deployable migration integrity, axe checks across primary routes, keyboard interaction, dialog focus restoration, and 320/390/430px ballot-action geometry. DT-003 and DT-004 local implementation gates pass; the complete authenticated deployed journey remains a release gate.

## Sealed security diff scan

Security diff scan `a3d5047a-6725-4799-aa8e-c418f14f1cb1` completed and sealed at `2026-08-22T10:44:49Z` against the pre-remediation snapshot. It covered all 33 changed source files in the working-tree diff, with focused tests passing and no production credentials or production database used. The scan retained two reportable low-severity integrity findings. Remediation is now implemented, verified locally, and deployed at commit `13e01c559daa1fbe6b11c0d16057f7db54ae18d5`; authenticated deployed behavior remains pending:

| Finding | Severity / CWE | Sealed-snapshot disposition | Local remediation status |
|---|---|---|---|
| Equivalent profile preference reordering invalidates shared plans (`csf_f86680152ec33535ed29cc66`) | Low · CWE-20, CWE-400 | Reportable; authenticated-user, recoverable shared-plan disruption | Canonical preference-set comparison is implemented and order-invariance tests pass locally; Production code is deployed at the recorded commit, while authenticated deployed behavior remains pending. |
| Equivalent availability reordering invalidates shared plan state (`csf_1e24511cf1424f2e54bad434`) | Low · CWE-20, CWE-400 | Reportable; authenticated-participant, recoverable shared-plan disruption | Canonical availability-window comparison is implemented and order-invariance tests pass locally; Production code is deployed at the recorded commit, while authenticated deployed behavior remains pending. |

The scan suppressed a route-local CSRF candidate because the production proxy applies the exact-origin check to unsafe `/api/:path*` requests; this remains a production-proxy deployment assumption, not a route-level fix. It also retained the omitted-availability readiness behavior as a correctness/state-integrity follow-up rather than a security finding: the participation route can persist `isReady` when availability is omitted, but the recommendation path revalidates persisted availability and rejects generation. The sealed local diff review did not cover the remote Turso migration or deployed authenticated UAT; the former now has separate postcondition evidence, while the latter remains pending. Raw invite-token continuation is a hardening recommendation, not a reportable finding, because acceptance binds the token to the intended account and does not accept it from the URL alone.

## Production Turso migration evidence

The Production Turso migration gate is **complete** for the read-only postcondition check. The migration was applied through an authenticated Turso SQL console one statement at a time because sensitive Vercel secrets are non-readable to the CLI. The subsequent read-only checks returned:

| Postcondition | Result |
|---|---:|
| Migration marker 0005 (`m5`) | `1` |
| Migration marker 0006 (`m6`) | `1` |
| 0006 compatibility columns | `6` |
| 0006 indexes | `3` |
| `invite_rows` preserved | `0` affected |

No secret rotation, data deletion, paid feature, or Preview migration was performed. The Preview database remains empty/unprovisioned. This completes the Production migration gate only; Production code deployment is complete at the recorded commit, while authenticated deployed UAT and Preview provisioning remain pending.

## Current deployed Production verification

Live health returned the exact revision `13e01c559daa1fbe6b11c0d16057f7db54ae18d5` with HTTP 200 and security headers for alias `https://hangtime-weld.vercel.app`. Production smoke passed; rendered sign-in had no console errors. This is deployment and security-boundary evidence, not the pending authenticated deployed end-to-end journey, and no real email was re-sent in this run.

## Earlier rendered production verification

The detailed viewport checks below are retained as historical evidence for the earlier production revision. For the current immutable deployment, the in-app browser separately verified that production sign-in rendered without console errors; no submit or email delivery was triggered during that check.

- Page identity and meaningful DOM: pass at `/sign-in?next=%2F` with title `Hangtime`.
- Framework overlay: none observed.
- Console warnings/errors: none observed.
- Interaction proof: empty submission retained the route and focused the required email textbox.
- Live health and sign-in: pass; both returned HTTP 200 for the prior revision recorded above.
- Desktop visual: pass at 1440×1000 Chromium.
- Mobile visual: pass at 390×844 Chromium without clipping or horizontal overflow.
- In-app Browser screenshot capture: blocked by repeated `Page.captureScreenshot` timeout; repository Playwright Chromium was used only for screenshot evidence.
- WebKit/Safari: not executed because the local WebKit binary is not installed; this remains a physical-device/manual gate.
- Real authentication email: manually confirmed working by the product owner earlier in this session, but not re-sent during this release check. Plan-event notification delivery remains an external gate.

## CI/CD safeguards added

- Bounded commands: `ci:fast`, `ci:browser`, `ci:production`, `ci:security`, and `ci:local`.
- No scheduled GitHub Actions jobs; provider and production health checks are manual to avoid surprise runner use.
- Pull-request workflows are checked for secret references and every action must be pinned to a full commit SHA.
- Preview deployment requires `FREE_TIER_DEPLOYMENTS_ENABLED=true`.
- Production promotion and rollback additionally require an explicit `confirm_free_tier=true` input and the protected Production environment.
- Release metadata validates a full commit SHA and an allowlisted Vercel HTTPS deployment URL.
- Code/dependency checks available to a private personal repository are retained; paid GitHub Advanced Security features are not assumed.

## Remote runner evidence

Production deployment evidence is recorded independently of GitHub-hosted jobs. CI run `32586781902` and Security run `32586781895` failed before any steps because of the existing account-level Actions restriction; deployment workflow run `32586786167` was skipped. Billing is not enabled, and none of these remote jobs is claimed as passed. The local results above and the production smoke checks are the current executable evidence.

## Remaining acceptance gates

1. Exercise the complete authenticated deployed create/invite/join/readiness/recommend/map/vote/confirm/acknowledge flow with disposable tester identities and real magic-link delivery; authenticated deployed end-to-end remains pending.
2. Provision isolated Preview database/deployment and run its authenticated UAT; Preview remains empty/unprovisioned.
3. The pending-invite seat reservation and final-seat race pass locally; prove the complete three-independent-session journey against the deployed revision.
4. Capture physical Android Chrome and iOS Safari install, launch, upgrade, and private-offline-cache evidence.
5. Verify deployed Turso ciphertext canaries, key rotation, PITR restore, and a user-controlled encrypted backup destination.
6. Validate live OneMap routing/geocoding quotas and accuracy before describing transit estimates as authoritative.
7. Implement and prove plan-event notification delivery; current evidence covers authentication email only.
8. Re-run GitHub-hosted CI if the account restriction is resolved without enabling unwanted spending.
9. Harden raw invite-token continuation so a bearer token is not duplicated in continuation query state before broader release.

Production code deployment is complete at commit `13e01c559daa1fbe6b11c0d16057f7db54ae18d5` on the recorded immutable URL and alias. Broader/public release readiness remains partial until authenticated deployed end-to-end, Preview provisioning, and the remaining external gates above have direct evidence.
