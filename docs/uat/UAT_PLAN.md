# Hangtime MVP — Durable User Acceptance Specification

**Version:** 2.1
**Status:** Release-governing acceptance contract  
**Primary market:** Singapore  
**Product scope:** Installable food-and-drink planning PWA for two or three people  
**Accessibility target:** WCAG 2.2 AA  
**North-star outcome:** A returning organizer confirms another hangout within 30 days, and every participant understands why the chosen venue is practical, compatible, and fair.

## 1. Purpose and authority

This document defines the user-visible behavior Hangtime must satisfy before remote beta or production promotion. It is the durable bridge between the architecture blueprint, implementation, automated tests, manual product review, and release evidence.

The words **must**, **must not**, **required**, and **release blocker** are normative. A green build is supporting evidence, not proof by itself: each acceptance story needs evidence at the same scope as its claim. Indirect, stale, or purely static evidence does not pass a rendered or end-to-end requirement.

The current MVP recommends restaurants, cafes, and bars. The Hangtime name leaves room for later activities, but the product must not imply that non-F&B activities are supported today.

### 1.1 Current implementation and deployment boundary

The acceptance contract describes the release target; it does not turn an unexecuted integration into a pass. The current repository is a Next.js PWA using Drizzle over local SQLite for development and remote Turso/libSQL for Vercel Preview/Production. Vercel is the only supported remote hosting path for this MVP. Alternate hosted-database, container-registry, and continuously running worker paths are not part of the current deployment contract.

The current source build has a production magic-link path and a test email outbox, but the Iteration 2 working tree is not the live Production revision. Remote Turso migration, an authenticated deployed journey with account-owned Resend delivery, backup/restore, and physical-device evidence remain pre-release gates. The recommendation path currently uses a deterministic curated Singapore catalogue and synchronous generation. MapLibre/OpenFreeMap is optional and must always have a ranked-list fallback.

Notification preferences and a `notification_outbox` table are present as product seams, but a delivery worker/API for plan invitations, confirmation, reminders, and Web Push is not currently verified. The source of truth is the in-app plan state. A confirmation action must not be reported as an email or push delivery until DT-011 has direct delivery evidence. Authentication email is the only currently implemented transactional email path when Resend is configured.

## 2. Product promise and experience principles

Hangtime turns a small group’s chat-thread indecision into a trusted shared commitment:

1. Set up the people, occasion, window, budget, and fairness preference.
2. Let each participant deliberately check in with their planning area, availability, and dietary rules.
3. Compare a short, explainable set of Singapore venues.
4. Vote without selecting every option.
5. Let the organizer lock in the winner or transparently choose another option with a reason.
6. Give everyone one confirmed outing pass with time, venue, directions, booking, calendar, and attendance state.

The interface uses a **Singapore after-hours shared-pass** identity: warm paper, deep ink, chilli red, route green, sun yellow, plan stamps, neighborhood labels, and a route-line state indicator. It must feel locally grounded without imitating official LTA/MRT branding or relying on forced Singlish. The shared-pass system must continue from home through lobby, shortlist, ballot, and confirmation rather than collapsing into generic pastel cards.

## 3. Personas and authoritative fixtures

| Persona | Fixture | Primary job | Acceptance concerns |
|---|---|---|---|
| Organizer | Maya Chen, Novena/Balestier | Create quickly, compare fairly, lock in a choice | Repeat speed, budget, ties, override transparency |
| Companion | Ethan Tan, Jurong East/Clementi | Participate independently | Public-transport fairness, vote privacy, clear action state |
| Third participant | Clara Lee, Tampines/Pasir Ris | Join safely with a hard halal rule | Dietary evidence, privacy, invite safety |
| Outsider | Signed-in user not in the plan | No legitimate plan access | Every read/write/export fails closed |
| Anonymous visitor | No valid session | Sign in or open a valid invitation | No private plan enumeration or cached data |

### 3.1 Required seeded scenarios

| Fixture ID | State | Required data |
|---|---|---|
| FX-PLAN-READY | `collecting` | Maya and Ethan; one participant incomplete |
| FX-PLAN-VOTING | `voting` | Maya and Ethan; five distinct venues; Ethan has a saved ballot |
| FX-PLAN-TRIO | `voting` | Maya, Ethan, Clara; Clara has a hard halal rule |
| FX-PLAN-TIE | `voting` | At least two tied leaders |
| FX-PLAN-CONFIRMED | `confirmed` | Three participants, immutable decision, exact time, mixed acknowledgements |
| FX-INVITE-VALID | unused | Email-bound, unexpired invite for Clara |
| FX-INVITE-USED | consumed | Same plan shape, already accepted |
| FX-INVITE-EXPIRED | expired | No accepted timestamp |
| FX-INVITE-REVOKED | revoked | Email-bound reservation with a revocation timestamp |
| FX-INVITE-PENDING-PAIR | pending | Two account-bound reservations on one organizer-only plan; no companion participant rows |
| FX-OUTSIDER | unrelated | Valid production-equivalent session, no plan membership |
| FX-MAP-OUTAGE | provider failure | Style/tile requests deterministically fail |
| FX-NO-VENUES | recommendation failure | One named binding constraint produces zero candidates |

Fixture data is synthetic. Test databases must be isolated from production and deleted after the run. The local user switcher requires explicit `HANGTIME_DEMO_MODE=true` and must not render or function in production.

## 4. Acceptance method and status vocabulary

| Status | Meaning |
|---|---|
| **Automated** | A named deterministic test currently covers the complete acceptance statement. |
| **Partial** | Automation covers part of the statement; named manual evidence is still required. |
| **Manual** | Human inspection or physical/browser behavior is the authoritative evidence. |
| **Planned** | Required but not yet backed by sufficient evidence; it is not a pass. |

| Method | Required evidence |
|---|---|
| Unit/property | Test name, command, source SHA, result, relevant assertions |
| API/integration | Role, request, response/status, durable-state assertion, leakage assertion |
| Browser automation | Viewport/device, interaction trace, DOM/network assertions, screenshot where visual behavior matters |
| Manual visual | Fresh screenshot/video, viewport, criterion-level notes, tester, date, build SHA |
| Physical PWA | Device/OS/browser, install/launch behavior, connectivity state, screenshot/video |
| Security/privacy | Canary values, database/log/cache/network scan, negative authorization evidence |
| Provider | Fixture test plus separately labeled live smoke test; live provider availability is never assumed from fixture success |

