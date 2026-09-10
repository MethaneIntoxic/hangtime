# Hangtime verification continuation — 2026-09-07

This resumes the [2026-09-06 run](UAT_RESULTS_2026-09-06.md), which was interrupted by an account usage limit. Existing uncommitted application work and all test fixtures were preserved. No source commit, production promotion, remote database migration, or billing change is implied by this record.

## Verified progress

| Case / defect | Evidence | Disposition |
|---|---|---|
| HT-TC-20260906-001 | `node scripts/smoke.mjs https://hangtime-weld.vercel.app 13e01c559daa1fbe6b11c0d16057f7db54ae18d5` returned `SMOKE_CHECK_PASS` on September 7 | Deployed smoke passes; revision unchanged |
| HT-TC-20260906-009 / HT-DEF-021 | `pnpm exec vitest run tests/unit/hermetic-e2e-runner.test.ts`: 3/3 passed, including actual Next dotenv-loader canaries | Explicit local DB and blank credential overrides tested; final browser gates pending |
| HT-DEF-019 / HT-DEF-020 | Local sign-in card/main use `min-w-0`; root viewport no longer declares `maximumScale: 1` | Local fixes present; rendered regression gate pending |
| HT-DEF-022 | Seven local workflows retain the default-off `HOSTED_CI_ENABLED` job gate; deployment opt-in remains separate | No remote opt-in or hosted runner dispatch performed |

The production shell uses disposable local storage and test-only auth/keyring values. Its test email driver intentionally cannot send mail in production mode; this is not real email-delivery evidence. The separate development-mode invitation suite uses a local test outbox.

An intermediate typecheck found an unsupported `toBeInvalid` Playwright matcher in the new sign-in regression. It was replaced with browser validity and validation-message assertions; final consolidated verification must confirm the correction.

## Remaining release gates

### Invitation review findings awaiting focused reproduction and correction

These are source-review findings, not claims of a production exploit or a passing security audit. They concern the pre-existing unfinished Iteration 4 work and keep its release gate closed.

| Finding | Story | Evidence / required test |
|---|---|---|
| HT-DEF-023: authenticated raw-token path | HT-US-901 | `src/app/join/[token]/page.tsx` scrubs the URL only in the sign-in continuation action; an authenticated load still calls raw-token preview and participation paths. Require signed-in fresh-link UAT proving token-free post-entry URLs. |
| HT-DEF-024: nested return path | HT-US-901 | `safeMagicReturnTo` rejects direct `/join/` paths but permits a different path whose query embeds an invitation. Require email-output canaries for nested/encoded query and fragment inputs. |
| HT-DEF-025: stale continuation recovery | HT-US-902, HT-US-903 | Resume returns unavailable for a stale pointer, while participation gives the pointer priority over raw-token fallback. Require revoked/reissued invitation recovery without weakening pointer binding or mutating state on GET. |
| HT-DEF-026: multiple issued link recovery | HT-US-902, HT-US-903 | Multiple links can reference one continuation; a later verification may rotate the earlier session without its invite pointer. Require two-issued-link/same-browser and cross-device verification scenarios. |
| HT-DEF-027: request bounds and cookie clearing | HT-US-901, HT-US-903 | JSON parsing precedes body bounds; production `__Host-` cookie deletion attributes require browser verification. Require bounded-body and real cookie-jar regression tests before declaring these controls verified. |

The unkeyed SHA-256 hash of a 256-bit random handle is a wording deviation from the blueprint, not a demonstrated vulnerability. Remote migration, partially existing schema, and operational log retention remain distinct evidence gaps.

- Consolidated local lint/types/unit/build and production/browser suites for the final working-tree contents.
- Independent review of the existing Iteration 4 invitation continuation changes and additive migration 0007.
- Reviewed immutable source and isolated Preview before production promotion.
- Authenticated deployed UAT: the prior authorized email request was acknowledged, but completed sign-in is not confirmed. No repeat email was sent during this continuation.
- Separate real identities for independent deployed voting/authorization proof; a renamed current account is still one identity.
- Physical iOS/Android PWA and assistive-technology evidence, plus provider/account quota and operational recovery gates.

## Final consolidated local gates

| Command / case | Result |
|---|---|
| `pnpm ci:fast` | Pass: workflow policy, lint, TypeScript, 117 unit tests in 22 files, PWA/map checks, production build |
| `pnpm ci:production` | Pass: 5/5 Chromium tests, covering production PWA/security plus 320px, 390px, desktop sign-in and invalid-email no-send |
| `pnpm ci:browser` | Pass: 69 passed, 3 intentional viewport skips, 0 failures, 0 flaky tests |
| Fresh local rendered sign-in | 320px and 1280px screenshots inspected by root; correct content, no overflow, zero console messages and zero axe violations reported |

The three skipped cases are desktop variants of mobile-only assertions in `accessibility.spec.ts`, `adversarial-user-flows.spec.ts`, and `pending-invite-lobby.spec.ts`; their mobile equivalents passed. The test JSON at `test-results/e2e-results.json` is local, ignored, and can be overwritten by later runs.

HT-DEF-019 and HT-DEF-020 are **fixed and verified locally**, not deployed. HT-DEF-021's automated-runner configuration is **fixed and verified locally**, including parent-environment and dotenv canaries. Direct operator seed/reset commands are not an approved remote-data workflow. HT-DEF-022 is **implemented and verified in local workflow source**, not exercised on a hosted runner.

Fresh screenshots: `C:/Users/admin/.codex/visualizations/2026/09/06/01a07709-855a-7f02-b2ec-944879280a86/sign-in-320-after.png` and `sign-in-1280-after.png`. Browser validation used repository Playwright because the separate Browser plugin was absent. The only reported server warning was the non-application `NO_COLOR`/`FORCE_COLOR` warning. Physical devices remain untested.

The visual server was interrupted after capture. Temporary-directory cleanup initially encountered a shell policy rejection. Root then verified that the visual fixture directory `hangtime-visual-3213` was empty and resolved exactly under the system temp directory, observed no listener on port 3213, and removed the empty directory with native PowerShell (`VISUAL_TEMP_EMPTY_DIRECTORY_REMOVED`). No recursive deletion or unrelated process cleanup was used.

**Release remains on hold.** A local fix is not a deployed fix. The goal remains unfinished; the app currently reports it as `usageLimited`. The separate daily follow-up is configured and restricted to useful bounded work and meaningful updates. Next work is the focused invitation-hardening increment DT-022 through DT-026 in the delivery backlog, followed by immutable-source and remote acceptance gates.
