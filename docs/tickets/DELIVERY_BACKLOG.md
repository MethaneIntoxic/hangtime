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

## DT-001 — Production email authentication

Problem: the production magic-link/session path is implemented in the repository, but account-owned Resend delivery, remote deployment evidence, and the complete live sign-in journey are not provisioned. The demo switcher remains local-only and is not evidence for beta.

Acceptance criteria:

- Email magic-link sign-in and sign-out work without the demo switcher on the immutable Vercel Preview URL and the promoted Production URL.
- Tokens are single-use, short-lived, hashed at rest, and bound to the intended email.
- Session cookies are `HttpOnly`, `Secure`, `SameSite=Lax` or stricter, rotated after login, and expire.
- Unauthenticated API responses are 401; unrelated authenticated diners receive 403 for plan resources.
- Automated tests cover invalid, expired, reused, and cross-email links.
- The executable production environment check, auth unit suite, and staging browser sign-in journey pass; Resend sender/domain, rate-limit, bounce, and production-environment approval evidence are recorded without storing tokens or message bodies.

## DT-002 — Turso durable storage and precise-location protection

Problem: local SQLite is appropriate only for development and legacy conversion tooling; Vercel must use remote Turso/libSQL with protected migrations. Precise origins must remain envelope-encrypted through migration, backup, restore, and key rotation.

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

## DT-005 — Readiness and recommendation validity

Problem: recommendation generation can be presented before every participant has supplied the inputs needed for a fair result.

Acceptance criteria:

- A participant is ready only with a valid coarse origin, availability window, and dietary declaration.
- The server rejects generation until all active participants are ready.
- Changing origin, availability, dietary rules, budget, meal type, or fairness mode increments plan version and invalidates prior recommendations/ballots.
- Duplicate generation requests are idempotent; stale results cannot replace a newer run.

## DT-006 — Accessible interactive controls

Problem: audit targets include clickable containers, map pins, feedback stars, and modal choices without proven keyboard behavior.

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