### 4.1 Story priority and release policy

Priority is attached to the stable story ID so that a release report can distinguish a core safety/journey blocker from a follow-up improvement. P0 stories are beta/release blockers unless the exit criteria explicitly records a time-bounded exception. P1 stories are important product quality or retention work and require an owner and target date before beta. The implementation status in the coverage line remains authoritative; priority never changes `Planned` into `Pass`.

| Priority | Story IDs | Meaning |
|---|---|---|
| **P0** | HT-US-101, HT-US-201, HT-US-202, HT-US-203, HT-US-301, HT-US-302, HT-US-401, HT-US-402, HT-US-501, HT-US-502, HT-US-503, HT-US-601, HT-US-602, HT-US-701, HT-US-702, HT-US-801, HT-US-802, HT-US-803, HT-US-804, HT-US-805 | Core planning, privacy, authorization, integrity, confirmation, and recovery contract. Direct evidence required for beta. |
| **P1** | HT-US-102, HT-US-703, HT-US-806 | Shared-pass visual continuity, post-meal retention, and honest notification boundaries. Must be dispositioned before wider tester rollout. |

## 5. Epic HT-E1 — Identity, dashboard, and task entry

### Feature HT-F1.1 — Action-first returning home

#### Story HT-US-101 — Prioritize what needs me

**As a** returning participant, **I want** plans requiring my readiness, ballot, or acknowledgement shown before passive plans, **so that** I know what to do next without scanning every plan.

**Acceptance**

- **Given** the account has plans in collecting, voting, and confirmed states, **when** home loads, **then** actionable plans are ordered before waiting/complete plans and each row exposes one state-appropriate primary action.
- **Given** a plan changes state while home is open, **when** data is refreshed, **then** its label and action change without stale private data or a duplicate row.
- **Given** loading fails, **when** requests settle, **then** an error and retry action replace the loading state; the page must not falsely show an empty account.

**Edge cases:** no plans; several plans need action; long occasion/companion names; today/tomorrow dates; cancelled plan; no favorite companion.  
**Coverage:** Partial — `tests/e2e/full-journey.spec.ts` covers branded home and active plans; action ordering and failed-load distinction require tests.

### Feature HT-F1.2 — Shared-pass brand continuity

#### Story HT-US-102 — Recognize one product throughout

**As a** participant, **I want** the same shared-pass visual language across the journey, **so that** each state feels like progress in one plan rather than a different template.

**Acceptance**

- **Given** home, create, lobby, ballot, map, and confirmation screenshots at the same viewport, **when** reviewed together, **then** they share the route-line state model, typography, color roles, plan identity, and control language.
- **Given** a 390px viewport and a 1440px viewport, **when** those screens render, **then** hierarchy remains clear without tiny essential labels, decorative clutter, or excessive empty space.
- The product must not use official MRT roundels, line maps, or colors in a way that implies LTA affiliation.

**Edge cases:** first-time versus returning home; high zoom; missing avatar; long neighborhood names; dark/forced-color user settings.  
**Coverage:** Manual — fresh criterion-level screenshots required for every release candidate with material UI changes.

## 6. Epic HT-E2 — Profile, companions, and safe plan creation

### Feature HT-F2.1 — Reusable profile and companion defaults

#### Story HT-US-201 — Maintain reusable preferences

**As a** participant, **I want** to save my display name, general planning area, dietary rules with severity, cuisine weights, and notification choices, **so that** repeat planning is fast and safe.

**Acceptance**

- **Given** valid changes, **when** saved, **then** they persist after navigation and a new session.
- **Given** an invalid location reference, dietary severity, or oversized note, **when** submitted, **then** the exact field is identified and no partial unsafe update occurs.
- Profile and companion responses must never contain encrypted envelopes, postal codes, latitude, or longitude.

**Edge cases:** no preferences; several hard rules; duplicate rule; account deletion; stale edit in two tabs.  
**Coverage:** Partial — `tests/e2e/full-journey.spec.ts` covers profile UI; privacy and concurrent update cases require more coverage.

#### Story HT-US-202 — Choose companions deliberately

**As an** organizer, **I want** to choose one or two saved companions explicitly, **so that** I do not invite the wrong person by accepting a hidden default.

**Acceptance**

- **Given** the create page is opened normally, **when** companions load, **then** no person is silently committed without an explicit selected state.
- **Given** a trusted deep link names a companion, **when** the form opens, **then** that preselection is visible, removable, and counted.
- **Given** two companions are selected, **when** another is attempted, **then** the three-person total limit is explained before mutation.

**Edge cases:** empty list; removed relationship; duplicate companion; self-selection; list request failure.  
**Coverage:** Partial — journey tests cover selection and companion creation; default and stale-relationship behavior require tests.

### Feature HT-F2.2 — Occasion, date, budget, and fairness

#### Story HT-US-203 — Create a valid food-and-drink hangout

**As an** organizer, **I want** to propose an occasion, future date, time window, group budget, alcohol mode, and fairness priority, **so that** recommendations reflect the group’s real constraints.

**Acceptance**

- **Given** one or two companions and valid inputs, **when** creation succeeds, **then** exactly one plan opens in `collecting` with Singapore timezone and preserved values.
- **Given** a past/invalid date, end not after start, no companion, or budget outside S$40–S$400, **when** submitted, **then** the relevant field is identified, safe input remains, and no plan is created.
- **Given** group size or total budget changes, **when** per-person guidance updates, **then** arithmetic is consistent and the group total remains authoritative.
- Fairness choices behave as a labeled radio group for keyboard, pointer, touch, and assistive technology.

**Edge cases:** Singapore date differs from device UTC date; double-click; slow response; 23:45 window; exact min/max budget; alcohol with hard dietary rule.  
**Coverage:** Partial — `tests/e2e/adversarial-user-flows.spec.ts`, `tests/e2e/full-journey.spec.ts`, and budget unit tests cover core validation; timezone and complete input semantics remain manual/planned.

