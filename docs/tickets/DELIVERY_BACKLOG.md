# Hangtime delivery backlog

Created from UAT runs `UAT-2026-08-17-01` through `UAT-2026-08-21` and architecture/security/UX review. Severity controls release disposition; priority controls execution order. Story-level acceptance and evidence ownership live in `docs/uat/UAT_PLAN.md`.

## Release view

| Ticket | Severity | Priority | Owner | Release gate | UAT stories | Summary |
|---|---:|---:|---|---|---|---|
| DT-001 | S1 | P0 | Backend | Public beta | HT-US-801 | Provision and prove production email authentication |
| DT-002 | S1 | P0 | Platform | Public beta | HT-US-802 | Turso migrations, backups, and encrypted precise location |
| DT-003 | S1 | P0 | QA | Beta | HT-US-202, HT-US-301, HT-US-502, HT-US-503, HT-US-601, HT-US-602 | True three-actor, single-plan end-to-end journey |
| DT-004 | S1 | P0 | Full stack | Beta | HT-US-301, HT-US-302 | Complete invitation acceptance and abuse cases |
| DT-005 | S1 | P0 | Backend | Beta | HT-US-302, HT-US-401 | Enforce readiness and invalidate stale recommendations |
| DT-006 | S2 | P0 | Frontend | Beta | HT-US-501, HT-US-502, HT-US-503, HT-US-804 | Keyboard semantics and automated accessibility checks |
| DT-007 | S2 | P0 | Full stack | Beta | HT-US-401, HT-US-503, HT-US-601, HT-US-703, HT-US-805 | Deterministic request failure and recovery states |
| DT-008 | S2 | P0 | Frontend | Beta | HT-US-102, HT-US-501, HT-US-803, HT-US-804 | Resolve mobile sticky-action collision and installed-PWA UAT |
| DT-009 | S2 | P1 | Product | Beta | HT-US-202, HT-US-203 | Intentional companion selection and meal-aware time defaults |
| DT-010 | S1 | P0 | Integrations | Public beta | HT-US-402, HT-US-501 | Live Singapore venue/transit providers with provenance and quota handling |
| DT-011 | S2 | P1 | Integrations | Public beta | HT-US-702, HT-US-703, HT-US-806 | Honest notification boundary, delivery, retries, and preferences |
| DT-012 | S2 | P1 | Full stack | Beta | HT-US-201, HT-US-202 | Companion lifecycle, consent, favourites, and removal |
| DT-013 | S2 | P1 | Full stack | Beta | HT-US-703 | Post-meal feedback timing, idempotency, and reporting |
| DT-014 | S1 | P0 | Platform | Public beta | HT-US-801, HT-US-802, HT-US-803, HT-US-805, HT-US-806 | Production observability, abuse controls, CSP, and incident runbook |

## Progress update — 2026-08-18

| Ticket | Status | New evidence |
|---|---|---|
| DT-003 | In progress | A third diner now redeems a newly issued email-bound invite through the UI on desktop/mobile; the full three-independent-session vote/confirm lifecycle remains. |
| DT-004 | In progress | Valid acceptance and one-time reuse rejection are automated. Expiry, concurrent redemption, capacity race, and token-safe logging remain. |
| DT-007 | In progress | Plan creation now proves one failed submission preserves companion, meal and budget, then succeeds on retry. Other mutations remain. |
| DT-008 | In progress | 390×844 automation proves ballot cap announcement, no horizontal overflow, and no submit/navigation overlap. Smaller viewports and installed-device UAT remain. |
| DT-009 | In progress | Server validation now rejects empty/duplicate/unaccepted companions, invalid windows, invalid budget and invalid enums. Intentional direct-page selection and meal-aware time defaults remain. |
| DT-014 | In progress | CSP/HSTS, revision-aware smoke, actionlint, isolated Turso environments, staged Vercel promotion and shared deploy locks are added. Live GitHub/Vercel/Turso evidence remains. |

## Progress update — 2026-08-22, Iteration 3 production evidence

