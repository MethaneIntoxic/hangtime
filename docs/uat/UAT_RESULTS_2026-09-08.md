# Hangtime email-return privacy correction — 2026-09-08

Scope: HT-DEF-024 / DT-022 / HT-US-901 / HT-TC-901-EMAIL-RETURN. Existing uncommitted Iteration 4 work was preserved in `C:/Users/admin/Desktop/random projs/dinner_time`; no deployment, real email, remote database operation, hosted workflow, or billing change was performed.

## Defect and correction

The magic-link route previously filtered only return paths beginning directly with `/join/`. A nested or encoded invitation path could therefore enter the generated email URL through its `next` parameter.

The route now permits only the exact invitation-resume destination `/join/resume`; every other submitted destination resolves to home (`/`) and emits no `next` parameter. Server-bound continuations still force `/join/resume`. Ordinary unbound deep links also return home after sign-in: this is an intentional navigation restriction, recorded in the architecture and UAT contracts.

Changed implementation: `src/app/api/v1/auth/magic-link/route.ts`. Regression evidence: `tests/unit/api-route-hardening.test.ts`, inspecting the captured email URL with the email sender mocked.

## Verification

| Check | Result |
|---|---|
| New regression before correction | 10 tests executed; nested and encoded canary cases failed (2 failures) |
| Focused regression after final integration | 13/13 passed |
| Direct, nested, encoded, fragment and query input canaries | Absent from generated email URLs; unsupported destinations return home; normalized aliases cannot bypass the exact-input allowlist |
| Exact unbound resume and server-bound continuation | Resume destination preserved |
| Targeted ESLint | Passed |
| `tsc --noEmit --pretty false` | Passed |
| `git diff --check` | Passed |

This was a server-side output-contract correction. No browser/build suite or real email-delivery test was rerun in this increment. The [September 7 consolidated results](UAT_RESULTS_2026-09-07.md) remain prior-snapshot evidence, not evidence for every byte of this later working tree.

**HT-DEF-024 is fixed and verified locally, not deployed. Release remains on hold.** DT-022 remains open for the distinct authenticated raw-token join path (HT-DEF-023). Stale invitation-pointer recovery, duplicate-link session rotation, request bounds/cookie behavior, trusted client-IP selection, immutable Preview/migration, authenticated deployed UAT, and physical-device gates remain open.
