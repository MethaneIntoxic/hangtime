# Hangtime delivery backlog

Created from UAT run `UAT-2026-08-17-01` and architecture/security/UX review. Severity controls release disposition; priority controls execution order.

## Release view

| Ticket | Severity | Priority | Owner | Release gate | Summary |
|---|---:|---:|---|---|---|
| DT-001 | S1 | P0 | Backend | Public beta | Replace demo identity with production email authentication |
| DT-002 | S1 | P0 | Platform | Public beta | Durable database, migrations, backups, and encrypted precise location |
| DT-003 | S1 | P0 | QA | Beta | True three-actor, single-plan end-to-end journey |
| DT-004 | S1 | P0 | Full stack | Beta | Complete invitation acceptance and abuse cases |
| DT-005 | S1 | P0 | Backend | Beta | Enforce readiness and invalidate stale recommendations |
| DT-006 | S2 | P0 | Frontend | Beta | Keyboard semantics and automated accessibility checks |
| DT-007 | S2 | P0 | Full stack | Beta | Deterministic request failure and recovery states |
| DT-008 | S2 | P0 | Frontend | Beta | Resolve mobile sticky-action collision and installed-PWA UAT |
| DT-009 | S2 | P1 | Product | Beta | Intentional companion selection and meal-aware time defaults |
| DT-010 | S1 | P0 | Integrations | Public beta | Live Singapore venue/transit providers with provenance and quota handling |
| DT-011 | S2 | P1 | Integrations | Public beta | Email/push delivery, retries, and notification preferences |
| DT-012 | S2 | P1 | Full stack | Beta | Companion lifecycle, consent, favourites, and removal |
| DT-013 | S2 | P1 | Full stack | Beta | Post-meal feedback timing, idempotency, and reporting |
| DT-014 | S1 | P0 | Platform | Public beta | Production observability, abuse controls, CSP, and incident runbook |

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

Problem: `getCurrentUserId` only understands the development demo cookie, so production has no usable sign-in flow.

Acceptance criteria:

- Email magic-link sign-in and sign-out work without the demo switcher.
- Tokens are single-use, short-lived, hashed at rest, and bound to the intended email.
- Session cookies are `HttpOnly`, `Secure`, `SameSite=Lax` or stricter, rotated after login, and expire.
- Unauthenticated API responses are 401; unrelated authenticated diners receive 403 for plan resources.
- Automated tests cover invalid, expired, reused, and cross-email links.
- The executable production environment check, auth unit suite, and staging browser sign-in journey pass; promotion is still protected by the production environment approval.

## DT-002 — Durable storage and precise-location protection

Problem: SQLite currently writes to one process-local path and persists postal code/latitude/longitude in plaintext.

Acceptance criteria:

- Managed Postgres is the production system of record; schema changes use committed forward migrations.
- Postal codes and coordinates are envelope-encrypted with a managed key, never returned in participant/API payloads, and redacted from logs.
- Backup, restore, retention, and key-rotation procedures are tested in staging with recorded recovery time.
- Deployments never run the destructive seed/reset commands against shared environments.
- Production startup refuses SQLite and refuses to start without a current migration state.
- Production startup and release gates run the location-encryption verifier, and a restore drill proves the backup contains no plaintext precise origins before promotion.

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

Acceptance criteria:

- In-app, email, and opt-in push events are idempotent and queued with bounded retries/dead-letter handling.
- The organizer confirmation and override reason reach every participant through enabled channels.
- Unsubscribe/preferences are honored, push permission denial is recoverable, and payloads omit precise origins and invite tokens.
- Delivery metrics do not contain message bodies or personal location.

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
