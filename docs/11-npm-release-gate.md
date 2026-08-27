# npm Release Gate

This checklist is the release gate for current beta or stable cuts of
`zk-agent-cli`.

The goal is not to prove that the project has "many features". The goal is to
prove that:

1. the package can be published and used legitimately
2. a new user can complete the shortest success path using only the npm package
   and the README
3. the publicly claimed capability surface is covered by local validation

## Release-stage progression

This gate now serves two related but distinct decisions:

1. whether the next npm cut is safe to publish
2. whether the project is ready to move from `beta` to `rc`, and later from
   `rc` to `1.0.0`

Current judgment:

- `zk-agent-cli` should remain on `beta`
- the project is not ready to claim `rc` yet
- the project is not ready to claim `1.0.0` yet

Why it is still `beta`:

- the default hosted approval path is now validated with repeated real public
  operated rehearsal evidence, but that supportable deployment contract still
  needs stable recovery evidence and broader product hardening
- release/version/doc synchronization has improved, but it is still too easy to
  rely on operator memory instead of a repeatable release contract
- the public machine-readable JSON contracts are close to stable, but they
  should be treated as frozen compatibility boundaries before `rc`
- that freeze now needs to stay explicit in the operator-contract doc rather
  than remaining an implied team convention

For the current hosted deployment boundary, see
[16-hosted-approval-operated-baseline.md](./16-hosted-approval-operated-baseline.md).

### Gate: `beta -> rc`

Do not move from `beta` to `rc` until all of the following are true:

- one canonical operator path is aligned across the root README, package README,
  CLI help, skills, and machine-readable onboarding/output summaries
- hosted approval is documented and exercised as an operated product contract,
  not only as a prototype validation path
  - repeated real public reapprove rehearsal now exists on the current hosted
    path, but that still does not close the recovery-stability part of the RC
    gate by itself
- the release flow is repeatable without hidden operator memory
- the public machine-readable contracts are frozen:
  `onboardingSummary`, `workflowEntrySummary`, `walletApprovalSummary`, and the
  recovery-focused next-step command surfaces
- the freeze policy is declared in
  [10-operator-json-contract.md](./10-operator-json-contract.md) and enforced
  by `release:check`, not only by reviewer memory
- local and hosted recovery semantics are stable with no known blocker on the
  default approval path

### Machine-checkable RC subset

Run:

```bash
pnpm validate:rc
pnpm validate:rc -- --wallet <name> --relay-url <relay-url>
pnpm validate:rc -- --wallet <name> --relay-url <relay-url> --report-file <path>
pnpm review:rc -- --wallet <name> --relay-url <relay-url> --write
pnpm review:rc -- --wallet <name> --relay-url <relay-url> --report-file <path> --write
```

This command currently reruns:

- `pnpm validate:release`
- `pnpm smoke:hosted-operated-baseline -- --wallet <name> --relay-url <url> --reapprove --prompt-code --repeat 2 --plan`
- `pnpm smoke:hosted-recovery -- --wallet <name> --plan`

What it means:

- it closes the machine-checkable RC subset on the supported host runtime
- it keeps the standard hosted operated-baseline rehearsal command and the
  deterministic hosted recovery rehearsal command from drifting out of the RC
  contract
- it auto-detects the newest matching public hosted evidence report under
  `~/.zk-agent/reports/hosted-operated-baseline/` when one already exists
- `--report-file <path>` can pin one exact public evidence artifact instead of
  relying on newest-match discovery
- it is necessary, but not sufficient, for `beta -> rc`
- it does not replace the real public browser/manual rehearsal on the actual
  hosted relay URL
- the remaining public rehearsal should be run with `--save-report` so the
  request ids, share URLs, and final series outcome are captured as local RC
  evidence under `~/.zk-agent/reports/hosted-operated-baseline/`

### RC review artifact

After `pnpm validate:rc` is green, run:

```bash
pnpm review:rc -- --wallet <name> --relay-url <relay-url> --write
pnpm review:rc -- --wallet <name> --relay-url <relay-url> --report-file <path> --write
```

What this adds:

- it reruns `validate:rc` in JSON mode and preserves the current machine gate
  result as one markdown review artifact
- it records the accepted hosted-operated-baseline evidence summary and the
  remaining explicit manual decision in one repo-tracked file
- it still does not promote the package to `rc` by itself

Default output path:

- `docs/release-stage-reviews/<YYYY-MM-DD>-<wallet>-rc.md`

### Gate: `rc -> 1.0.0`

Do not move from `rc` to `1.0.0` until all of the following are true:

- every `rc` gate remains closed under repeated real release validation
- at least one additional zkSync-native product slice exists beyond the current
  flagship `workflow pay` path
- two consecutive end-to-end release rehearsals complete without public
  contract churn
- no known release-blocking issue remains on packaged install, local-first
  wallet bootstrap/recovery, hosted approval, or flagship `workflow pay`

### Not required for `1.0.0`

The following are useful, but they are not release prerequisites for the first
formal version:

- broad DeFi breadth
- Polygon feature-count parity
- broad ecosystem integration breadth
- broader AA profile expansion beyond the current `sed-lite` default path

## How to use this gate

- Run it in order before each release.
- Each item only accepts two states:
  - `PASS`
  - `BLOCKED`
- If any item is `BLOCKED`, do not release.

## Gate 0: publishing identity and permissions

Before release, confirm:

- [ ] the current npm account has permission to publish `zk-agent-cli`
- [ ] the `zk-agent-cli` name and current version are publishable
- [ ] the version has been confirmed and will not overwrite the wrong release

Suggested commands:

```bash
npm whoami
npm view zk-agent-cli version
npm publish --dry-run
```

Supported host wrapper:

```bash
pnpm release:publish --tag beta
pnpm release:publish --tag beta --promote-latest
```

Before a new version or tag is prepared in the repo docs, sync the local
version references first:

```bash
pnpm release:sync-version --version <version> --date <YYYY-MM-DD> --latest-tag <version> --beta-tag <version>
```

Then refresh the versioned release-note draft input from the intended git
range:

```bash
pnpm release:draft-notes --from <git-ref> [--to <git-ref>] [--version <version>] [--apply]
```

Pass criteria:

- `npm whoami` returns the expected account
- if the package has not been published yet, `npm view` should not return an
  already-published version that conflicts with the planned release
- `npm publish --dry-run` does not fail with packaging or permission errors
- the supported wrapper can do the same checks from a neutral temp directory,
  so repo-root `devEngines` do not distort `npm view` or `npx` readback

Blockers:

- publishing-account permissions are unclear
- package-name or version policy is not confirmed
- `dry-run` already returns publish-level errors

## Gate 1: license and legal distribution surface

Before public npm distribution, the following must be true:

- [ ] a clear root `LICENSE` file exists
- [ ] `packages/zk-agent-cli/package.json` no longer uses `UNLICENSED`
- [ ] the root README and package README describe the license consistently

Files to inspect:

- `LICENSE`
- `packages/zk-agent-cli/package.json`
- `README.md`
- `packages/zk-agent-cli/README.md`

Pass criteria:

- the usage license is clear to anyone installing the public package

Blockers:

- the package is still `UNLICENSED`
- the root repository has no license file

## Gate 2: package README must stand on its own

`packages/zk-agent-cli/README.md` must be usable without repository context.

Before release, it must cover:

- [ ] prerequisites
- [ ] installation paths: `npx` and `npm install -g`
- [ ] the shortest success path:
      `setup -> next -> wallet create/reapprove -> next -> workflow pay`
- [ ] the local storage path `~/.zk-agent/`
- [ ] the minimum required environment variables, or when `.env` / RPC values
      are actually needed
- [ ] the shortest relay / remote-approval path
- [ ] common failures and the shortest repair actions

Pass criteria:

- a first-time user can get through the first success path from the npm page
  README alone
- the current `release:check` script also enforces the minimum package-README
  anchors for public entrypoints, shortest path, relay path, storage path,
  runtime floor, and common repair guidance so this gate is not purely manual
  anymore
- the same gate also keeps the hosted operated-baseline link and the root
  release-stage judgment visible instead of leaving them as manual doc review
  items
- the same gate now also rejects drift between the published package version
  and the current-version references kept in the repo-level public state docs

Blockers:

- the README still mostly redirects users back to monorepo documentation
- it is missing a first-run quickstart or failure-recovery guidance

## Gate 3: package contents and metadata

The package itself must be distributable, not only runnable inside the local
monorepo.

- [ ] `release:check` passes
- [ ] the tarball only contains expected contents
- [ ] runtime dependencies do not include `workspace:*`
- [ ] `bin`, `repository`, `homepage`, `bugs`, and `engines` are correct

Command:

```bash
pnpm --filter zk-agent-cli release:check
```

Current script location:

- `packages/zk-agent-cli/scripts/release-check.mjs`

Pass criteria:

- the tarball is built successfully
- the package contains at least:
  - `dist/index.js`
  - `package.json`
  - `README.md`