## 7. Epic HT-E3 — Invitation and deliberate readiness

### Feature HT-F3.1 — Safe invite lifecycle

#### Story HT-US-301 — Join the intended plan once

**As an** invited participant, **I want** to understand the proposal before accepting, **so that** I join intentionally and safely.

**Acceptance**

- **Given** one or two accepted saved companions are selected at plan creation, **when** the transaction commits, **then** each selection is a live account/email-bound seat reservation, only the organizer is an active participant, and accepted plus live reserved seats do not exceed three.
- **Given** an unexpired account/email-bound invite and matching signed-in account, **when** opened, **then** organizer, food/drink occasion, date, and window are visible without revealing existing participant data.
- **Given** the invite preview is valid, **when** the invite is accepted, **then** one participant record is created, the reservation is atomically consumed by that user, and reuse fails.
- **Given** an organizer views the lobby, **when** reservations are pending, **then** `People & seats` distinguishes invited from joined people and permits explicit copy/reissue/revoke actions without claiming email delivery.
- **Given** two distinct valid invitations contend for the last seat, **when** acceptance is concurrent, **then** exactly one reservation becomes one participant and the other fails deterministically without a fourth member or private plan data.
- **Given** an invite is missing, unknown, expired, revoked, wrong-account/email, cross-plan, reused, superseded, closed, or would exceed capacity, **when** it is opened or submitted, **then** it fails with safe recovery copy and without revealing whether a private plan exists.
- **Given** a manual share link is requested, **when** the response is inspected, **then** it is `no-store`, includes only one invite URL (no separate token field), and no token appears in events, participant projections, analytics, caches, or test artifacts.

**Edge cases:** revoke/accept and reissue/accept races; existing member opens invite; clipboard denied; email casing; sign-in return path; link scanner opens URL before recipient; expired reservations freeing capacity.
**Coverage:** Partial — current tests cover the legacy core lifecycle and one same-token race; pending reservations, revocation/reissue, two-token contention, safe projections, and rendered recovery states are Iteration 3 targets. Link-scanner behavior remains planned.

### Feature HT-F3.2 — Participant check-in

#### Story HT-US-302 — Become ready deliberately

**As a** participant, **I want** to review location, availability, and dietary state before declaring readiness, **so that** the shortlist is based on inputs I consciously confirmed.

**Acceptance**

- **Given** a participant enters the lobby, **when** any required input is missing, **then** the checklist identifies the missing category without exposing private values to others.
- **Given** a participant changes a planning area, **when** readiness is evaluated, **then** the change does not silently stand in for confirming availability and dietary details.
- **Given** all required inputs are reviewed, **when** the participant chooses `Ready`, **then** the organizer sees their ready state and only their coarse area.
- **Given** date, window, origin, budget, or a hard dietary rule changes after readiness or recommendation, **then** affected readiness, recommendation run, and ballots are invalidated with an explanation.

**Edge cases:** participant removes location; calendar connection fails; strict rule added after voting; two tabs change readiness; organizer is the incomplete participant.  
**Coverage:** Automated in source — `tests/unit/readiness-invalidation.test.ts`, `tests/unit/plan-mutations.test.ts`, `tests/e2e/readiness-ui.spec.ts`, and `tests/e2e/api-acceptance.spec.ts` cover required evidence, deliberate readiness, invalidation, and stale-write rejection. Remote Turso migration and the deployed authenticated journey remain run-level pre-release evidence gates.

## 8. Epic HT-E4 — Explainable Singapore shortlist

### Feature HT-F4.1 — Reliable recommendation run

#### Story HT-US-401 — Generate once and recover safely

**As an** organizer, **I want** one observable recommendation run, **so that** I can trust progress and recover without duplicate results.

**Acceptance**

- **Given** two or three ready participants, **when** generation begins, **then** duplicate submission is disabled and progress is announced as status, not only animation.
- **Given** generation completes, **when** the run is committed, **then** the frozen run contains distinct candidates and the plan enters voting once.
- **Given** timeout/provider/error/no-results occurs, **when** the request settles, **then** loading ends, all plan inputs remain, the binding problem is named where known, and retry is safe/idempotent.

**Edge cases:** request succeeds after client timeout; provider quota; fewer venues than configured; zero viable venues; stale plan version; organizer refreshes mid-run.  
**Coverage:** Partial — `tests/unit/plan-mutations.test.ts` and `tests/e2e/api-acceptance.spec.ts` cover one committed run under concurrent requests, version conflicts, stale-state rejection, success, and no-results behavior. Provider timeout and durable asynchronous recovery remain planned.

### Feature HT-F4.2 — Fairness, dietary, budget, and provenance

#### Story HT-US-402 — Understand why each place fits

**As a** participant, **I want** the shortlist to explain travel, budget, dietary fit, and evidence quality, **so that** I can make a meaningful choice.

**Acceptance**

- **Given** a candidate is shown in the shortlist, **when** a participant performs the first scan, **then** group price range, price tier, coarse area, average or per-person travel, journey imbalance, and a plain-language reason are visible.
- **Given** a participant expands evidence, **when** the travel and suitability details render, **then** each participant’s coarse origin label and duration are shown without coordinates or postal code.
- **Given** a group budget is configured, **when** a candidate estimate is calculated, **then** the configured 10% service charge and 9% GST are included and the UI distinguishes estimates from live menu prices.
- **Given** an allergy or hard dietary restriction has unknown or incompatible evidence, **when** candidates are filtered, **then** that venue is excluded; preference-level uncertainty may remain only with a visible caution.
- **Given** rating, price, opening, dietary, or booking data is displayed, **when** a participant inspects the candidate, **then** source/verification confidence is exposed and a booking link is not represented as live availability.

**Edge cases:** one journey is disproportionate despite a good average; tie score; stale venue record; absent booking URL; GST/service configuration changes; no safe venue.  
**Coverage:** Partial — dietary, transit, and budget unit suites cover domain behavior; provenance, visual hierarchy, and representative-scenario human review remain manual.

