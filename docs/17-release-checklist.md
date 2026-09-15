# Release Checklist

This is the short runbook for a real npm release cut.

Use this when you already understand the broader policy in
[11-npm-release-gate.md](./11-npm-release-gate.md) and only need the actual
sequence.

## Stage-aware use

- use this file for the real execution order
- use [11-npm-release-gate.md](./11-npm-release-gate.md) for the actual gate
  semantics
- use [release-stage-reviews/README.md](./release-stage-reviews/README.md) for
  repo-tracked RC evidence

Current practical rule:

- if the package is still on the `rc` track, run both `validate:release` and
  `validate:rc`
- if the package is moving on the final stable path later, keep
  `validate:release` as the minimum machine gate and only keep `validate:rc`
  when the RC contract still applies to that cut

## Canonical order

1. Prepare version references and release notes.
2. Run the publish-safe machine gate.
3. Refresh RC evidence when the cut still lives on the `rc` track.
4. Confirm npm identity and dry-run packaging.
5. Publish through the supported wrapper.

## Commands

Prepare version/docs:

```bash
pnpm release:prepare --version <version> --from <git-ref> [--date <YYYY-MM-DD>]
```

Baseline release gate:

```bash
pnpm validate:release
```

RC evidence refresh when the cut still lives on the `rc` track:

```bash
pnpm validate:rc -- --wallet <name> --relay-url <relay-url>
pnpm review:rc -- --wallet <name> --relay-url <relay-url> --write
```

Identity and dry-run:

```bash
npm whoami
npm view zk-agent-cli version
pnpm release:publish --tag rc --dry-run
```

Real publish:

```bash
pnpm release:publish --tag rc
pnpm release:publish --tag rc --promote-latest
```

If npm accepted the publish but the wrapper later failed only on registry
readback or final dist-tag promotion, resume the post-publish verification
without republishing:

```bash
pnpm release:publish --tag rc --skip-publish
pnpm release:publish --tag rc --skip-publish --promote-latest
```

## Supported helper

Use:

```bash
pnpm release:checklist
pnpm release:checklist --version <version> --from <git-ref> --tag rc
pnpm release:checklist --wallet <name> --relay-url <relay-url>
pnpm release:checklist --json
```

This helper does not mutate the repository or publish anything. It only prints
the current supported sequence and fills in the RC evidence commands when you
provide the wallet and relay URL.

## Quick interpretation

- `validate:release` answers: can this package still be built, packed, and
  claimed safely?
- `validate:rc` answers: does the current RC hosted-approval contract still
  hold on the supported path?
- `review:rc` answers: do we have one repo-tracked review artifact for the
  current RC evidence set?

## What this document is not

This is not the full release policy.

For:

- gate semantics, use [11-npm-release-gate.md](./11-npm-release-gate.md)
- RC review artifacts, use
  [release-stage-reviews/README.md](./release-stage-reviews/README.md)