- after extraction into a system temp directory, these commands still start
  correctly from an isolated cwd:
  - `zk-agent --help`
  - `zk-agent wallet --help`
  - `zk-agent wallet request --help`
    including the colocated vs relay-completion request contract
  - `zk-agent wallet signer --help`
    including the local execution-signer repair contract
  - `zk-agent wallet smart-account --help`
    including the built-in `sed-lite` predict/deploy contract
  - `zk-agent workflow --help`
    including the flagship-pay ordering and the token/discovery recovery path
  - `zk-agent bridge|send-token|swap|fund|deposit|withdraw --help`
    including the direct-command symbol-resolution and tracked-default
    contracts
  - `zk-agent relay --help`
    including the hosted remote-approval fallback contract
  - `zk-agent agent --help`
    including the optional local operator-identity contract
  - `zk-agent defaults --json`
  - `zk-agent wallet smart-account profiles --json`
- the same tarball can also be installed into a temporary project outside the
  repository with `pnpm add --offline <tarball>` and the installed
  `zk-agent` / `zksync-agent` binaries still start correctly, including the
  public-entrypoint and canonical-path help contract
- that packaged runtime also keeps the default onboarding JSON contract stable:
  `next --json`, `setup --json`, and `doctor --json` still emit the expected
  shared `onboardingSummary` fields and first-run follow-up commands
- that installed package can also start `relay serve --public-origin ...`,
  create a real relay request, redirect `/r/<id>` into the connector UI
  entrypoint, and still serve the bundled hashed frontend asset from the relay

Blockers:

- packaging fails
- tarball structure is wrong
- runtime startup still depends on workspace-only resolution
- tarball install smoke outside the repository fails even though direct unpack
  smoke passes

## Gate 4: local validation gate

Before release, rerun the full local release validation at least once.

- [ ] `pnpm validate:release` passes

Command:

```bash
pnpm validate:release
```

Notes:

- this command currently covers:
  - `zk-agent-cli release:check`
  - `@zk-agent/agent-tools test`
  - `zk-agent-cli test`
- `pnpm validate:rc` is the stricter RC-oriented wrapper above this release
  gate; it keeps the machine-checkable RC subset explicit without pretending
  that the public hosted rehearsal can be automated away

Pass criteria:

- all sub-checks are green
- current baseline fact:
  `pnpm validate:release` passed again on the supported host runtime on
  `2026-08-27`

Blockers:

- any sub-check fails

## Gate 5: local listener / relay test environment

This is not an extra test. It verifies that the validation environment itself
is trustworthy.

- [ ] if the sandbox blocks `127.0.0.1` listeners, the same checks have been
      rerun in an environment that allows them
- [ ] relay / await-local / workflow-await-local tests are not passing only
      because they were skipped

Files worth checking:

- `packages/zk-agent-cli/tests/await-local.test.mjs`
- `packages/zk-agent-cli/tests/relay-cli.test.mjs`
- `packages/zk-agent-cli/tests/workflow-await-local-cli.test.mjs`
- `packages/zk-agent-cli/tests/smoke-remote-approval-runtime.test.mjs`

Pass criteria:

- listener-dependent tests pass in a real environment that allows local binds
- current baseline facts:
  - the managed sandbox can fail with `listen EPERM 127.0.0.1`
  - the same `pnpm validate:release` gate was rerun successfully on the host
    environment on `2026-07-31`
  - it was rerun again successfully on `2026-08-27` after extending the
    listener/relay-heavy waits that were too tight at `5000ms` under host load
  - `pnpm validate:rc -- --wallet main --relay-url https://zk.frp.meroar.fun
    --json` also passed on `2026-08-27`, consuming the saved repeated hosted
    evidence report under
    `~/.zk-agent/reports/hosted-operated-baseline/2026-08-27T14-10-33.792Z-main-reapprove.json`

Blockers:

- the checks were only run inside the restricted sandbox, so relay /
  await-local behavior is still unproven

## Gate 6: command surface and documentation must agree

Before public release, README text, skills, and CLI help must not contradict
each other.

- [ ] the root README install/run paths match the package README
- [ ] `skills/SKILL.md` and `skills/QUICKSTART.md` use the same canonical path
      as CLI help
- [ ] README/skills keep the install boundary honest:
      `npx skills add ...` is still the repo-skill path for compatible
      harnesses, and native plugin packaging is only claimed through the real
      `.codex-plugin/plugin.json` manifest now shipped by the repo
- [ ] `zk-agent doctor --help` exposes the same local-only diagnostic and
      recovery contract claimed by README/skills
- [ ] `zk-agent --help` exposes the same main capability surface claimed by the
      README
- [ ] docs no longer imply that an unpublished install surface is already live

Suggested checks:

```bash
pnpm codex:plugin:doctor
npx zk-agent-cli --help
npx zk-agent-cli doctor --help
npx zk-agent-cli wallet --help
npx zk-agent-cli workflow --help
zk-agent --help
zk-agent doctor --help
zksync-agent --help
PATH=/Users/mac/.nvm/versions/node/v24.14.1/bin:$PATH npx --yes skills add https://github.com/AgiWeb3/zk-agent-cli --list
```

Pass criteria:

- the same capability entrypoints, command names, and default path remain
  aligned across:
  - the package README
  - the root README / skills
  - packaged help entrypoints reached through `npx zk-agent-cli ...` or the
    installed `zk-agent` / `zksync-agent` binaries
- the same docs also keep the install boundary honest:
  - `npx skills add ...` is described as the repo skill surface for
    compatible harnesses
  - native ChatGPT/Codex plugin packaging is only claimed because the repo
    actually ships `.codex-plugin/plugin.json`
- the current `release:check` script now also machine-checks that contract
  across:
  - root `.codex-plugin/plugin.json` version and skill-path alignment
  - package README public entrypoints
  - root README public entrypoints
  - `skills/SKILL.md` and `skills/QUICKSTART.md`
  - packed `zk-agent --help`
  - packed `zk-agent doctor --help`
  - packed `zk-agent setup --help`
  - packed `zk-agent next --help`
  - packed `zk-agent defaults|assets|tokens|resolve-token --help`
  - packed `zk-agent wallet --help`
  - packed `zk-agent workflow --help`
  - `docs/10-operator-json-contract.md` doctor / setup / wallet-bootstrap / wallet discovery examples
  - current-version references in `README.md`, `PLANS.md`,
    `PROJECT_STATE.md`, and this release-gate doc

Blockers:

- the README claims one default path while CLI help claims another
- the root docs still default to the repo-local wrapper while the packaged
  install surface is already the public promise
- docs deny native ChatGPT/Codex plugin packaging even though the repo now
  ships `.codex-plugin/plugin.json`
- deferred capability is described as stable and shipped

## Gate 7: public promise boundary must stay clear

The package being released is a zkSync / ZK Stack CLI, not a direct Polygon
feature clone.

Before release, confirm:

- [ ] no Polygon-only feature is described as a finished zkSync capability
- [ ] README/skills describe missing verticals and boundaries clearly
- [ ] release copy emphasizes the current real strengths:
  - workflow-first path
  - relay-backed approval
  - defaults/registry
  - bridge/deposit/withdraw lifecycle

Pass criteria:

- public description is accurate without underselling or overclaiming

Blockers:

- release copy overpromises just to look like a "Polygon equivalent"

## Gate 8: minimum manual smoke

Even after automation passes, complete one short manual path.

- [ ] `npx zk-agent-cli --help` behaves as expected
- [ ] `npm install -g zk-agent-cli` then `zk-agent --help` behaves correctly
- [ ] `npm install -g zk-agent-cli` then `zksync-agent --help` behaves correctly
- [ ] `pnpm codex:plugin:doctor` reports the current local Codex plugin
      readiness without mismatched marketplace/link state
- [ ] `PATH=/Users/mac/.nvm/versions/node/v24.14.1/bin:$PATH npx --yes skills add https://github.com/AgiWeb3/zk-agent-cli --list`
      recognizes the repo and shows the expected skill names before any real
      install attempt
- [ ] from one compatible external harness or temporary project, `PATH=/Users/mac/.nvm/versions/node/v24.14.1/bin:$PATH npx --yes skills add https://github.com/AgiWeb3/zk-agent-cli --skill '*' --agent codex --copy -y`
      installs the repo skill bundle and the main `zk-agent-cli` skill is
      visible
- [ ] `zk-agent setup`
- [ ] `zk-agent doctor`
- [ ] `zk-agent next`
- [ ] at least one wallet create or reapprove path works in the target
      environment
- [ ] at least one `workflow auto` preview path works

Notes:

- if the release machine is not intended for live chain broadcast at this
  stage, at minimum complete the help, setup, next, and preview path
- for a single-agent install smoke, do not use `--all --agent codex`:
  the external `skills` CLI currently treats `--all` as `--skill '*' --agent '*'`
- if the local Codex build does not expose `codex plugin add`, use `/plugins`
  after marketplace wiring instead of guessing unsupported CLI flags
  and installs broadly; use `--skill '*' --agent codex -y` instead

Blockers:

- the npm-installed entrypoint does not work
- the published package behaves materially differently from the repo-local
  entrypoint

## Gate 9: release execution

Only after Gate 0-8 all pass should the actual release happen.

