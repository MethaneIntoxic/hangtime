# UAT execution record — UAT-2026-08-17-01

Status: **Not release-approved**  
Environment: local Windows development server, Node 24, pnpm 10.34.5, Chromium  
Viewports reviewed: 1440×1000 desktop; 390×844 mobile  
Dataset: seeded Singapore demo users/plans plus one newly created two-diner plan

Automated result: **30/30 unit/security tests, 16/16 desktop/mobile journey tests, and 1/1 production PWA/security test passed.** `pnpm ci:local` completed successfully.

## Outcome

The principal demo flow is usable: home → create a two-person plan → lobby → shortlist/map → multi-select ballot → confirmed plan/attendance/feedback. No browser console warnings or errors were observed during the recorded desktop and mobile loops. The app is not ready for public beta because production authentication, durable storage, and at-rest protection for precise origins are absent.

## Executed evidence

| Check | Result | Evidence/observation |
|---|---|---|
| Desktop home and navigation | Pass | Editorial home rendered at 1440×1000; plan CTA, active plans, companion/profile navigation present; console clean. |
| Create two-person brunch | Pass after test correction | Ethan was already preselected; the original automation clicked again and deselected him. The test now asserts `aria-pressed=true`; creation navigates to a new `plan_*` lobby. |
| Budget persistence | Pass | Automated creation sets S$160 and asserts `S$160 Total` in the resulting lobby. |
| Lobby/readiness rendering | Partial | Summary and participants render. Genuine multi-actor readiness/generation remains unproved. |
| Shortlist/list-map parity | Pass | Seeded Friday dinner switches to map and back without losing the route/ballot UI. |
| Multiple-choice ballot | Pass | Mobile selection persisted and the submit action completed without console errors. Formula boundary permutations remain ticketed. |
| Confirmed plan, attendance, feedback | Pass on seeded fixture | Confirmed detail, ICS action, attendance action, and feedback dialog/submit rendered and responded. |
| Companion and profile surfaces | Partial | Companion modal opens and profile save returns success; full lifecycle/consent is not implemented. |
| Private service-worker cache | Pass | Static allowlist validation and a production Chromium run confirmed that only the offline shell, manifest, and icons were cached; an offline private route showed the public fallback. |
| Mobile 390×844 | Fail (S2) | Voting submit bar and global bottom navigation compete for lower-screen space; tracked in DT-008. |
| Browser precise-origin exposure | Pass in sampled UI | General areas shown; exact origins not observed in rendered lobby/map. |
| At-rest precise-origin protection | Fail (S1) | SQLite schema stores postal code, latitude, and longitude as plaintext; tracked in DT-002. |
| Production authentication | Fail (S1) | Only local demo-session behavior is implemented; tracked in DT-001. |
| Live maps/venues/transit/notifications | Blocked external gate | Adapters are stubs and provider accounts/secrets are not provisioned; tracked in DT-010/DT-011. |

## Defects and follow-up

- DT-001, DT-002, DT-003, DT-004, DT-005, DT-010, and DT-014 block public beta.
- DT-006, DT-007, DT-008, and DT-009 block a confident beta UAT sign-off.
- Misleading “encrypted” copy and external name-seeded avatar requests found during the run were corrected immediately: the copy now states only the verified visibility property and avatars render locally as initials.

## Exit decision

UAT exit criteria are not met. This run is a reliable local-demo baseline, not production acceptance. Rerun all P0 cases after DT-001/DT-002 and live providers are implemented, then execute the protected staging deployment and rollback drill.

## Verification commands

- `pnpm ci:local` — pass (lint, type-check, 30 tests, PWA static policy, production build, 16 desktop/mobile journeys).
- `pnpm test:e2e:ci` — pass with an isolated temporary SQLite database; 16/16.
- `pnpm test:e2e:production` — pass against the standalone production server; 1/1.
- `node scripts/smoke.mjs http://127.0.0.1:3213` — pass against the standalone build.
- `actionlint` 1.7.12 — all five workflow files pass.
- Docker image execution — not run locally because Docker is not installed; the CI container-build job is the authoritative execution gate.
