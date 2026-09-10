# GitHub-hosted CI cost policy

The repository defaults to zero GitHub-hosted runner usage. Every workflow job
that declares `runs-on` has a job-level condition requiring the repository
configuration variable `HOSTED_CI_ENABLED` to equal the literal `true`.
GitHub evaluates a job `if` condition before sending the job to a runner, so an
unset variable skips the job before runner allocation.

## Enabling a hosted validation window

1. In the repository's **Settings → Secrets and variables → Actions → Variables**,
   set `HOSTED_CI_ENABLED` to `true`.
2. Confirm the account's included minutes, payment method, and spending/budget
   controls before dispatching a workflow.
3. Run the intended workflow or allow the intended trigger to be processed.
4. Unset `HOSTED_CI_ENABLED` when the validation window closes.

The deployment workflows have a second independent gate:
`FREE_TIER_DEPLOYMENTS_ENABLED=true`, plus the existing manual confirmation
inputs and protected Production environment. Enabling hosted runners alone does
not authorize a Vercel/Turso deployment.

This repository variable is a fail-closed workflow control. It cannot enforce
an account-level Actions budget after it is set to `true`; GitHub billing,
spending limits, and payment settings remain external account controls. This
policy never changes those settings. Private repositories consume included
GitHub-hosted minutes and may be charged after the included allowance, while
standard hosted runners on public repositories are free under GitHub's current
billing rules. See [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
and [GitHub configuration variables](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables).

## Enforced workflow bounds

`pnpm check:ci` enforces the source-level controls below:

- Every hosted job requires `vars.HOSTED_CI_ENABLED == 'true'` at job level.
- Every hosted job has `timeout-minutes` between 1 and 30.
- Every workflow defines top-level `concurrency` to bound duplicate runs.
- Workflow jobs use the checked-in standard YAML shape (`jobs.<id>` at two
  spaces, with direct `runs-on` and `timeout-minutes` keys at four spaces); an
  unrecognized `runs-on` indentation fails the policy check.
- Actions are pinned to full commit SHAs.
- `pull_request` workflows do not reference repository secrets.
- `pull_request_target` is prohibited.
- `workflow_run` workflows that use secrets require same-repository provenance.
- Scheduled runner workflows are prohibited; health and provider checks remain
  manual `workflow_dispatch` workflows.

Production and rollback concurrency groups intentionally do not cancel an
active operation. Fast validation and health-check groups cancel superseded
runs. A skipped hosted job is unexecuted remote evidence; local checks remain
available without enabling the repository variable:

```text
pnpm ci:fast
pnpm ci:browser
pnpm ci:security
pnpm ci:production
```

Do not change billing, spending limits, payment settings, or remote workflow
state as part of local validation.

The checker is a source-level guardrail, not a substitute for GitHub's
account-level billing controls or a complete workflow security review.