## 9. Epic HT-E5 — Open map, comparison, and ballot integrity

### Feature HT-F5.1 — Privacy-preserving optional map

#### Story HT-US-501 — Compare candidates on a map without exposing origins

**As a** participant, **I want** to inspect public candidate locations geographically, **so that** neighborhood context helps without revealing where anyone lives.

**Acceptance**

- **Given** a participant requests map view, **when** MapLibre starts, **then** it receives only public candidate coordinates and does not load before that request.
- **Given** a participant origin or private planning input exists, **when** map/style/tile/marker/GeoJSON/outbound/console/analytics/cache/browser traffic is inspected, **then** no coordinate, postal code, private midpoint, or private origin label is present.
- **Given** the map is visible, **when** the participant reviews attribution, **then** OpenFreeMap/OpenMapTiles/OpenStreetMap attribution remains present and readable.
- **Given** the shortlist has a canonical rank order, **when** markers and the choice tray render, **then** they match that order and each selection is keyboard-operable with an accessible name/state.
- **Given** a participant switches list → map → list, **when** the map succeeds or a tile/WebGL failure occurs, **then** ballot state is preserved and an accessible ranked-list fallback keeps voting and confirmation available.
- **Given** the map is not the active view, **when** service-worker and network traffic are inspected, **then** cross-origin tiles are not prefetched, bulk-downloaded, or cached.

**Edge cases:** CSP denial; style loads but tiles fail; WebGL unavailable; zero/one candidate; overlapping markers; keyboard zoom; reduced motion; offline installed PWA.  
**Coverage:** Partial — `tests/unit/open-map.test.ts`, `scripts/check-maps.mjs`, browser list/map tests, and `tests/e2e/accessibility.spec.ts` cover static policy, core parity, primary keyboard controls, and fallback accessibility. Outbound request canaries, complete marker-order evidence, attribution screenshots, and deployed outage behavior still require full evidence.

### Feature HT-F5.2 — Formula-capped, independent voting

#### Story HT-US-502 — Choose some but not every venue

**As a** participant, **I want** a bounded multi-select ballot, **so that** my preferences carry information without forcing one choice.

**Acceptance**

- **Given** a frozen shortlist has `n >= 2` viable candidates, **when** the ballot opens, **then** `maxSelections = min(n - 1, floor(n / 2) + 1)` is applied by both UI and server.
- **Given** shortlist sizes 2 through 8, **when** the cap is calculated, **then** the canonical results are `2 → 1`, `3 → 2`, `4 → 3`, `5 → 3`, `6 → 4`, `7 → 4`, and `8 → 5`.
- **Given** exactly one viable venue remains, **when** recommendations complete, **then** the plan bypasses a ballot and enters organizer confirmation.
- **Given** a participant submits a ballot, **when** it has no selection or exceeds the cap, **then** the UI prevents the action and the server rejects it without changing the durable ballot.
- **Given** a participant switches between list and map, **when** the ballot is rendered, **then** selection count/cap and selected state remain identical and are exposed to keyboard and assistive technology.

**Edge cases:** zero candidates; duplicates; stale frozen run; candidate removed; two-tab edits; network retry; exact cap.  
**Coverage:** Automated for formula/server cap — `tests/unit/voting-rules.test.ts` and `tests/e2e/adversarial-user-flows.spec.ts`; full keyboard/map parity remains partial.

#### Story HT-US-503 — Save, revise, and avoid vote bias

**As a** participant, **I want** my ballot saved atomically and other results revealed at the appropriate time, **so that** I can revise safely without being anchored by earlier voters.

**Acceptance**

- **Given** a participant has a saved ballot and changes selections before confirmation, **when** the revision succeeds, **then** it atomically replaces the previous ballot.
- **Given** a participant toggles a selection locally, **when** the change has not been submitted, **then** the UI distinguishes unsaved local changes from the durable ballot.
- **Given** a participant has not submitted their first ballot, **when** the voting surface renders, **then** other people’s candidate counts/leaders are hidden; the chosen post-submission reveal policy is consistent and tested.
- **Given** a request uses a stale run/version or arrives after confirmation, **when** the server validates it, **then** it fails without changing the durable decision.

**Edge cases:** two tabs submit; organizer confirms during request; all candidates tie; no ballots; last voter disconnects.  
**Coverage:** Partial — current browser/unit tests cover save, cap, and tally; unbiased reveal policy and concurrency remain planned.

## 10. Epic HT-E6 — Transparent organizer decision

### Feature HT-F6.1 — Winner, tie, and incomplete ballot handling

#### Story HT-US-601 — Lock in a defensible choice

**As an** organizer, **I want** to see voting completeness and leaders before confirming, **so that** I do not accidentally ignore someone.

**Acceptance**

- **Given** voting is open, **when** the organizer opens confirmation, **then** the surface shows ballots received versus eligible participants and all tied leaders.
- **Given** one or more eligible participants have not voted, **when** the organizer confirms, **then** a clear warning and explicit acknowledgement are required and the event records incomplete voting.
- **Given** the organizer chooses an exact start time, **when** the UI and server validate it, **then** it must be inside the agreed window.
- **Given** concurrent or repeated confirmation requests arrive, **when** they commit, **then** exactly one immutable decision is produced.

**Edge cases:** no ballots; one of three missing; tie; participant removed; plan version conflict; venue becomes unavailable.  
**Coverage:** Partial — tally/state tests and full journey cover ordinary confirmation; incomplete-vote and concurrency behavior require tests.

#### Story HT-US-602 — Choose a different option transparently

**As an** organizer, **I want** to choose a non-leading compatible venue with a visible reason, **so that** practical realities can override the tally without hiding the decision.

**Acceptance**

- **Given** the organizer selects a non-leading venue, **when** the decision control renders, **then** it is labeled `Choose a different option`, not `veto`.
- **Given** the selected candidate is leading, **when** the organizer confirms, **then** no override reason is required; given it is non-leading, a 10–240 character trimmed reason is required.
- **Given** a valid override reason is submitted, **when** the decision commits, **then** the plain-text reason appears in the immutable decision record and participant-safe confirmation state; notification visibility is conditional on DT-011 delivery evidence.
- **Given** an override reason contains markup or private details, **when** it is rendered or logged, **then** HTML cannot execute and precise location/dietary details are not exposed.

