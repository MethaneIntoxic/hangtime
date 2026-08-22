# Hangtime MVP — Durable User Acceptance Specification

**Version:** 2.0  
**Status:** Release-governing acceptance contract  
**Primary market:** Singapore  
**Product scope:** Installable food-and-drink planning PWA for two or three people  
**Accessibility target:** WCAG 2.2 AA  
**North-star outcome:** A returning organizer confirms another hangout within 30 days, and every participant understands why the chosen venue is practical, compatible, and fair.

## 1. Purpose and authority

This document defines the user-visible behavior Hangtime must satisfy before remote beta or production promotion. It is the durable bridge between the architecture blueprint, implementation, automated tests, manual product review, and release evidence.

The words **must**, **must not**, **required**, and **release blocker** are normative. A green build is supporting evidence, not proof by itself: each acceptance story needs evidence at the same scope as its claim. Indirect, stale, or purely static evidence does not pass a rendered or end-to-end requirement.

The current MVP recommends restaurants, cafes, and bars. The Hangtime name leaves room for later activities, but the product must not imply that non-F&B activities are supported today.

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

- **Given** an unexpired email-bound invite and matching signed-in email, **when** opened, **then** organizer, food/drink occasion, date, and window are visible without revealing existing private participant data.
- **When** the invite is accepted, **then** one participant record is created, the token is atomically consumed, and reuse fails.
- Missing, unknown, expired, wrong-email, cross-plan, reused, and fourth-person invitations fail without revealing whether a private plan exists.

**Edge cases:** concurrent acceptance of the final seat; existing member opens invite; clipboard denied; email casing; link scanner opens URL before recipient.  
**Coverage:** Automated for core lifecycle — `tests/e2e/adversarial-user-flows.spec.ts` and `tests/unit/auth-security.test.ts`; link-scanner behavior remains planned.

### Feature HT-F3.2 — Participant check-in

#### Story HT-US-302 — Become ready deliberately

**As a** participant, **I want** to review location, availability, and dietary state before declaring readiness, **so that** the shortlist is based on inputs I consciously confirmed.

**Acceptance**

- **Given** a participant enters the lobby, **when** any required input is missing, **then** the checklist identifies the missing category without exposing private values to others.
- Changing a planning area must not silently stand in for confirming availability and dietary details.
- **Given** all required inputs are reviewed, **when** the participant chooses `Ready`, **then** the organizer sees their ready state and only their coarse area.
- **Given** date, window, origin, budget, or a hard dietary rule changes after readiness or recommendation, **then** affected readiness, recommendation run, and ballots are invalidated with an explanation.

**Edge cases:** participant removes location; calendar connection fails; strict rule added after voting; two tabs change readiness; organizer is the incomplete participant.  
**Coverage:** Partial — journey and state-machine tests cover basic readiness; deliberate checklist and invalidation require additional automation/manual review.

## 8. Epic HT-E4 — Explainable Singapore shortlist

### Feature HT-F4.1 — Reliable recommendation run

#### Story HT-US-401 — Generate once and recover safely

**As an** organizer, **I want** one observable recommendation run, **so that** I can trust progress and recover without duplicate results.

**Acceptance**

- **Given** two or three ready participants, **when** generation begins, **then** duplicate submission is disabled and progress is announced as status, not only animation.
- **Given** completion, **then** the frozen run contains distinct candidates and the plan enters voting once.
- **Given** timeout/provider/error/no-results, **then** loading ends, all plan inputs remain, the binding problem is named where known, and retry is safe/idempotent.

**Edge cases:** request succeeds after client timeout; provider quota; fewer venues than configured; zero viable venues; stale plan version; organizer refreshes mid-run.  
**Coverage:** Partial — full-journey automation covers success; deterministic timeout/idempotency/no-results cases are planned.

### Feature HT-F4.2 — Fairness, dietary, budget, and provenance

#### Story HT-US-402 — Understand why each place fits

**As a** participant, **I want** the shortlist to explain travel, budget, dietary fit, and evidence quality, **so that** I can make a meaningful choice.

**Acceptance**

- Every candidate’s first scan shows group price range, price tier, coarse area, average or per-person travel, journey imbalance, and a plain-language reason.
- Expanded evidence shows each participant’s coarse origin label and duration, never coordinates or postal code.
- Group budget estimates include configured 10% service charge and 9% GST and distinguish estimates from live menu prices.
- A venue with unknown/incompatible evidence for an allergy or hard restriction is excluded. Preference-level uncertainty may remain only with a visible caution.
- Rating, price, opening, dietary, and booking information exposes its source/verification confidence; a booking link is not represented as live availability.

