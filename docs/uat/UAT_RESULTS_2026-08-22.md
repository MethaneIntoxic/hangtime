# Hangtime autonomous UAT and CI iteration — 2026-08-22

## Outcome

The expanded local acceptance suite passes, the production deployment remains healthy, and the product/UAT contract is now traceable across 23 prioritized stories. This run does not claim that GitHub-hosted jobs executed: GitHub rejected every job before its first step because of the account's existing billing/spending restriction. No billing setting, paid plan, scheduled runner, or deployment quota was enabled.

## Sources and environments

- Reviewed source: `925cedf3d7190bd5775f7adbad8ae7e8b32b9ad1` (`Expand UAT and zero-cost CI safeguards`).
- Deployed application source: `96b3fbc8b8630360ad491aef866a0e98822e92b6`.
- Production origin: `https://hangtime-weld.vercel.app`.
- Local browser fixtures: isolated seeded SQLite/libSQL data; no production mutation or email delivery.
- Production data: Turso Free, separate from Preview.

The reviewed commit changes documentation, tests, scripts, and workflows only; it does not change the deployed application runtime.

## Automated source verification

| Gate | Result | Evidence |
|---|---|---|
| Combined local CI | Pass | `pnpm verify` → `LOCAL_CI_PASS` |
| Lint and TypeScript | Pass | ESLint and `tsc --noEmit` |
| Unit/security/domain tests | Pass | 13 files, 62 tests |
| Hermetic browser UAT | Pass with one intentional project skip | 35 passed, 1 skipped across desktop/mobile Chromium |
| Production PWA/security browser contract | Pass | 1 production Chromium case |
| Next.js production build | Pass | Next.js 16.3.1 production build |
| PWA/map static policy | Pass | `PWA_STATIC_CHECK_PASS`, `MAP_CHECK_PASS` |
| CI workflow policy | Pass | `CI_POLICY_PASS workflows=7` |
| Production dependency audit | Pass | No known production vulnerabilities |
| Live map provider boundary | Pass | Four endpoints, 337 ms in this run |
| Exact live revision smoke | Pass | Health, auth redirect/401, headers, manifest, service worker, demo-switch denial |
| Release metadata validation | Pass | Source SHA/channel/Vercel URL validated |
| Diff hygiene | Pass | `git diff --check` |

New acceptance coverage includes three-person capacity and concurrent final-seat handling, availability replacement and malformed windows, recommendation provenance/privacy, map outage fallback, organizer override reason, confirmation replay rejection, private-origin-free ICS output, rate-limit isolation, exact session expiry, and no-viable-candidate fallback.

## Rendered production verification

The safe flow under test was: production sign-in loads → an empty submit is attempted → the required email field receives focus without navigation or network-side email delivery.

- Page identity and meaningful DOM: pass at `/sign-in?next=%2F` with title `Hangtime`.
- Framework overlay: none observed.
- Console warnings/errors: none observed.
- Interaction proof: empty submission retained the route and focused the required email textbox.
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

Push `925cedf3d7190bd5775f7adbad8ae7e8b32b9ad1` created CI run `32564124591` and Security run `32564124638`. All jobs completed with zero steps. GitHub's annotation states that the jobs were not started because recent account payments failed or the spending limit must be increased. These runs are recorded as **not executed**, not failed application gates. The local results above are the current executable evidence.

## Remaining acceptance gates

1. Exercise the complete authenticated production create/invite/join/readiness/recommend/map/vote/confirm/acknowledge flow with disposable tester identities.
2. Capture physical Android Chrome and iOS Safari install, launch, upgrade, and private-offline-cache evidence.
3. Verify deployed Turso ciphertext canaries, key rotation, PITR restore, and a user-controlled encrypted backup destination.
4. Validate live OneMap routing/geocoding quotas and accuracy before describing transit estimates as authoritative.
5. Implement and prove plan-event notification delivery; current evidence covers authentication email only.
6. Re-run GitHub-hosted CI if the account restriction is resolved without enabling unwanted spending.

The deployed personal beta remains usable. Broader/public release readiness remains partial until the external gates above have direct evidence.