**Edge cases:** whitespace-only; 9/10/240/241 characters; tie leader; offensive/private text; notification delivery failure after commit.  
**Coverage:** Partial — voting unit tests cover reason validation and browser journey covers confirmation; output-safety and notification evidence require tests.

## 11. Epic HT-E7 — Confirmed outing, attendance, and repeat use

### Feature HT-F7.1 — One shared outing pass

#### Story HT-US-701 — Use the confirmed plan

**As a** participant, **I want** a compact confirmed outing pass, **so that** I can act without reopening the planning discussion.

**Acceptance**

- **Given** a plan is confirmed, **when** a participant opens the outing pass, **then** venue, exact time/date, address, public area, participant names/status, winner/override record, directions, booking/menu action, and calendar export are available.
- **Given** a participant activates an external link, **when** the destination is validated, **then** it uses an allowlisted HTTPS host and safe new-tab behavior.
- **Given** a participant downloads ICS, **when** the file is generated, **then** it contains Asia/Singapore timezone, stable UID, escaped address, exact time, and no private origin.
- **Given** booking or map destination data is missing or unavailable, **when** the pass renders, **then** it provides a truthful fallback without an empty or broken primary action.

**Edge cases:** Unicode/comma address; absent URL; link provider down; calendar blocked; changed/cancelled plan; duplicate download.  
**Coverage:** Partial — ICS unit and full-journey browser tests cover core behavior; allowlist/failure presentation remains planned.

#### Story HT-US-702 — Acknowledge attendance and flag conflict

**As a** participant, **I want** to acknowledge or flag a conflict, **so that** the group knows whether the confirmed plan still works.

**Acceptance**

- **Given** a participant has not responded, has accepted, or has a conflict, **when** the pass renders, **then** pending, attending, and conflict are labeled with text/icons and not color alone.
- **Given** a participant repeats or changes an acknowledgement, **when** the request is authorized, **then** the repeat is idempotent and the new state is immediately visible.
- **Given** a participant flags a conflict, **when** DT-011 delivery is available, **then** the organizer receives a safe notification; otherwise the in-app plan state remains authoritative without exposing hidden location or dietary data.

**Edge cases:** offline mutation; two-tab update; outsider request; conflict after calendar export.  
**Coverage:** Partial — ordinary acknowledgement is in full-journey automation; concurrency, notification, and offline cases are planned.

### Feature HT-F7.2 — Feedback after the event

#### Story HT-US-703 — Learn only after the hangout

**As a** participant, **I want** a short post-event survey at the right time, **so that** I can improve future recommendations without premature prompts.

**Acceptance**

- **Given** a plan has a confirmed event time, **when** that time has passed in `Asia/Singapore`, **then** feedback is offered; before then it is withheld except for an explicitly labeled demo preview.
- **Given** the survey is open, **when** a participant submits, **then** satisfaction and reuse intent are required while notes remain optional and length-limited.
- **Given** a participant has already responded, **when** the same request is retried, **then** one durable response is retained, success is acknowledged, and no duplicate is created.
- **Given** feedback is submitted, **when** the success state renders, **then** starting another plan with the same group is one clear action.

**Edge cases:** early request; cancelled event; duplicate submit; device timezone differs; plan never marked completed.  
**Coverage:** Partial — current browser journey covers survey UI; temporal gate/idempotency and repeat-plan action remain planned.

## 12. Epic HT-E8 — Privacy, authentication, PWA, accessibility, and resilience

### Feature HT-F8.1 — Production identity and authorization

#### Story HT-US-801 — Access only my plans

**As a** participant, **I want** production-grade email authentication and strict membership checks, **so that** another person cannot enter or mutate my plan.

**Acceptance**

- **Given** a user requests or consumes a magic link/code, **when** auth state is persisted and verified, **then** the token is hashed, expiring, one-use, origin-bound, and rate-limited, and the session is opaque, revocable, secure, HttpOnly, and appropriately SameSite.
- **Given** an organizer-only mutation is requested, **when** the server authorizes it, **then** organizer membership is enforced server-side.
- **Given** an outsider or anonymous visitor requests plan read, participation, invite creation, ballot, confirmation, acknowledgement, feedback, or ICS, **when** authorization runs, **then** an indistinguishable 403/404-safe response is returned without private data.
- **Given** the runtime is production-equivalent, **when** identity controls initialize, **then** the demo identity switcher and demo sessions are rejected.

**Edge cases:** replay; token tamper; external return URL; cross-origin mutation; revoked session; email case normalization; rate-limit race.  
**Coverage:** Automated for core controls — `tests/unit/production-auth.test.ts`, auth security tests, and adversarial browser tests; live email delivery remains external/manual.

### Feature HT-F8.2 — No plaintext precise origins

#### Story HT-US-802 — Keep exact origins private everywhere

**As a** participant, **I want** precise origin data encrypted and absent from ordinary product surfaces, **so that** convenience does not expose where I live.

**Acceptance**

- **Given** a precise origin is saved, **when** it crosses the persistence boundary, **then** authenticated encryption with key versioning and record-bound associated data is applied before storage.
- **Given** a production-equivalent database or artifact is inspected, **when** database bytes, WAL/SHM, backups, browser payloads, logs, analytics, URLs, email, push, events, caches, and map requests are scanned, **then** no plaintext postal or coordinate canary is present.
- **Given** a participant views a plan, **when** coarse labels render or recommendations execute, **then** only coarse labels are visible and decryption occurs inside an authorized server-side recommendation boundary without logging.
- **Given** a wrong key, modified ciphertext/tag/nonce/AAD, or copied envelope is supplied, **when** decryption runs, **then** it fails closed.
- **Given** a backup is restored or a key is rotated, **when** evidence is collected, **then** every retained backup has its required key available separately and passes integrity/canary checks.