| Ticket | Status | New evidence |
|---|---|---|
| DT-003 | Implemented/deployed; authenticated gate pending | Pending reservations, intended-account binding, accept/reissue/revoke lifecycle, capacity, and concurrent tests pass locally; the full authenticated deployed three-actor journey remains pending. |
| DT-004 | Implemented/deployed; authenticated gate pending | Bound token lifecycle, safe projections, reissue/revoke, and race tests pass locally; raw token continuation hardening and the authenticated deployed journey remain limitations. |
| DT-005 | Implemented/deployed; authenticated gate pending | Deliberate readiness requires origin, overlapping availability, and dietary confirmation. Material participant/plan edits atomically clear readiness and delete stale runs/ballots; stale confirmations and ballots fail, and concurrent generation converges on one run. Production smoke and map fallback evidence pass; deployed authenticated acceptance remains a pre-release gate. |
| DT-006 | Complete in automated source scope; physical review pending | Axe reports no serious/critical violations across home, create, lobby, voting, confirm, feedback, profile, and join fixtures. Keyboard selection, radio navigation, Escape/focus restoration, live semantics, and 320/390/430px mobile action geometry are automated. Physical screen-reader, forced-colors, 200% zoom, iOS, and Android evidence remains part of release UAT. |

## Sealed security diff follow-up — 2026-08-22

Scan `a3d5047a-6725-4799-aa8e-c418f14f1cb1` is complete and sealed against the pre-remediation snapshot, with complete coverage of 33 changed source files. It produced two reportable low-severity findings. Both are now remediated in the current source and verified locally. Iteration 3 remediation is deployed at commit `13e01c559daa1fbe6b11c0d16057f7db54ae18d5`; authenticated production proof and the raw invite-token continuation hardening recommendation remain pending.

| Finding | Affected path | Status | Remediation |
|---|---|---|---|
| Equivalent profile preference reordering invalidates shared plans (`csf_f86680152ec33535ed29cc66`) | `src/app/api/v1/me/profile/route.ts:37-47` → `:109-126` and `src/lib/plan-inputs/canonical.ts` | Historical sealed finding, low, medium confidence; recoverable disruption by an authenticated user | Remediated locally with canonical preference-set comparison; order-invariance tests pass. Production code is deployed at the recorded commit; authenticated deployed behavior remains pending. |
| Equivalent availability reordering invalidates shared plan state (`csf_1e24511cf1424f2e54bad434`) | `src/app/api/v1/plans/[id]/participation/route.ts:295-318` → `src/lib/db/plan-mutations.ts:46-76` and `src/lib/plan-inputs/canonical.ts` | Historical sealed finding, low, high confidence; recoverable disruption by an authenticated participant | Remediated locally with canonical availability-window comparison; order-invariance tests pass. Production code is deployed at the recorded commit; authenticated deployed behavior remains pending. |

The scan also recorded two suppressed follow-ups. The apparent missing route-local CSRF check is covered in the production threat model by `src/proxy.ts` exact-origin protection for unsafe `/api/:path*` requests; this is not a fix if a deployment bypasses that proxy. The readiness-omission candidate remains a correctness/state-integrity follow-up: omitted availability can persist `isReady`, while downstream recommendation validation rejects missing availability, so no protected recommendation workflow bypass was demonstrated. Migration hardening now preflights four duplicate identity classes transactionally before unique-index creation. The scan and remediation verification used no production credentials or database. The Production Turso migration and code-deployment gates are now complete by separate evidence; deployed authenticated UAT remains an explicit pre-release gate.

## Production deployment evidence — 2026-08-22

Production code deployment: **Complete** at commit `13e01c559daa1fbe6b11c0d16057f7db54ae18d5`, deployment `dpl_7cDkRk38gbSNUuBQjHR36k5SgP35`, immutable URL `https://hangtime-h4fmk7skg-hangtime1.vercel.app`, and alias `https://hangtime-weld.vercel.app`. Live health returned 200 for the exact revision with security headers, and rendered sign-in had no console errors. Production smoke passed; the full authenticated deployed journey remains pending.

CI run `32586781902` and Security run `32586781895` failed before any steps because the existing account-level Actions restriction is active and billing is not enabled. Deployment workflow run `32586786167` was skipped. These remote jobs are not claimed as passed. Authenticated deployed end-to-end and Preview provisioning remain pending.

