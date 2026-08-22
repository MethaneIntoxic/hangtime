# Hangtime autonomous UAT and CI iteration — 2026-08-22

## Outcome

The Iteration 2 local acceptance suite passes and the product/UAT contract remains traceable across 23 prioritized stories. Production code deployment is complete at commit `ac06b5ed5f59b9ac3f234cd46c101a7e9537db97`, deployment `dpl_3f1KRgiWZGKBfFWrG1RhueypL5Gv`, with immutable URL `https://hangtime-ks7dyo48w-hangtime1.vercel.app` and alias `https://hangtime-weld.vercel.app`. Authenticated deployed end-to-end and Preview provisioning remain pending. This run does not claim that GitHub-hosted jobs executed: GitHub rejected every job before its first step because of the account's existing billing/spending restriction. No billing setting, paid plan, scheduled runner, or deployment quota was enabled.

## Sources and environments

- Reviewed source: the Iteration 2 working tree based on `925cedf3d7190bd5775f7adbad8ae7e8b32b9ad1`; local source gates are recorded separately from deployed authenticated acceptance.
- Deployed application source: `ac06b5ed5f59b9ac3f234cd46c101a7e9537db97`.
- Production immutable deployment: `https://hangtime-ks7dyo48w-hangtime1.vercel.app` (`dpl_3f1KRgiWZGKBfFWrG1RhueypL5Gv`).
- Production alias: `https://hangtime-weld.vercel.app`.
- Local browser fixtures: isolated seeded SQLite/libSQL data; no production mutation or email delivery.
- Production data: Turso Free, separate from Preview; Preview remains empty/unprovisioned.

The reviewed working tree includes readiness, plan-validity, accessibility, migration, route, UI, test, documentation, and post-scan remediation changes. Production code deployment is complete at the commit above; authenticated deployed end-to-end remains unproven.

## Automated source verification

| Gate | Result | Evidence |
|---|---|---|
| Lint and TypeScript | Pass | ESLint and `tsc --noEmit` both completed successfully |
| Unit/security/domain tests | Pass | 17 files, 79 tests |
| Full E2E browser UAT | Pass with two intentional project-conditional skips | 42 passed, 2 skipped across desktop/mobile Chromium |
| Production smoke/security contract | Pass for current alias deployment | Authenticated Vercel curl checks returned the exact deployed revision; health, sign-in, landing, manifest, and service worker returned HTTP 200; unauthenticated `/api/v1/me` returned 401; invalid magic-link returned 400; cross-origin unsafe POST returned 403; same-origin sign-out returned 200; HSTS and CSP were present. Full authenticated deployed end-to-end remains pending. |
| Next.js production build | Pass | Next.js 16.3.1 production build |
| PWA/map static policy | Pass | `PWA_STATIC_CHECK_PASS`, `MAP_CHECK_PASS` |
| CI workflow policy | Pass | `CI_POLICY_PASS workflows=7` |
| Production dependency audit | Pass | No known production vulnerabilities |
| Live map provider boundary | Pass | Map-provider verification completed successfully |
| Production policy audit | Pass | Production audit completed successfully against the checked-out source contract |
| Disposable location-encryption verification | Pass | `LOCATION_ENCRYPTION_VERIFICATION_PASS rows=8`; all 8 disposable fixture rows were encrypted and decryptable with the test keyring |
| Migration hardening | Pass | The explicit migration preflights four duplicate identity classes transactionally before unique indexes; local migration tests pass |
| Diff hygiene | Pass | `git diff --check` |

New acceptance coverage includes deliberate readiness UI, required readiness evidence, readiness and derived-state invalidation, version-conflict safety, idempotent concurrent recommendation generation, stale ballot/confirmation rejection, deployable migration integrity, axe checks across primary routes, keyboard interaction, dialog focus restoration, and 320/390/430px ballot-action geometry. Earlier coverage for three-person capacity and concurrent final-seat handling does not implement pending-invite seat reservation; DT-003 and DT-004 therefore remain incomplete.

## Sealed security diff scan

Security diff scan `a3d5047a-6725-4799-aa8e-c418f14f1cb1` completed and sealed at `2026-08-22T10:44:49Z` against the pre-remediation snapshot. It covered all 33 changed source files in the working-tree diff, with focused tests passing and no production credentials or production database used. The scan retained two reportable low-severity integrity findings. Remediation is now implemented and verified in the current working tree. Production code deployment is complete at commit `ac06b5ed5f59b9ac3f234cd46c101a7e9537db97`; authenticated deployed behavior remains pending:

| Finding | Severity / CWE | Sealed-snapshot disposition | Local remediation status |
|---|---|---|---|
| Equivalent profile preference reordering invalidates shared plans (`csf_f86680152ec33535ed29cc66`) | Low · CWE-20, CWE-400 | Reportable; authenticated-user, recoverable shared-plan disruption | Canonical preference-set comparison is implemented and order-invariance tests pass locally; Production code is deployed at the recorded commit, while authenticated deployed behavior remains pending. |
| Equivalent availability reordering invalidates shared plan state (`csf_1e24511cf1424f2e54bad434`) | Low · CWE-20, CWE-400 | Reportable; authenticated-participant, recoverable shared-plan disruption | Canonical availability-window comparison is implemented and order-invariance tests pass locally; Production code is deployed at the recorded commit, while authenticated deployed behavior remains pending. |