**Edge cases:** legacy migration; old plaintext snapshot; wrong/retired key; interrupted rotation; app crash during write; account/plan deletion.  
**Coverage:** Partial — location crypto/migration/environment unit suites exist; release requires the database/WAL/backups/browser/log canary verifier against the deployed environment.

### Feature HT-F8.3 — Public-only PWA behavior

#### Story HT-US-803 — Install without caching private plans

**As a** participant, **I want** an installable app that fails safely offline, **so that** private planning data is not retained in a shared browser cache.

**Acceptance**

- **Given** the app is built for production, **when** manifest, icons, standalone metadata, and service-worker registration are inspected, **then** the install contract is valid.
- **Given** the service worker installs, **when** its precache is inspected, **then** only the public offline shell, manifest, and approved static icons are present.
- **Given** a request targets `/api`, `/plans`, `/join`, authenticated HTML, query-bearing/tokenized URLs, map tiles, or provider responses, **when** cache policy runs, **then** it is network-only and absent from Cache Storage.
- **Given** a user logs out and opens a private route offline, **when** the worker serves a response, **then** user-scoped state is removed and only the neutral public shell appears without names, plan IDs, dates, venues, tokens, or origins.

**Edge cases:** worker upgrade; unrelated cache; offline first launch; installed PWA; failed update; multiple accounts in one browser.  
**Coverage:** Automated for Chromium production policy — `tests/e2e-production/pwa-security.spec.ts` and `scripts/check-pwa.mjs`; physical iOS/Android install remains manual.

### Feature HT-F8.4 — Accessible and responsive primary journey

#### Story HT-US-804 — Complete the journey with different access needs

**As a** keyboard, screen-reader, low-vision, reduced-motion, or mobile user, **I want** every primary action to remain perceivable and operable, **so that** I can participate independently.

**Acceptance**

- **Given** a user navigates create, readiness, shortlist/map, ballot, confirmation, or acknowledgement, **when** they use only a keyboard, **then** every primary action is operable with visible focus and logical order.
- **Given** a dialog opens, **when** focus enters or the user presses Escape where safe, **then** focus is trapped appropriately, the title/description is labelled, and focus returns to the trigger on close.
- **Given** controls render, **when** accessibility semantics are inspected, **then** names/state and native or equivalent radio/selection semantics exist and touch targets are at least 44×44 CSS px.
- **Given** loading, error, saved, success, or progress state changes, **when** assistive technology observes the page, **then** live-region politeness and `aria-busy`/status are appropriate and no required information depends only on color, icon, motion, hover, or map geography.
- **Given** reduced motion, 390px/1440px viewports, 200% zoom, or large text is active, **when** the primary journey renders, **then** nonessential motion is disabled and there is no horizontal overflow, clipping, sticky-action collision, obscured field, or unreachable control.

**Edge cases:** 320px fallback; mobile virtual keyboard; forced colors; long names; map unavailable; screen-reader browse/forms mode.  
**Coverage:** Partial — mobile overflow and core browser journey are automated; axe, full keyboard, screen-reader, forced-colors, zoom, and physical-device checks require fresh evidence.

### Feature HT-F8.5 — Recover from operational failures

#### Story HT-US-805 — Fail without losing trust

**As a** participant, **I want** failed loads and mutations to stop cleanly and preserve safe work, **so that** I know whether to retry.

**Acceptance**

- **Given** load, create, recommendation, vote, or confirmation fails, **when** the request settles, **then** loading ends, the UI explains what did not happen, safe input is preserved, and retry or navigation is offered.
- **Given** an idempotent action is retried after timeout or lost response, **when** the server receives the retry, **then** it cannot duplicate plans, runs, ballots, decisions, notifications, or feedback.
- **Given** a provider, map, calendar, or push integration fails, **when** the user continues, **then** a documented fallback remains available and privacy or hard dietary constraints are never weakened.

**Edge cases:** response lost after commit; 409 version conflict; 429; provider partial data; offline transition; server restart.  
**Coverage:** Partial — retryable plan-form failure exists in adversarial browser tests; full mutation/idempotency matrix is planned.

### Feature HT-F8.6 — Honest notification boundary

#### Story HT-US-806 — Know when Hangtime has notified me

**As a** participant, **I want** Hangtime to distinguish a durable in-app update from an actually delivered message, **so that** I do not miss a confirmed plan because a notification channel was only configured in the UI.

**Acceptance**

- **Given** the current MVP without a verified notification worker, **when** a plan is created, changed, voted on, or confirmed, **then** the in-app plan state is the authoritative result and no UI, test report, or release note claims that email or push was delivered.
- **Given** Resend is configured in a production-equivalent environment, **when** a magic-link sign-in is requested, **then** only the authentication email path is counted as implemented delivery; test-outbox delivery is never production evidence.
- **Given** a participant changes email or push preferences, **when** the profile is saved, **then** the preference is persisted, push permission is not implied, and denial or unavailable delivery leaves the plan usable in-app.
- **Given** DT-011 is implemented, **when** an invitation, confirmation/override, conflict, or reminder is delivered, **then** the event has an idempotency key, safe payload, bounded retry/dead-letter result, and a directly captured receipt for each enabled channel. No precise origin, invite token, dietary note, or calendar detail is sent.

**Edge cases:** Resend unavailable; test outbox selected in production; push permission denied; duplicate confirmation; delivery succeeds after a client timeout; unsubscribe between enqueue and send; notification body contains an override reason; offline recipient.
**Coverage:** Planned — current profile preference persistence and auth-email unit coverage do not prove plan-event delivery; manual delivery, bounce, unsubscribe, and physical-notification evidence remain external gates tracked by DT-011.

## 13. Guided end-to-end acceptance journeys

### Journey J1 — Returning couple plans brunch

1. Maya opens home and sees the existing ballot/readiness action before passive plans.
2. She starts a new brunch with Ethan, a future date, two-hour window, S$120 group budget, alcohol excluded, and fairest journeys.
3. Both deliberately review check-in requirements and become ready.
4. Maya generates recommendations and compares fairness, dietary evidence, budget, and provenance.
5. Maya uses shortlist and map, selects the formula maximum, and saves.
6. Ethan submits a different overlapping ballot without seeing leader anchoring before his first submission.
7. Maya sees completion, confirms the leader and an exact in-window time.
8. Both inspect the outing pass, calendar, directions, booking, and attendance state.

