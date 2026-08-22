# Extended UAT execution record — UAT-2026-08-18-02

Status: **Local extended suite passed; production release remains blocked**  
Environment: local Windows, Node 24, pnpm 10.34.5, in-app Chromium and Playwright Chromium  
Rendered viewports: desktop default and 390×844 mobile  
Dataset: isolated seeded database for the authoritative automated run

## Result

- 31/31 unit and security tests passed.
- 23/23 applicable development browser tests passed; one desktop-only skip is the intentionally mobile-specific geometry assertion.
- 1/1 standalone production PWA/security test passed.
- Lint, TypeScript, production build, PWA static policy, standalone revision-aware smoke, and six workflow files passed.

## New user evidence

| Scenario | Result | Evidence |
|---|---|---|
| Retry failed plan creation | Pass | A forced 503 keeps the selected companion, brunch choice, and S$180 budget; the second submission creates the lobby with S$180. |
| Plan payload abuse | Pass | Empty/duplicate companion lists and reversed time windows return bounded 400 responses before persistence. |
| Third-diner invite | Pass | Maya creates a new plan/invite, Clara opens it, supplies name/general origin, joins the same plan, and reuse returns `INVITE_ALREADY_USED`; desktop and mobile pass. |
| Ballot abuse | Pass | Empty, duplicate, over-limit and outsider submissions fail with the expected 400/403 contract. |
| Participant location response | Pass | Participant and profile payloads omit postal code, latitude and longitude. |
| Outsider route matrix | Pass | Clara receives 403 for Friday-plan read, invite creation, ballot, confirmation and ICS; denial bodies contain no sampled precise origin. |
| Ballot cap UI | Pass | At 390×844, a fourth choice remains unselected and a named status announces the three-choice limit. |
| Mobile geometry | Pass at 390×844 | No horizontal overflow; submit action ends above the mobile navigation. |
| Production cache migration | Pass | Obsolete Dinner Time and Hangtime caches are removed, unrelated caches survive, and protected/query/token URLs never enter the four-item public cache. |
| Production headers | Pass | CSP, HSTS, no-store, join no-referrer/noindex, manifest MIME and worker scope are asserted. |
| Offline private route | Pass | Only the public offline shell appears; plan/token/email/location canaries are absent. |

## Bugs fixed by this run

- Empty and duplicate ballots were accepted by the API.
- A zero-vote tally could incorrectly report the first candidate as leader.
- Plan creation accepted malformed/unsafe group, enum, budget and time-window input.
- Confirmation accepted malformed/out-of-window times and did not explicitly require the voting state.
- Release smoke could not prove which source revision was deployed.
- Next.js standalone output initially traced local SQLite/WAL files; output tracing now excludes every database artifact and the rebuilt standalone tree is clean.

## Remaining release blockers and risks

- Production authentication and encrypted durable location storage are still absent (DT-001/DT-002).
- Joining still marks a diner ready without explicit dietary and availability confirmation (DT-005).
- CSRF/origin validation, rate limiting, concurrent invite/capacity tests, complete keyboard semantics, and full three-session voting remain open.
- Development access logs include tokenized join paths. CI no longer uploads Playwright JSON artifacts, but token redaction for operational logs remains required.
- Docker is unavailable locally, so the new exact-container runtime gate is syntax-reviewed but requires a real GitHub Actions run.
- The directory still has no committed remote, Vercel project, Turso databases, protected environments, or deployment history; workflows cannot be represented as executed until those external systems exist.

## CI/CD changes verified locally

- Release candidate now starts only after successful CI for the exact `main` SHA.
- Security is callable as a release gate; publication waits for release and security gates.
- The candidate image is attested, pulled by digest, checked for database artifacts, started and smoke-tested before staging.
- Production promotion is a separate no-build workflow consuming the staged digest/source SHA.
- Rollback and deployment share per-environment concurrency and require repository-scoped provenance plus revision verification.
- Docker build uses a temporary build database outside `/app`; CI rejects database files inside the runtime image.
- Actionlint 1.7.12 validates all workflow syntax from a checksum-pinned binary.
