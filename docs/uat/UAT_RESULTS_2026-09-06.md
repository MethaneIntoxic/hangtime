# Hangtime release readiness — 2026-09-06

## Scope and source boundary

Active implementation checkout: `C:/Users/admin/Desktop/random projs/dinner_time`.
The task's initial `Documents/ChatGPT/dinner time` folder contains only the older planning blueprint and is not the deployed source checkout.

Local starting HEAD: `c9cb3481c2cca9398bbfc00cad9d509a7ca8b272`, with pre-existing, uncommitted Iteration 4 invitation continuation code, migration 0007, tests, and specification edits. These were preserved. A local working-tree pass must not be described as a clean-commit or deployed pass.

Production health reports revision `13e01c559daa1fbe6b11c0d16057f7db54ae18d5` at `https://hangtime-weld.vercel.app`. No promotion or remote migration has been performed during this run.

## Live evidence and traceability

| Test case | Story | Scenario / expected result | Actual evidence | Result |
|---|---|---|---|---|
| HT-TC-20260906-001 | HT-US-801, HT-US-805 | Public health is healthy and reports the expected full deployed revision; protected home redirects and private API rejects anonymous requests | `node scripts/smoke.mjs https://hangtime-weld.vercel.app 13e01c559daa1fbe6b11c0d16057f7db54ae18d5` returned `SMOKE_CHECK_PASS` | Pass, deployed |
| HT-TC-20260906-002 | HT-US-804 | Sign-in renders at 1280x900 and 390x844; invalid email is rejected by the browser without sending email | Playwright: correct title/URL, meaningful content, no page/console errors, no horizontal overflow, input validity false after submit | Pass, deployed |
| HT-TC-20260906-003 | HT-US-804 | Sign-in fits 320x812 without horizontal scrolling | Card right edge 337px on a 320px viewport; inspected screenshot confirms clipping | Fail, HT-DEF-019 |
| HT-TC-20260906-004 | HT-US-804 | Sign-in permits zoom and passes automated accessibility scan | axe reports `meta-viewport`, moderate impact; `maximum-scale=1` emitted | Fail, HT-DEF-020 |
| HT-TC-20260906-005 | HT-US-803, HT-US-802 | Installed service worker caches only public shell; offline private navigation shows safe recovery | Cache contains only `/offline.html`, manifest, and two icons. Offline canary plan navigation renders “Hangtime is offline” without plan/token contents | Pass, deployed browser; physical installation not tested |
| HT-TC-20260906-006 | HT-US-501 | Map style endpoint is reachable and advertises only approved provider endpoints | `node scripts/check-map-provider.mjs` returned `MAP_PROVIDER_PASS latency_ms=101 endpoints=4` | Pass, live style smoke only; authenticated map not tested |
| HT-TC-20260906-007 | HT-US-805 | Remote CI actually executes checks | GitHub run `32683198274` has failed jobs with empty steps; check-run annotation `97303357839` states account payment/spending restriction | Blocked before runner execution |
| HT-TC-20260906-008 | HT-US-801 | Authorized current-account magic-link request provides an actionable response | Existing personal Brave session was signed out; one authorized request submitted; UI displayed “Email sent” | Request acknowledged; mailbox receipt and verification pending |
| HT-TC-20260906-009 | HT-US-802, HT-US-805 | Local fixture commands cannot inherit remote database or provider credentials | Original hermetic runner inherited environment and did not override priority `TURSO_DATABASE_URL`; seeder deletes existing records | Fail by code-path verification, HT-DEF-021; no remote seed attempted |

Initial smoke invocation used a short SHA and failed exact comparison; rerun used the full revision and passed. Initial Playwright navigation waited for `networkidle` and timed out; rerun used `domcontentloaded` plus the visible email input and passed. Neither tooling issue is classified as an application defect.

## Defect priorities and decisions

| Defect | Priority | Decision / acceptance |
|---|---|---|
| HT-DEF-019: narrow sign-in overflow | S2 | ACCEPT: remove intrinsic grid/card sizing overflow; regression must prove 320px bounds and usable submit control, without hiding overflow |
| HT-DEF-020: zoom cap | S2 | ACCEPT: remove maximum zoom restriction; rendered viewport and axe regression must pass |
| HT-DEF-021: local fixture isolation | S0 risk when remote configuration is inherited | ACCEPT: explicitly force isolated local database and test credentials in all automated fixture processes; prove inherited remote canaries never reach child configuration before running browser fixtures |
| HT-DEF-022: hosted jobs lack default-off execution gate | Cost control | MITIGATE: require explicit runner opt-in independent of deployment opt-in; retain account spending restriction and local validation path |

## Release disposition

### Local baseline and CI policy verification

- Existing Iteration 4 baseline: `pnpm lint`, `pnpm typecheck`, `pnpm test` (116 tests in 22 files), `pnpm check:ci`, `pnpm check:pwa`, `pnpm check:maps`, and `pnpm build` passed. This predates the final changes of this increment; final consolidated gates remain required.
- Hosted runner cost gate: `node scripts/check-ci-policy.mjs` passes for seven workflows; `pnpm exec vitest run tests/unit/ci-policy.test.ts` passes 4/4; TypeScript and diff checks pass. `actionlint` is unavailable locally and has not run.
- Hosted jobs now require the explicit `HOSTED_CI_ENABLED` opt-in in local workflow source. Deployment also requires the separate `FREE_TIER_DEPLOYMENTS_ENABLED` gate. Neither remote variable was enabled. See [CI cost policy](../CI_COST_POLICY.md).
- An initial test-isolation patch passed its two targeted tests, but integration review found that deleting environment keys is insufficient when dotenv or Playwright can restore them. Explicit blank overrides and final isolation verification are still required; this partial result does not clear HT-DEF-021.

**Hold wider release.** Production remains on the prior revision. Pending gates include final local verification of existing Iteration 4 work, migration 0007 evidence, reviewed immutable source, safe preview, authenticated deployed invitation/planning/voting flows, and physical iOS/Android installation and accessibility.

The user authorized current-account UAT and requested alternative display names, but a renamed account is still one identity. Do not represent single-account tests as independent multi-user authorization evidence. Use isolated local identities for that coverage until separate real accounts are available. Existing user plans must remain intact.

No billing setting, paid plan, paid domain, quota increase, remote workflow dispatch, or production deployment was enabled. Provider account subscription/remaining quota dashboards have not been refreshed during this run; prior free-tier account evidence is historical. Low-volume public smoke requests consume the existing service quotas.

## Evidence artifacts

Screenshots are local and outside the repository at `C:/Users/admin/.codex/visualizations/2026/09/06/01a07709-855a-7f02-b2ec-944879280a86/`:

- `sign-in-1280.png`: desktop sign-in keyboard focus.
- `sign-in-390.png`: mobile invalid-email form.
- `sign-in-320-before.png`: inspected narrow-card clipping.
- `offline-320.png`: public-only offline recovery.

Provider reference pages checked during this run: [Vercel Hobby](https://vercel.com/docs/plans/hobby), [Turso pricing](https://turso.tech/pricing), [Resend quotas](https://resend.com/docs/knowledge-base/account-quotas-and-limits). These describe service policies; they do not prove current account usage or authorize upgrading.