**Pass outcome:** one immutable confirmed plan; ballot state is preserved; no precise origin appears anywhere; every decision is understandable.

### Journey J2 — Trio with a hard dietary rule and transparent override

1. Maya creates a three-person dinner and Clara accepts an email-bound invite once.
2. Clara confirms halal as hard and deliberately becomes ready.
3. All generated venues satisfy the hard rule; unknown or incompatible candidates are absent.
4. Participants cast ballots producing a tie or non-leading practical alternative.
5. Maya chooses a different compatible option, writes a 10–240-character reason, and confirms.

**Pass outcome:** dietary safety behavior is fail-closed; the reason is required, immutable, visible, and safely rendered.

### Journey J3 — Unsafe access, provider outage, and offline PWA

1. Outsider and anonymous sessions attempt every protected plan read/write/export.
2. Unknown, expired, wrong-email, reused, and concurrent-final-seat invites are exercised.
3. Recommendation and map providers fail deterministically.
4. A ballot request loses its response after commit and is retried.
5. The installed PWA navigates offline to a private URL.

**Pass outcome:** access fails closed, retries do not duplicate state, list voting remains usable without the map, and the offline shell contains no plan data.

## 14. Traceability matrix

The matrix separates evidence that exists in the repository from evidence that must be captured by a human or added to automation. A named test is not a claim that the latest run passed; the run record in Section 15 supplies the date, SHA, environment, and result.

| Product rule | Stories | Automated evidence currently in repository | Manual evidence required | Planned gap / owner |
|---|---|---|---|---|
| Two or three participants and deliberate companion selection | HT-US-202, HT-US-203, HT-US-301 | `tests/e2e/adversarial-user-flows.spec.ts`; `tests/e2e/full-journey.spec.ts`; `tests/unit/auth-security.test.ts` | Three independent sessions creating one plan; direct `/plans/new` intent and stale relationship review | Concurrent capacity and complete three-actor journey — DT-003/DT-009 |
| Production identity and authorization | HT-US-301, HT-US-801 | `tests/unit/production-auth.test.ts`; `tests/unit/auth-security.test.ts`; adversarial outsider browser flow | Real Resend sign-in, expiry/replay, revoked session, and account-owned Vercel evidence | Live email delivery and remote deployment — DT-001/DT-014 |
| Profile, companion, dietary, and preference privacy | HT-US-201, HT-US-202, HT-US-302, HT-US-806 | Profile/companion journey coverage; `tests/unit/dietary-rules.test.ts`; location field redaction in `tests/unit/auth-security.test.ts` | Screen review of deliberate selection, consent/removal, privacy copy, and persisted preferences | Concurrent edits, full companion lifecycle, and notification preference semantics — DT-012/DT-011 |
| General-area privacy and encrypted precise origins | HT-US-302, HT-US-402, HT-US-501, HT-US-802 | `tests/unit/location-encryption.test.ts`; `tests/unit/location-migration.test.ts`; `tests/unit/readiness-invalidation.test.ts`; `tests/unit/open-map.test.ts`; disposable `pnpm verify:location-encryption` pass over 8 encrypted rows | Deployed Turso database/dump, backups, browser/network/log canary scan and key-rotation/restore drill | Remote migration, account-owned backup/restore, and external evidence — DT-002/DT-014 |
| Scheduling, timezone, and availability | HT-US-203, HT-US-302, HT-US-601 | `tests/unit/state-machine.test.ts`; `tests/unit/readiness-invalidation.test.ts`; `tests/e2e/readiness-ui.spec.ts`; plan validation in `tests/e2e/adversarial-user-flows.spec.ts` | Asia/Singapore boundary around midnight, calendar denial/fallback, and two-tab review | Calendar OAuth/free/busy and deployed authenticated evidence — external/manual gate |
| Public-transport fairness | HT-US-203, HT-US-402 | `tests/unit/transit-scorer.test.ts` | At least 20 representative east/west/north/central Singapore scenarios with explanation review | Authoritative OneMap credentials, accuracy, quotas, and live smoke — DT-010 |
| Budget, GST/service charge, alcohol, and evidence confidence | HT-US-203, HT-US-402 | `tests/unit/budget-calculator.test.ts`; recommendation scorer fixtures | Rendered candidate evidence, assumptions, stale price/opening data, and no-result recovery | Versioned provider data and live venue provenance — DT-010 |
| Hard dietary exclusion | HT-US-302, HT-US-402 | `tests/unit/dietary-rules.test.ts`; trio flow in `tests/e2e/adversarial-user-flows.spec.ts` | Clara-style hard-halal scenario; unknown/allergy evidence copy and explicit fallback | Provider verification and full no-safe-venue journey — DT-010 |
| Reliable recommendations and map fallback | HT-US-401, HT-US-402, HT-US-501 | `tests/unit/plan-mutations.test.ts`; `tests/unit/open-map.test.ts`; `scripts/check-maps.mjs`; `tests/e2e/api-acceptance.spec.ts`; `tests/e2e/full-journey.spec.ts` shortlist/map path | Attribution screenshot, staged provider timeout/retry, and deployed outage behavior | Durable async run, live provider health, outbound canaries — DT-007/DT-010 |
| Formula-capped, independent voting | HT-US-502, HT-US-503 | `tests/unit/voting-rules.test.ts`; `tests/unit/plan-mutations.test.ts`; ballot abuse/cap and keyboard tests in `tests/e2e/adversarial-user-flows.spec.ts` and `tests/e2e/accessibility.spec.ts` | Unbiased first ballot and three-independent-session review | Complete actor coverage — DT-003; physical UAT — DT-008 |
| Tie, incomplete voting, and transparent organizer override | HT-US-601, HT-US-602 | `tests/unit/voting-rules.test.ts`; confirmation journey in `tests/e2e/full-journey.spec.ts` | Tie/incomplete warning, 10/240 boundaries, safe reason rendering and participant-visible decision | Concurrent/double confirmation and notification receipt — DT-003/DT-011/DT-014 |
| Confirmation, booking, directions, and calendar export | HT-US-701 | `tests/unit/ics-generator.test.ts`; confirmed-plan flow in `tests/e2e/full-journey.spec.ts` | Allowlisted external HTTPS handoffs, missing URL, calendar download/blocked browser, Unicode address | Booking/provider failure contract and real calendar behavior — DT-007 and external calendar gate |
| Attendance acknowledgement and notification truthfulness | HT-US-702, HT-US-806 | Acknowledgement path in `tests/e2e/full-journey.spec.ts`; profile/auth email unit coverage | Conflict path, in-app source-of-truth copy, Resend bounce/unsubscribe, push permission denial | Plan-event dispatcher, receipts, retries/dead letters, optional push — DT-011 |
| Feedback timing and repeat retention | HT-US-703 | Feedback UI in `tests/e2e/full-journey.spec.ts` | Asia/Singapore time gate, cancelled event, duplicate/revision window, repeat-plan action | Durable temporal/idempotency/reporting tests — DT-013 |
| Installable, public-only offline PWA | HT-US-803 | `scripts/check-pwa.mjs`; `tests/e2e-production/pwa-security.spec.ts` | Android Chrome and iOS Safari install/launch/offline, worker update, multi-account cache clearing | Physical-device evidence and deployed cache audit — DT-008/DT-014 |
| Accessible responsive journey | HT-US-102, HT-US-804 | `tests/e2e/accessibility.spec.ts` audits primary routes/dialogs with axe, keyboard controls, focus restoration, reduced motion, and 320/390/430px collision/overflow; additional 390px assertions live in `tests/e2e/adversarial-user-flows.spec.ts` | 1440px and 200% zoom visual review; physical screen reader, forced colors, iOS, and Android | Automated source scope complete — DT-006; physical/installed-device evidence — DT-008 |
| Recovery, idempotency, and operations | HT-US-401, HT-US-503, HT-US-601, HT-US-703, HT-US-805 | Retryable create failure, invalid payload, outsider denial, and mobile checks in `tests/e2e/adversarial-user-flows.spec.ts`; `tests/unit/production-environment.test.ts` | Lost response after commit, 409/429/5xx, provider/calendar/push degradation, incident and rollback drill | Full mutation matrix, alerts, Turso restore/PITR and Vercel rollback — DT-007/DT-014 |