## DT-001 — Production email authentication

Problem: the production magic-link/session path is implemented in the repository, and the Production deployment/smoke boundary is now evidenced, but account-owned Resend controls and the complete authenticated live sign-in journey are not yet proven. The rendered sign-in had no console errors, but no real email was re-sent in this run. The demo switcher remains local-only and is not evidence for beta.

Acceptance criteria:

- Email magic-link sign-in and sign-out work without the demo switcher on the immutable Vercel Preview URL and the promoted Production URL.
- Tokens are single-use, short-lived, hashed at rest, and bound to the intended email.
- Session cookies are `HttpOnly`, `Secure`, `SameSite=Lax` or stricter, rotated after login, and expire.
- Unauthenticated API responses are 401; unrelated authenticated diners receive 403 for plan resources.
- Automated tests cover invalid, expired, reused, and cross-email links.
- The executable production environment check, auth unit suite, and staging browser sign-in journey pass; Resend sender/domain, rate-limit, bounce, and production-environment approval evidence are recorded without storing tokens or message bodies.

## DT-002 — Turso durable storage and precise-location protection

Problem: local SQLite is appropriate only for development and legacy conversion tooling; Vercel must use remote Turso/libSQL with protected migrations. Precise origins must remain envelope-encrypted through migration, backup, restore, and key rotation.

Production Turso migration gate: **Complete**. An authenticated Turso SQL console applied 0006 as one explicitly selected transactional batch because sensitive Vercel secrets are non-readable to the CLI. Read-only 0006 postconditions are: `m5=1`, `m6=1`, `columns=6`, `indexes=3`, and `invite_rows preserved=0`. No secret rotation, data deletion, paid feature, or Preview migration was performed. The Preview database remains empty/unprovisioned; Production code deployment is complete at commit `13e01c559daa1fbe6b11c0d16057f7db54ae18d5`, while authenticated deployed UAT remains pending. This closes the Production migration gate only, not the full backup, restore, key-rotation, Preview, or deployed-UAT ticket.

Acceptance criteria:

- Vercel Preview and Production each use a separate Turso database and scoped `TURSO_*` token; local `DATABASE_URL` is never used remotely.
- Schema changes use committed forward migrations through `pnpm db:migrate:turso`; Vercel cold starts do not bootstrap or mutate schema.
- Postal codes and coordinates are AES-256-GCM envelope-encrypted with an environment-specific keyring, never returned in participant/API payloads, and redacted from logs.
- Turso PITR/restore, retention, and key-rotation procedures are tested in an isolated deployment with recorded recovery time and key version.
- Deployments never run the destructive seed/reset commands against shared environments.
- Vercel runtime validation refuses local SQLite and refuses to start without remote Turso credentials, a valid keyring, and production email controls.
- Release gates run the location-encryption verifier, and a restore drill proves the database, retained backup, WAL/SHM export, logs, and browser payloads contain no plaintext precise origins before promotion.

## DT-003 — Three-actor single-plan browser UAT

Problem: the suite exercises seeded states, but it does not prove that Maya, Ethan, and Clara can move the same new plan from creation through confirmation.

Acceptance criteria:

- One isolated test creates one plan, accepts both invitations, records three origins/windows, marks all three ready, generates, casts three ballots, overrides with a reason, and confirms.
- Each actor has an isolated browser context/session; the test never edits the database after seeding.
- The vote cap uses `min(n - 1, floor(n / 2) + 1)` for shortlist sizes 1–8.
- The final decision record and ICS contain the chosen venue/time and override reason.

## DT-004 — Complete invitation journey

Problem: current acceptance coverage does not prove third-diner onboarding, email binding, or all unsafe-token cases.

Acceptance criteria:

- Organizer sends an invitation and the recipient follows the emitted link from a test outbox.
- Join captures required dietary rules, coarse origin, and availability before readiness.
- Missing, unknown, expired, reused, wrong-email, concurrent-use, and fourth-participant attempts fail closed without plan details.
- Invite tokens never appear in CI artifacts, analytics, referrers, caches, or server logs.
- Saved companion selections reserve seats but do not create participants until intended-account acceptance.
- Accepted participants plus live pending reservations never exceed three under creation, reissue, expiry, revocation, and concurrent acceptance.
- Organizer-safe pending-seat projections expose copy/reissue/revoke recovery without returning token hashes, separate raw token fields, participant emails, or notification preferences.
- Automated email/push delivery is not claimed until DT-011 has a durable dispatcher and receipts; manual link sharing is labeled truthfully.

## DT-005 — Readiness and recommendation validity

Status: **Source acceptance and remediation of the two sealed low findings are complete and deployed at commit `13e01c559daa1fbe6b11c0d16057f7db54ae18d5`; the Production Turso migration and smoke gates are complete, while deployed authenticated acceptance remains a pre-release gate.**

Resolved behavior: recommendation generation now requires every active participant to have a private origin, overlapping availability, an explicit dietary declaration, and deliberate ready state. Material edits atomically invalidate readiness, recommendations, candidates, and ballots; version checks prevent stale writes; concurrent duplicate generation returns the single committed run. Production smoke and the map fallback boundary pass; authenticated deployed end-to-end remains open.

Acceptance criteria:

- A participant is ready only with a valid coarse origin, availability window, and dietary declaration.
- The server rejects generation until all active participants are ready.
- Changing origin, availability, dietary rules, budget, meal type, or fairness mode increments plan version and invalidates prior recommendations/ballots.
- Duplicate generation requests are idempotent; stale results cannot replace a newer run.

## DT-006 — Accessible interactive controls

Status: **Complete in automated source scope; physical assistive-technology review remains a release UAT gate.**

Resolved behavior: the primary routes and dialogs have automated axe coverage, native/equivalent control semantics, keyboard flows, focus restoration, live status/error behavior, and narrow-viewport collision checks. This status does not substitute for physical screen-reader, forced-colors, 200% zoom, iOS, or Android evidence.

Acceptance criteria:

- All actions use native buttons/inputs or equivalent roles, names, state, and keyboard handling.
- Focus is visible; dialogs trap focus, close with Escape, and restore focus.
- Status/error messages use appropriate live regions and do not rely on color alone.
- Axe reports zero serious/critical violations on home, create, lobby, voting, confirm, profile, and join routes.
- The complete P0 flow works with keyboard only at desktop and 390px.

## DT-007 — Failure recovery

Problem: the happy-path suite does not prove behavior under slow, failed, duplicated, or stale requests.

Acceptance criteria:

- Create, invite, ready, generate, vote, confirm, acknowledgement, and feedback tests cover 400/401/403/409/429/500 and network loss where applicable.
- Loading controls cannot double-submit and always leave the busy state after failure.
- Safe input is preserved, a specific recovery action is offered, and a retry does not duplicate persisted records.
- Server errors use a stable error contract with correlation IDs but no sensitive values.

## DT-008 — Mobile action layout and installed PWA

Problem: at 390×844 the voting submit bar and global bottom navigation compete for the same lower viewport area.

Acceptance criteria:

- Only one lower action layer is sticky at a time, or safe-area spacing prevents overlap and content occlusion.
- Shortlist, map, confirm dialog, invitation, and feedback remain usable at 320, 390, and 430px with 200% text zoom.
- Installability and standalone launch pass on Android Chrome; offline navigation displays only the public offline shell.
- Automated mobile coverage runs in CI without screenshots/traces containing tokens.

## DT-009 — Plan-form intent and defaults

Problem: direct navigation silently preselects the first companion; switching to brunch retains dinner hours, which can create accidental plans.

Acceptance criteria:

- Direct `/plans/new` requires an intentional companion selection; companion deep links may preselect only the named companion.
- Meal type applies an appropriate default window unless the diner has already edited the time.
- Validation is inline, associated with its field, and preserves all entered values.
- Budget slider changes are asserted in the created lobby and API record.

## DT-010 — Live provider adapters

Problem: venue/transit recommendations are stub-backed and cannot prove current Singapore accuracy, availability, attribution, or quotas.

Acceptance criteria:

- Server-side venue search uses an approved provider; browser keys are domain-restricted and server keys never reach client bundles.
- Transit estimates use public transport and expose provider/timestamp/uncertainty.
- Dietary suitability distinguishes verified support, user-supplied claims, unknown, and incompatible.
- Provider attribution, quota exhaustion, timeouts, retries, caching rules, and fallback messaging pass staging smoke tests.
- Sponsored placement, when added, is visibly labeled and cannot bypass hard dietary constraints.

## DT-011 — Notification delivery

Current limit: profile email/push preferences and a `notification_outbox` schema table exist, and Resend is used for production magic-link authentication when configured. The current MVP does not yet prove a plan-event dispatcher, in-app notification API, confirmation/override email, reminder, bounce, or Web Push delivery. Until this ticket is complete, the in-app plan state is authoritative and a confirmation action must not be described as a delivered notification.

Acceptance criteria:

- The channel contract is explicit: in-app state is always available; transactional email is the reliable default once Resend is provisioned; Web Push is optional and only after permission; SMS/phone notifications are out of scope.
- Invitation, voting-open, confirmation/override, material-change, acknowledgement-conflict, and upcoming-meal events are idempotent and queued with bounded retries/dead-letter handling. Votes are not individually notified.
- The organizer confirmation and any override reason reach every participant only when an enabled channel has a recorded delivery receipt; otherwise the UI reports an in-app-only result and offers a safe retry/status path.
- Unsubscribe/preferences are honored, push permission denial is recoverable, and payloads omit precise origins, invite tokens, dietary notes, calendar details, and raw availability.
- Delivery metrics contain event/template/channel/status and correlation identifiers only; they never contain message bodies or personal location.
- Automated tests cover idempotency, safe payload redaction, retry/dead-letter transitions, and duplicate confirmation; manual staging evidence covers Resend delivery, bounce, unsubscribe, and at least one denied-push device.

## DT-012 — Companion lifecycle

Acceptance criteria:

- Pending, accepted, declined, blocked, removed, and favourite states have explicit UI and authorization rules.
- Both diners consent before a saved relationship is accepted.
- Removal does not delete historical plan records and blocks future preselection/invites.
- Tests cover duplicate requests, self-add, blocked users, and maximum group size.

## DT-013 — Feedback lifecycle

Acceptance criteria:

- Feedback opens only after the confirmed meal window ends, unless explicitly marked as a preview in demo mode.
- Submission is idempotent per diner/plan and can be revised only within the defined window.
- Satisfaction and reuse metrics are documented; free-text retention and deletion are defined.
- Success/failure states are accessible and covered by tests.

## DT-014 — Production security and operations

Acceptance criteria:

- Structured logs, request IDs, redaction, uptime/error alerts, and release annotations are active in staging and production.
- Rate limits protect auth, invitation, recommendation, vote, and feedback endpoints.
- A nonce/hash-based CSP and production HSTS are verified without breaking PWA registration or provider integrations.
- Actions are SHA-pinned, remote database tokens are environment-scoped, and production deployment uses a protected environment plus a narrow Vercel token.
- Incident, rollback, database recovery, secret rotation, and provider-degradation drills have named owners and evidence.

## Iteration 4 — Opaque invitation continuation contract

This is an approved design contract, not an implementation or production-evidence claim. The source and dated UAT results remain Iteration 3 until migration 0007, code deployment, and the Iteration 4 gates below are actually executed.