**Edge cases:** one journey is disproportionate despite a good average; tie score; stale venue record; absent booking URL; GST/service configuration changes; no safe venue.  
**Coverage:** Partial — dietary, transit, and budget unit suites cover domain behavior; provenance, visual hierarchy, and representative-scenario human review remain manual.

## 9. Epic HT-E5 — Open map, comparison, and ballot integrity

### Feature HT-F5.1 — Privacy-preserving optional map

#### Story HT-US-501 — Compare candidates on a map without exposing origins

**As a** participant, **I want** to inspect public candidate locations geographically, **so that** neighborhood context helps without revealing where anyone lives.

**Acceptance**

- MapLibre loads only after map view is requested and receives only public candidate coordinates.
- No style URL, tile request, marker, GeoJSON source, outbound URL, console message, analytics event, cache entry, or browser response contains participant coordinate, postal code, private midpoint input, or private origin label.
- Visible OpenFreeMap/OpenMapTiles/OpenStreetMap attribution remains present and readable.
- Candidate marker and horizontal choice order match shortlist ranking; selection is operable by keyboard and has an accessible name/state.
- Switching list → map → list preserves ballot state. A tile/WebGL failure exposes an accessible candidate list and never blocks voting or confirmation.
- Cross-origin tiles are not prefetched, bulk-downloaded, or service-worker-cached.

**Edge cases:** CSP denial; style loads but tiles fail; WebGL unavailable; zero/one candidate; overlapping markers; keyboard zoom; reduced motion; offline installed PWA.  
**Coverage:** Partial — `tests/unit/open-map.test.ts`, `scripts/check-maps.mjs`, and browser list/map tests cover static policy and core parity; outbound request canaries, marker keyboard order, attribution screenshots, and deterministic outage require full evidence.

### Feature HT-F5.2 — Formula-capped, independent voting

#### Story HT-US-502 — Choose some but not every venue

**As a** participant, **I want** a bounded multi-select ballot, **so that** my preferences carry information without forcing one choice.

**Acceptance**

- For `n >= 2`, `maxSelections = min(n - 1, floor(n / 2) + 1)`.
- Canonical examples: `n=2 → 1`, `3 → 2`, `4 → 3`, `5 → 3`, `6 → 4`, `7 → 4`, `8 → 5`.
- One viable venue bypasses the ballot and enters organizer confirmation.
- At least one selection is required; exceeding the cap is prevented in UI and rejected by the server.
- Selection count/cap remains visible, map/list state is identical, and keyboard/assistive technology receive selected state.

**Edge cases:** zero candidates; duplicates; stale frozen run; candidate removed; two-tab edits; network retry; exact cap.  
**Coverage:** Automated for formula/server cap — `tests/unit/voting-rules.test.ts` and `tests/e2e/adversarial-user-flows.spec.ts`; full keyboard/map parity remains partial.

#### Story HT-US-503 — Save, revise, and avoid vote bias

**As a** participant, **I want** my ballot saved atomically and other results revealed at the appropriate time, **so that** I can revise safely without being anchored by earlier voters.

**Acceptance**

- A saved revision atomically replaces the previous ballot until confirmation.
- The UI clearly distinguishes unsaved local changes from the durable ballot.
- Before a participant’s first submission, other people’s candidate counts/leaders are hidden. Product policy may reveal aggregate results after submission or after everyone votes, but the chosen policy must be consistent and tested.
- A stale or post-confirmation write fails without changing the decision.

**Edge cases:** two tabs submit; organizer confirms during request; all candidates tie; no ballots; last voter disconnects.  
**Coverage:** Partial — current browser/unit tests cover save, cap, and tally; unbiased reveal policy and concurrency remain planned.

## 10. Epic HT-E6 — Transparent organizer decision

### Feature HT-F6.1 — Winner, tie, and incomplete ballot handling

#### Story HT-US-601 — Lock in a defensible choice

**As an** organizer, **I want** to see voting completeness and leaders before confirming, **so that** I do not accidentally ignore someone.

**Acceptance**

- The confirmation surface shows ballots received versus eligible participants and all tied leaders.
- If eligible participants have not voted, confirmation requires a clear warning and explicit acknowledgement; the resulting event records that voting was incomplete.
- The exact start time must be within the agreed window in both UI and server validation.
- Concurrent or repeated confirmation produces one immutable decision.

**Edge cases:** no ballots; one of three missing; tie; participant removed; plan version conflict; venue becomes unavailable.  
**Coverage:** Partial — tally/state tests and full journey cover ordinary confirmation; incomplete-vote and concurrency behavior require tests.

#### Story HT-US-602 — Choose a different option transparently

**As an** organizer, **I want** to choose a non-leading compatible venue with a visible reason, **so that** practical realities can override the tally without hiding the decision.

**Acceptance**