The scan suppressed a route-local CSRF candidate because the production proxy applies the exact-origin check to unsafe `/api/:path*` requests; this remains a production-proxy deployment assumption, not a route-level fix. It also retained the omitted-availability readiness behavior as a correctness/state-integrity follow-up rather than a security finding: the participation route can persist `isReady` when availability is omitted, but the recommendation path revalidates persisted availability and rejects generation. The sealed local diff review did not cover the remote Turso migration or deployed authenticated UAT; the former now has separate postcondition evidence, while the latter remains pending.

## Production Turso migration evidence

The Production Turso migration gate is **complete** for the read-only postcondition check. The migration was applied through an authenticated Turso SQL console one statement at a time because sensitive Vercel secrets are non-readable to the CLI. The subsequent read-only checks returned:

| Postcondition | Result |
|---|---:|
| Dietary column present | `1` |
| Migration marker present | `1` |
| Integrity indexes present | `4` |
| Duplicate identity groups | `0` |
| `private_locations` preserved | `1` |

No secret rotation, data deletion, paid feature, or Preview migration was performed. The Preview database remains empty/unprovisioned. This completes the Production migration gate only; Production code deployment is complete at the recorded commit, while authenticated deployed UAT and Preview provisioning remain pending.

## Current deployed Production verification

Authenticated Vercel curl health returned the exact revision `ac06b5ed5f59b9ac3f234cd46c101a7e9537db97` for alias `https://hangtime-weld.vercel.app`. The alias checks returned health/sign-in/landing/manifest/service-worker 200, unauthenticated `/api/v1/me` 401, invalid magic-link 400, cross-origin unsafe POST 403, and same-origin sign-out 200. HSTS and CSP were present. The service-worker response was `public, must-revalidate, max-age=0`. This is deployment and security-boundary evidence, not the pending authenticated deployed end-to-end journey.

## Earlier rendered production verification

This evidence applies to the prior `96b3fbc8b8630360ad491aef866a0e98822e92b6` deployment and is retained as historical evidence for that revision only. The safe flow under test was: production sign-in loads → an empty submit is attempted → the required email field receives focus without navigation or network-side email delivery.

- Page identity and meaningful DOM: pass at `/sign-in?next=%2F` with title `Hangtime`.
- Framework overlay: none observed.
- Console warnings/errors: none observed.
- Interaction proof: empty submission retained the route and focused the required email textbox.
- Live health and sign-in: pass; both returned HTTP 200 for the prior revision recorded above.
- Desktop visual: pass at 1440×1000 Chromium.
- Mobile visual: pass at 390×844 Chromium without clipping or horizontal overflow.
- In-app Browser screenshot capture: blocked by repeated `Page.captureScreenshot` timeout; repository Playwright Chromium was used only for screenshot evidence.
- WebKit/Safari: not executed because the local WebKit binary is not installed; this remains a physical-device/manual gate.
- Real authentication email: manually confirmed working by the product owner during this session. This proves the current Resend authentication-email path only, not plan-event notification delivery.

## CI/CD safeguards added

- Bounded commands: `ci:fast`, `ci:browser`, `ci:production`, `ci:security`, and `ci:local`.
- No scheduled GitHub Actions jobs; provider and production health checks are manual to avoid surprise runner use.
- Pull-request workflows are checked for secret references and every action must be pinned to a full commit SHA.
- Preview deployment requires `FREE_TIER_DEPLOYMENTS_ENABLED=true`.
- Production promotion and rollback additionally require an explicit `confirm_free_tier=true` input and the protected Production environment.
- Release metadata validates a full commit SHA and an allowlisted Vercel HTTPS deployment URL.
- Code/dependency checks available to a private personal repository are retained; paid GitHub Advanced Security features are not assumed.

## Remote runner evidence

Production deployment evidence is recorded independently of GitHub-hosted jobs. CI run `32569601604` and Security run `32569601613` were rejected before their first steps because of the account billing/spending restriction; deployment workflow run `32569605762` was skipped. None of these remote jobs is claimed as passed. The local results above and the authenticated Vercel curl checks are the current executable evidence.

## Remaining acceptance gates

1. Exercise the complete authenticated deployed create/invite/join/readiness/recommend/map/vote/confirm/acknowledge flow with disposable tester identities and real magic-link delivery; authenticated deployed end-to-end remains pending.
2. Provision isolated Preview database/deployment and run its authenticated UAT; Preview remains empty/unprovisioned.
3. Implement pending-invite seat reservation and prove the complete three-independent-session journey; the current final-seat race alone does not close DT-003/DT-004.
4. Capture physical Android Chrome and iOS Safari install, launch, upgrade, and private-offline-cache evidence.
5. Verify deployed Turso ciphertext canaries, key rotation, PITR restore, and a user-controlled encrypted backup destination.
6. Validate live OneMap routing/geocoding quotas and accuracy before describing transit estimates as authoritative.
7. Implement and prove plan-event notification delivery; current evidence covers authentication email only.
8. Re-run GitHub-hosted CI if the account restriction is resolved without enabling unwanted spending.

Production code deployment is complete at commit `ac06b5ed5f59b9ac3f234cd46c101a7e9537db97` on the recorded immutable URL and alias. Broader/public release readiness remains partial until authenticated deployed end-to-end, Preview provisioning, and the remaining external gates above have direct evidence.
