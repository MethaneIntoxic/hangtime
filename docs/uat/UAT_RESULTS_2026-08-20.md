# Hangtime map, brand and delivery verification — 2026-08-20

## Outcome

The local MVP now uses Hangtime branding, MapLibre GL JS with the keyless OpenFreeMap Liberty basemap, OpenStreetMap venue links, and an idempotent migration for previously stored Google map links. CI includes a deterministic map policy gate and a separate scheduled live provider-health check.

## Automated evidence

| Gate | Result | Evidence |
|---|---|---|
| Map policy | Pass | `pnpm check:maps` → `MAP_CHECK_PASS`; exact MapLibre pin, CSP, attribution, private-origin boundary and provider denylist checked. |
| Live provider metadata | Pass | `pnpm check:map-provider` → `MAP_PROVIDER_PASS`; style version and all referenced hosts validated without crawling tiles. |
| Lint | Pass | `pnpm lint`. |
| Type safety | Pass | `pnpm typecheck`. |
| Unit/security tests | Pass | 8 files, 33 tests. |
| PWA policy | Pass | `pnpm check:pwa` → `PWA_STATIC_CHECK_PASS`. |
| Production build | Pass | Next.js 16.3.1 optimized build, all routes emitted. |
| Hermetic browser UAT | Pass | Desktop and 390×844 mobile: 23 passed, 1 intentionally skipped desktop-only duplicate. |
| Production PWA/security browser test | Pass | 1 production-Chromium test; headers, cache isolation, legacy cache migration and offline fallback. |
| Rendered map | Pass | In-app browser: 5 keyboard-accessible markers, required attribution, no console errors, no persistent loading overlay, and OpenStreetMap legacy-link migration confirmed. |

## Honest release status

The repository is locally verified but is not production-releasable yet:

- A local `main` Git repository is initialized, but there is no commit or remote yet, so GitHub Actions, Vercel staging/promotion, Turso migration, and rollback have not run remotely.
- Production authentication is still a demo/local implementation.
- Exact origins remain plaintext in SQLite; production promotion must stay disabled until encrypted durable storage is proven.
- OneMap search/routing credentials are not configured, so transit remains a clearly disclosed local estimate.
- OpenFreeMap&apos;s public instance has no SLA; the map has an accessible shortlist fallback and a scheduled health signal, not a guarantee.