- The control is labeled `Choose a different option`, not `veto`.
- A leading candidate needs no override reason. A non-leading candidate requires 10–240 trimmed characters.
- The reason is plain text, appears in the immutable decision record, and is visible to participants and confirmation notifications.
- The reason must not permit HTML execution or expose private location/dietary details through templates/logs.

**Edge cases:** whitespace-only; 9/10/240/241 characters; tie leader; offensive/private text; notification delivery failure after commit.  
**Coverage:** Partial — voting unit tests cover reason validation and browser journey covers confirmation; output-safety and notification evidence require tests.

## 11. Epic HT-E7 — Confirmed outing, attendance, and repeat use

### Feature HT-F7.1 — One shared outing pass

#### Story HT-US-701 — Use the confirmed plan

**As a** participant, **I want** a compact confirmed outing pass, **so that** I can act without reopening the planning discussion.

**Acceptance**

- It shows venue, exact time/date, address, public area, participant names/status, winner/override record, directions, booking/menu action, and calendar export.
- External links use allowlisted HTTPS destinations and safe new-tab behavior.
- ICS contains Singapore timezone, stable UID, escaped address, exact time, and no private origin.
- Missing booking or map destination degrades without an empty or broken primary action.

**Edge cases:** Unicode/comma address; absent URL; link provider down; calendar blocked; changed/cancelled plan; duplicate download.  
**Coverage:** Partial — ICS unit and full-journey browser tests cover core behavior; allowlist/failure presentation remains planned.

#### Story HT-US-702 — Acknowledge attendance and flag conflict

**As a** participant, **I want** to acknowledge or flag a conflict, **so that** the group knows whether the confirmed plan still works.

**Acceptance**

- Pending, attending, and conflict are labeled with text/icons, not color alone.
- Repeating the same acknowledgement is idempotent; changing state is authorized and immediately visible.
- A conflict notifies the organizer without exposing hidden location or dietary data.

**Edge cases:** offline mutation; two-tab update; outsider request; conflict after calendar export.  
**Coverage:** Partial — ordinary acknowledgement is in full-journey automation; concurrency, notification, and offline cases are planned.

### Feature HT-F7.2 — Feedback after the event

#### Story HT-US-703 — Learn only after the hangout

**As a** participant, **I want** a short post-event survey at the right time, **so that** I can improve future recommendations without premature prompts.

**Acceptance**

- Feedback is offered only after the confirmed event time in `Asia/Singapore` or through an explicitly labeled preview in demo mode.
- Satisfaction and reuse intent are required; notes are optional and length-limited.
- One durable response per participant is accepted; success is acknowledged and retry does not duplicate it.
- After submission, starting another plan with the same group is one clear action.

**Edge cases:** early request; cancelled event; duplicate submit; device timezone differs; plan never marked completed.  
**Coverage:** Partial — current browser journey covers survey UI; temporal gate/idempotency and repeat-plan action remain planned.

## 12. Epic HT-E8 — Privacy, authentication, PWA, accessibility, and resilience

### Feature HT-F8.1 — Production identity and authorization

#### Story HT-US-801 — Access only my plans

**As a** participant, **I want** production-grade email authentication and strict membership checks, **so that** another person cannot enter or mutate my plan.

**Acceptance**

- Magic links/codes are hashed, expiring, one-use, origin-bound, and rate-limited; sessions are opaque, revocable, secure, HttpOnly, and appropriately SameSite.
- Organizer-only operations are enforced server-side.
- Outsiders receive indistinguishable 403/404-safe responses for plan read, participation, invite creation, ballot, confirmation, acknowledgement, feedback, and ICS.
- Production never exposes the demo identity switcher or accepts demo sessions.

**Edge cases:** replay; token tamper; external return URL; cross-origin mutation; revoked session; email case normalization; rate-limit race.  
**Coverage:** Automated for core controls — `tests/unit/production-auth.test.ts`, auth security tests, and adversarial browser tests; live email delivery remains external/manual.

### Feature HT-F8.2 — No plaintext precise origins

#### Story HT-US-802 — Keep exact origins private everywhere

**As a** participant, **I want** precise origin data encrypted and absent from ordinary product surfaces, **so that** convenience does not expose where I live.

**Acceptance**

- Precise origins use authenticated encryption with key versioning and record-bound associated data before persistence.
- Production database schema, database bytes, WAL/SHM, retained backups, browser payloads, logs, analytics, URLs, email, push, events, caches, and map requests contain no plaintext postal or coordinate canaries.
- Coarse labels may be visible; precise origins are decrypted only in an authorized server-side recommendation boundary and are never logged.
- Wrong key, modified ciphertext/tag/nonce/AAD, or copied envelope fails closed.
- Restore and rotation evidence prove every retained backup has its required key available separately.