## 15. Run record and evidence package

Every acceptance run records:

- Run ID, date/time, source commit, immutable Vercel deployment ID/URL, environment, Turso database/schema version, seeded dataset version, tester, browser/device/OS, and release channel.
- One row per story with `Pass`, `Fail`, `Blocked`, or `Not run`; automation status does not replace the result.
- Exact command/workflow URL and machine-readable report for automated evidence.
- Fresh desktop and mobile screenshots for home, lobby, ballot list, map/fallback, confirmation, and every visual defect rerun.
- Browser console, failed request, and accessibility output.
- Authorization, invite, map-request, precise-location, CSP, and cache assertions with canaries.
- Provider mode (`fixture`, `live smoke`, or `fallback`) and data verification dates.
- Defect ID, severity, owner, disposition, and rerun evidence for every failure.

Screenshots must be inspected for the intended state; a blank, loading, stale, clipped, wrong-user, or wrong-build image is invalid evidence.

## 16. Severity and release disposition

| Severity | Definition | Disposition |
|---|---|---|
| S0 | Precise/private data exposure, account/plan takeover, secret leakage, destructive corruption, or unsafe production rollback | Stop release and incident-response immediately. |
| S1 | Core journey cannot complete; hard dietary constraint fails; plaintext location persists; private cache leak; production auth bypass | Release blocked. |
| S2 | Important secondary flow, map fallback, accessibility, responsive, notification, or recovery requirement fails with a workaround | Fix before beta or obtain explicit time-bounded product/security acceptance. |
| S3 | Cosmetic/copy inconsistency with no material task, trust, privacy, or accessibility effect | May defer with owner and target release. |

## 17. Entry criteria

- Clean checkout installs from the lockfile using the pinned Node/pnpm versions.
- Lint, typecheck, unit/security tests, production build, Turso migration verifier, and staged Vercel startup pass.
- Test database and provider fixtures are isolated and versioned.
- Production-equivalent environment validation rejects demo mode, placeholder secrets, missing auth/email controls, missing location keyring, and non-durable storage.
- Browser engines and required physical devices are available or explicitly marked as unexecuted external gates.
- No unresolved S0/S1 defect exists from an earlier run.

## 18. Exit criteria

- 100% of P0-equivalent stories—HT-US-101, 201–203, 301–302, 401–402, 501–503, 601–602, 701–702, and 801–805—pass with direct evidence.
- At least 95% of all remaining acceptance variants pass, with an approved owner/date for every S2 deferral.
- No open S0 or S1 defect.
- Clean-checkout CI, security, migration, immutable Vercel deployment smoke, and rollback gates are green for the exact promoted source SHA.
- The deployed database, WAL/SHM, retained backups, logs, browser traffic, caches, and notification artifacts pass precise-origin canary checks.
- Desktop/mobile visual evidence confirms the shared-pass identity and primary hierarchy; keyboard and screen-reader smoke journeys pass.
- Map provider outage, network failure, stale write, invitation races, ballot races, and duplicate confirmation are exercised.
- Staging deploy, exact-digest production promotion, health smoke, and last-known-good rollback are proven in the provisioned remote environment.

## 19. External/manual gates that must remain explicit

- Real transactional email delivery, bounce behavior, and domain authentication.
- Real OneMap accuracy, token renewal, quotas, and representative Singapore routes.
- OpenFreeMap live availability and terms; fixture success does not prove the public service.
- Physical iOS Safari and Android Chrome install/offline behavior.
- Real calendar OAuth/free-busy behavior if Calendar integration is enabled.
- Real web-push permission/delivery behavior if push is enabled.
- Hosting-environment encrypted backup/restore, key rotation, deployment protection, and rollback.

An unavailable external account/device is a named blocker, not a passing result and not something a stub may substitute for.
