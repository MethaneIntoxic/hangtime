# Hangtime deployment-readiness UAT — 2026-08-21

## Outcome

Local release gates pass for the Vercel Hobby + Turso Free architecture. Remote acceptance is not yet executed because the user-owned Vercel login, Turso databases, GitHub repository, and deployment secrets do not yet exist.

## Verified source gates

- `pnpm verify`: pass. This ran ESLint, TypeScript, 56 unit/security tests, PWA and map static contracts, a clean Next.js production build, 24 desktop/mobile browser cases (23 pass, one intentional mobile duplicate skip), and the production PWA/security browser case.
- `pnpm install --frozen-lockfile`: pass after the dependency/runtime split.
- Production build: pass without Turbopack whole-project tracing warnings.
- Pinned actionlint 1.7.12: pass for every checked-in workflow.
- `pnpm audit --prod --audit-level high`: no known high-severity production vulnerability.
- Gitleaks 8.30.1 with `.gitleaks.toml`: no leak found in the complete working directory.
- Encrypted-location verifier: pass with eight envelopes; legacy plaintext profile/participant columns and configured plaintext canaries were absent.
- Auth concurrency: two consumers of one magic link create exactly one session; eight concurrent rate-limit increments persist exactly eight attempts and allow exactly four.
- Vercel runtime contract: importing the database layer with `VERCEL=1` and missing Turso credentials fails closed.

## Implemented deployment contract

- Runtime persistence uses async `@libsql/client`; `better-sqlite3` is dev-only for the offline legacy conversion test/tool.
- Vercel cold starts never run schema bootstrap. Remote schema changes run only through `pnpm db:migrate:turso` in a protected release job.
- Preview and Production workflows require separate Turso URLs/tokens and location keyrings.
- Trusted Preview deploys only after CI for a same-repository main push.
- Production rebuilds the selected main SHA with Production configuration, uses `--skip-domain`, smoke-tests the immutable URL, then promotes that exact deployment.
- Code rollback requires a previously smoke-tested Vercel URL/SHA plus an explicit database-compatibility confirmation.
- Singapore Function placement is pinned through `vercel.json` (`sin1`).

## External evidence still required

1. User approves the currently open Vercel device login.
2. User authorizes creating and pushing a personal GitHub repository; the current repository has no commit or origin and the GitHub CLI token lacks `workflow` scope.
3. User creates/authenticates a Turso Cloud account. The current Turso Cloud CLI does not ship a Windows binary and WSL is absent, so provisioning must use Turso's web UI or Platform API after account authentication.
4. Preview and Production databases, scoped tokens, environment-specific AES keyrings/auth secrets, and a verified Resend sender are created.
5. The live Preview and Production deployments complete real email sign-in, create/join/vote/confirm, map fallback, encryption, revision, and mobile/PWA checks.
6. A Turso PITR branch is restored and verified before broader beta; an encrypted offsite destination is still needed for recovery beyond the Free plan's 24-hour window.

UAT exit criteria remain open until the live deployment and the account-owned evidence above exist.