**Edge cases:** legacy migration; old plaintext snapshot; wrong/retired key; interrupted rotation; app crash during write; account/plan deletion.  
**Coverage:** Partial — location crypto/migration/environment unit suites exist; release requires the database/WAL/backups/browser/log canary verifier against the deployed environment.

### Feature HT-F8.3 — Public-only PWA behavior

#### Story HT-US-803 — Install without caching private plans

**As a** participant, **I want** an installable app that fails safely offline, **so that** private planning data is not retained in a shared browser cache.

**Acceptance**

- Manifest, 192/512 maskable icons, standalone metadata, and production service-worker registration are valid.
- Only the public offline shell, manifest, and approved static icons are precached.
- `/api`, `/plans`, `/join`, authenticated HTML, query-bearing/tokenized URLs, map tiles, and provider responses are network-only and absent from Cache Storage.
- Logout removes user-scoped state; a private offline route shows only the neutral public shell with no stale names, plan IDs, dates, venues, tokens, or origins.

**Edge cases:** worker upgrade; unrelated cache; offline first launch; installed PWA; failed update; multiple accounts in one browser.  
**Coverage:** Automated for Chromium production policy — `tests/e2e-production/pwa-security.spec.ts` and `scripts/check-pwa.mjs`; physical iOS/Android install remains manual.

### Feature HT-F8.4 — Accessible and responsive primary journey

#### Story HT-US-804 — Complete the journey with different access needs

**As a** keyboard, screen-reader, low-vision, reduced-motion, or mobile user, **I want** every primary action to remain perceivable and operable, **so that** I can participate independently.

**Acceptance**

- Create, readiness, shortlist/map, ballot, confirmation, and acknowledgement are keyboard complete with visible focus and logical order.
- Dialogs trap focus, close with Escape when safe, label title/description, and restore focus to the trigger.
- Controls have accessible names/state; radio/selection semantics are native or equivalent; touch targets are at least 44×44 CSS px.
- Errors are assertive, saved/success states polite, and progress exposes `aria-busy`/status. No required information depends only on color, icon, motion, hover, or map geography.
- Reduced motion disables nonessential transitions. At 390px, 1440px, 200% zoom, and large text, there is no horizontal overflow, clipping, sticky-action collision, obscured field, or unreachable control.

**Edge cases:** 320px fallback; mobile virtual keyboard; forced colors; long names; map unavailable; screen-reader browse/forms mode.  
**Coverage:** Partial — mobile overflow and core browser journey are automated; axe, full keyboard, screen-reader, forced-colors, zoom, and physical-device checks require fresh evidence.

### Feature HT-F8.5 — Recover from operational failures

#### Story HT-US-805 — Fail without losing trust

**As a** participant, **I want** failed loads and mutations to stop cleanly and preserve safe work, **so that** I know whether to retry.

**Acceptance**

- Failed load/create/recommendation/vote/confirmation exits loading, explains what did not happen, preserves safe input, and offers retry or navigation.
- Retrying an idempotent action cannot duplicate plans, runs, ballots, decisions, notifications, or feedback.
- Provider/map/calendar/push failure leaves a documented fallback and never weakens privacy or dietary hard constraints.

**Edge cases:** response lost after commit; 409 version conflict; 429; provider partial data; offline transition; server restart.  
**Coverage:** Partial — retryable plan-form failure exists in adversarial browser tests; full mutation/idempotency matrix is planned.

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

| Product rule | Stories | Primary evidence |
|---|---|---|
| Two or three participants | HT-US-202, 203, 301 | Browser plan/invite tests; concurrent capacity test |
| General-area privacy | HT-US-302, 402, 501, 802 | API/browser canaries; DB/WAL/backup verifier |
| Public-transport fairness | HT-US-203, 402 | Transit unit fixtures; 20 human-reviewed SG scenarios |
| Hard dietary exclusion | HT-US-302, 402 | Dietary unit/property tests; trio journey |
| Group budget with GST/service | HT-US-203, 402 | Budget unit/property tests; rendered venue evidence |
| Formula-capped voting | HT-US-502, 503 | Voting unit/property tests; browser cap/revision tests |
| Tie and transparent override | HT-US-601, 602 | Voting/confirmation integration and browser tests |
| MapLibre/OpenFreeMap boundary | HT-US-501 | Static map verifier; intercepted browser network; live scheduled health check |
| Booking/calendar handoff | HT-US-701 | URL allowlist integration; ICS unit; browser download/action |
| Production auth/authorization | HT-US-801 | Auth unit/integration; outsider browser matrix |
| Installable, private PWA | HT-US-803 | Static PWA check; production browser cache audit; physical install |
| Accessible responsive journey | HT-US-102, 804 | Browser viewports, axe, keyboard/screen-reader, manual visual review |
| Recovery/idempotency | HT-US-401, 503, 601, 703, 805 | Fault-injected integration/browser tests |

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