- [ ] final version number confirmed
- [ ] working tree is clean and only contains intended release changes
- [ ] the release commit is recorded
- [ ] `CHANGELOG.md` points at the current versioned release note
- [ ] the versioned release note draft input has been regenerated from the
      intended git range when release copy is being refreshed
- [ ] `docs/releases/<version>.md` exists and is filled in without placeholder text
- [ ] prerelease publishes use `npm publish --tag beta`
- [ ] `latest` is only promoted after post-publish readback succeeds
- [ ] real `npm publish` executed
- [ ] post-publish npm page, dist-tags, and install commands read back successfully

Minimum post-publish readback:

```bash
npm view zk-agent-cli version
npm view zk-agent-cli dist-tags --json
npx zk-agent-cli --help
```

Prefer the supported wrapper for the actual post-publish path:

```bash
pnpm release:publish --tag beta --promote-latest
```

If you run the three manual readback commands yourself, run them from a
neutral working directory rather than the repo root. The workspace root now
declares `devEngines.packageManager = pnpm`, and that can make `npm view` or
`npx` fail for the wrong reason when the current cwd is the repository.

Dist-tag policy:

- publish prereleases with `npm publish --tag beta`
- promote `latest` explicitly with:

```bash
npm dist-tag add zk-agent-cli@<version> latest
```

- only do that `latest` promotion after:
  - version readback is correct
  - `beta` points at the expected version
  - at least one package-outside-the-repo smoke passes

## Current published baseline

- current public beta completed on `2026-08-27`:
  `zk-agent-cli@0.1.0-beta.11`
- post-publish npm readback:
  - `npm view zk-agent-cli version -> 0.1.0-beta.11`
  - `npm view zk-agent-cli@latest version -> 0.1.0-beta.11`
  - `npm view zk-agent-cli@beta version -> 0.1.0-beta.11`
  - `npm view zk-agent-cli dist-tags --json -> {"latest":"0.1.0-beta.11","beta":"0.1.0-beta.11"}`
- post-publish clean-machine smoke:
  - `npx --yes zk-agent-cli@latest --help` ran successfully outside the repository
  - the same readback was run from a host on Node `20.10.0`, so npm emitted
    the expected `EBADENGINE` warnings because the package support floor
    remains `node >=24`
  - the first publish attempt through the host-default `npm` runtime also
    failed for the same reason:
    it executed under Node `20.10.0`, while the package now hard-fails
    `release:check` below Node `24`
  - rerunning `npm-cli.js publish` under the explicit supported runtime
    `Node 24.14.1` succeeded and is now part of the practical publish
    checklist for this repository
  - the broader installed-package JSON smoke still came from the prepublish
    `release:check` gate:
    its clean-machine tarball install executed `zk-agent defaults --json` and
    `zk-agent wallet smart-account profiles --json` outside the repository
- current workspace gate additions since that publish:
  - `release:check` now also rejects drift across package README, root README,
    `skills/`, packed top-level help, packed `wallet --help`, packed
    `workflow --help`, and active-version references in the repo state docs
  - `release:sync-version` now also keeps `CHANGELOG.md` and
    `docs/releases/<version>.md` in sync with the current version metadata
  - `release:draft-notes` can now upsert a repo-owned `Draft Input` block in
    `docs/releases/<version>.md` from a chosen git range before the final
    editor pass
  - `release:publish` now pins `npm` / `npx` resolution to the current Node
    runtime, runs npm readback from a neutral temp directory, and can publish,
    smoke, and optionally promote `latest` without repo-root cwd surprises
  - `release:check` now rejects a missing or placeholder-filled versioned
    release note for the current package version
  - `release:check` also rejects Node `<24` and any `pnpm` version other than
    the workspace-declared `pnpm@10.30.3`

## Historical lessons already baked into the gate

- an earlier published beta exposed a hosted-relay packaging regression where
  the public relay contract existed but the bundled connector UI was not
  actually available
- the current `release:check` now prevents that class of failure by requiring
  the installed tarball to pass hosted-relay readiness and share-link
  entrypoint checks before publish

## Post-release follow-up to keep

- rerun `npm install -g zk-agent-cli` then `zk-agent --help` from a directory
  outside the repository
- keep the release runtime aligned with `node >=24` and `pnpm@10.30.3` unless
  the declared support floor is intentionally changed first
- keep the root README, package README, and `skills/` aligned with the actual
  published surface

## Go / No-Go rule

It is only `GO` when all of the following are true:

1. Gate 0-9 are all `PASS`
2. there are no validation blind spots caused by environment shortcuts
3. public release copy only covers the real shipped capability boundary

Otherwise the answer is `NO-GO`.