| Epic / ticket | Feature and story | Status | Acceptance summary |
|---|---|---|---|
| DT-015 | HT-F9.1 Start a private continuation / HT-US-901 Start sign-in without leaking my invitation | Approved; implementation pending | `POST /api/v1/invites/continuation` accepts raw token only in strict same-origin JSON, stores only a keyed random-handle hash, sets one short-lived `__Host-` HttpOnly `SameSite=Lax` cookie, returns generic `no-store` output, and rate-limits by client/email/handle. |
| DT-016 | HT-F9.2 Bind email and session / HT-US-902 Resume the intended invitation after sign-in | Approved; implementation pending | Magic-link issuance validates the cookie handle and intended email, binds only `continuation_id`, and does not consume the continuation; delivery failure and wrong-email attempts remain retryable. Successful verification atomically consumes the one-use link, claims the continuation, and transfers its invite pointer to the rotated session; the `/join/resume` page calls `GET /api/v1/invites/resume` for a safe preview; participation prioritizes the session pointer and clears it transactionally. |
| DT-017 | HT-F9.3 Preserve compatibility and recover safely / HT-US-903 Recover from scanners, races, migration, and offline state | Approved; implementation pending | Additive 0007 runs before code deployment, preserves rows, is idempotent/fail-closed, and supports code rollback. GET scanners do not consume state; replay/concurrency/capacity races succeed at most once; bounded raw-body fallback remains only for sessions without a pointer. |
| DT-018 | Iteration 4 privacy, responsive, and deployed UAT | Approved; implementation pending | Raw token is absent from sign-in/email URLs, referrers, logs, caches, and artifacts; wrong-account/stale/revoked/cross-device recovery is safe; offline and 320px/keyboard flows remain usable; deployed evidence is separated from local pass claims. |

### Iteration 4 acceptance contract

- The browser scrubs `/join/<raw-token>` from history before network navigation and sends the token only in the JSON body of the continuation endpoint. No `next` query, email URL, cookie, response, log, event, referrer, service-worker cache, or analytics field contains the raw token or opaque handle.
- Continuation, magic-link, resume, verify, and participation responses are `Cache-Control: no-store`; unsafe requests require exact same-origin `Origin`, strict JSON, bounded input, and no state-changing GET.
- One active pre-email browser continuation is permitted. Already-issued magic links independently support cross-device verification without the pre-email cookie. Missing-cookie behavior never falls back to the latest invite by email.
- Wrong-account, cross-plan, expired, revoked, superseded, reused, and stale-session cases return safe recovery without plan existence or private metadata. The intended-email/account hash and invite state are revalidated at issuance, verification, resume, and acceptance.
- Link creation binds `continuation_id` without consuming it; successful link verification atomically consumes the one-use link and claims the continuation, then rotates the session and transfers the invite pointer. Invite claim, seat capacity, and pointer clearing use atomic compare-and-set transactions. Successful acceptance clears `auth_sessions.pending_invite_id`; replay cannot create another participant or overbook the plan.
- Cleanup removes expired/consumed continuation rows and stale session pointers without deleting preserved invitation history. Rollback is code rollback with additive 0007 retained; destructive down-migration is prohibited.

### Iteration 4 execution graph

```text
I4-T0 approved contract and threat-model controls
├─ I4-T1 additive migration 0007 + schema/idempotence/rollback tests
│  └─ I4-T2 continuation, magic-link, session-pointer primitives
│     ├─ I4-T3 continuation/magic-link/resume routes
│     └─ I4-T4 participation precedence + transactional pointer clearing
├─ I4-T5 join URL scrub, mobile/offline/recovery UI
└─ I4-T6 unit/integration/browser/security/accessibility UAT matrix

I4-T1 + I4-T2 + I4-T3 + I4-T4 + I4-T5 + I4-T6
  -> isolated migration verifier -> local gates -> deployment smoke
  -> authenticated deployed journey -> retain/remove legacy fallback decision
```

### Iteration 4 synthesis and release disposition

| Classification | Decision |
|---|---|
| **ACCEPT** | Opaque random handle cookie, server-side invite binding, `continuation_id` on magic links, `pending_invite_id` on rotated sessions, authenticated token-free resume, and transactional pointer clearing. |
| **MITIGATE** | Legacy raw-body fallback, generic enumeration responses, exact-origin/JSON enforcement, one-active-continuation bounds, cleanup, no-store headers, race handling, and offline/mobile recovery. |
| **DEFER** | Remove the legacy fallback only after every supported deployment has 0007 and all maximum session/invite TTLs have elapsed. |
| **REJECT** | Raw token in `next`, sign-in/email URLs, cookies, query strings, logs, or client-generated IDs; GET consumption; email-only invite selection; and raw-body override of a session-bound invite. |

The main unresolved release risks are authenticated deployed end-to-end evidence, real email delivery, cross-device mailbox testing, and operational proof that logs/analytics/proxies do not retain the raw token. These are evidence gates, not reasons to weaken the approved controls.

## 2026-09-06 verification increment

The existing Iteration 4 implementation is present as uncommitted work; the earlier “implementation pending” rows are historical planning states, not an assertion that these files are absent. Production remains Iteration 3. Current results and defect reproductions are in [the dated UAT record](../uat/UAT_RESULTS_2026-09-06.md).

| Ticket / defect | Epic / feature / story | User story and UAT acceptance | Current disposition |
|---|---|---|---|
| DT-019 / HT-DEF-019, HT-DEF-020 | HT-E8 / HT-F8.4 / HT-US-804 | As a diner using a narrow screen or zoom, I can read and submit sign-in. At 320px the card and controls fit; zoom is unrestricted; keyboard and axe checks pass. Cases HT-TC-20260906-003/004. | Verified deployed defects; local correction and rerun required |
| DT-020 / HT-DEF-021 | HT-E8 / HT-F8.2, HT-F8.5 / HT-US-802, HT-US-805 | As an operator, I can run fixture verification without exposing credentials or modifying live data. Inherited remote canaries are removed and seeder/server/tests use only disposable local databases. Case HT-TC-20260906-009. | Highest-priority safety correction before browser fixture execution |
| DT-021 / HT-DEF-022 | HT-E8 / HT-F8.5 / HT-US-805 | As the free-tier operator, I control whether hosted runners consume quota. Missing or false runner opt-in skips every hosted job; local checks remain available; deployment needs its separate opt-in. Policy regression tests must reject a bypass. | Local workflow correction; hosted execution still blocked externally |

These increments preserve the approved architecture and additive migration boundary. They do not authorize paid hosting, billing changes, remote seed/reset, or broad production test-data mutation. Renaming one account does not satisfy multi-actor UAT.

### Next invitation-hardening increment — 2026-09-07 council synthesis

| Ticket | Story / cases | Decision and completion condition |
|---|---|---|
| DT-022 | HT-US-901 / HT-DEF-023, HT-DEF-024 | ACCEPT: reproduce and remove authenticated raw-token URL propagation and nested email return-path propagation. Keep only supported token-free navigation destinations. |
| DT-023 | HT-US-902, HT-US-903 / HT-DEF-025 | ACCEPT: recover from revoked/reissued/expired session pointers through an explicit same-origin mutation; GET remains read-only and raw request data cannot override a live pointer. |
| DT-024 | HT-US-902, HT-US-903 / HT-DEF-026 | ACCEPT: reproduce two-issued-link session rotation and preserve or safely reject the second verification without stranding a valid pending invitation. |
| DT-025 | HT-US-901, HT-US-903 / HT-DEF-027 | MITIGATE: enforce transport byte bounds before JSON parsing and prove production cookie deletion with a real cookie jar. Do not infer browser behavior solely from source. |
| DT-026 | HT-US-801, HT-US-805 | ACCEPT boundary repro: stop accepting an arbitrary Fly client-IP header on Vercel. Deployment exploitability is unverified; demonstrate trusted-ingress selection locally before claiming the rate limit fixed. |

Council compatibility concern about unbound legacy invite rows requires scope validation: intended-account binding existed in Iteration 3/0006, so a pre-0006 row does not by itself demonstrate a 0006-to-0007 regression. Retain the compatibility gate, but do not label that claim a reproduced migration defect without a supported baseline fixture.

Execution sequence: freeze recovery/return-path contracts, add failing regression scenarios, implement isolated transport and session corrections, integrate acceptance/cookie behavior, then rerun migration/unit/browser/production gates. Hosted execution, Preview, and production promotion remain separate evidence gates.

2026-09-08: DT-022 partially complete. HT-DEF-024 nested/encoded email return-path propagation is fixed locally with red-before-green captured-email regression (13/13 after final integration), targeted lint, and TypeScript checks. HT-DEF-023 authenticated raw-token join remains open; no production promotion occurred. See [September 8 evidence](../uat/UAT_RESULTS_2026-09-08.md).
