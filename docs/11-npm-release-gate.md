# npm Release Gate

This checklist was originally created to decide whether `zk-agent-cli` was
ready for its first public npm release. The first public beta was completed on
`2026-07-31`, and the same gate now remains the release checklist for future
beta or stable cuts.

The goal is not to prove that the project has "many features". The goal is to
prove that:

1. the package can be published and used legitimately
2. a new user can complete the shortest success path using only the npm package
   and the README
3. the publicly claimed capability surface is covered by local validation

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

Pass criteria:

- `npm whoami` returns the expected account
- if the package has not been published yet, `npm view` should not return an
  already-published version that conflicts with the planned release
- `npm publish --dry-run` does not fail with packaging or permission errors

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
      `setup -> next -> wallet create/reapprove -> next -> workflow auto`
- [ ] the local storage path `~/.zk-agent/`
- [ ] the minimum required environment variables, or when `.env` / RPC values
      are actually needed
- [ ] the shortest relay / remote-approval path
- [ ] common failures and the shortest repair actions

Pass criteria:

- a first-time user can get through the first success path from the npm page
  README alone
- the current `release:check` script also enforces the minimum README anchors
  for install paths, shortest path, relay path, storage path, and common
  repair guidance so this gate is not purely manual anymore

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
  - `zk-agent defaults --json`
  - `zk-agent wallet smart-account profiles --json`
- the same tarball can also be installed into a temporary project outside the
  repository with `pnpm add --offline <tarball>` and the installed
  `zk-agent` / `zksync-agent` binaries still start correctly

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
- `pnpm validate:phase4a` is currently kept as a legacy alias for the same
  gate while older notes are being retired

Pass criteria:

- all sub-checks are green

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

Blockers:

- the checks were only run inside the restricted sandbox, so relay /
  await-local behavior is still unproven

## Gate 6: command surface and documentation must agree

Before public release, README text, skills, and CLI help must not contradict
each other.

- [ ] the root README install/run paths match the package README
- [ ] `skills/SKILL.md` and `skills/QUICKSTART.md` use the same canonical path
      as CLI help
- [ ] `zk-agent --help` exposes the same main capability surface claimed by the
      README
- [ ] docs no longer imply that an unpublished install surface is already live

Suggested checks:

```bash
pnpm zk-agent --help
pnpm zk-agent wallet --help
pnpm zk-agent workflow --help
```

Pass criteria:

- the same capability entrypoints, command names, and default path remain
  aligned across:
  - the package README
  - the root README / skills
  - CLI help

Blockers:

- the README claims one default path while CLI help claims another
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
- [ ] `zk-agent setup`
- [ ] `zk-agent next`
- [ ] at least one wallet create or reapprove path works in the target
      environment
- [ ] at least one `workflow auto` preview path works

Notes:

- if the release machine is not intended for live chain broadcast at this
  stage, at minimum complete the help, setup, next, and preview path

Blockers:

- the npm-installed entrypoint does not work
- the published package behaves materially differently from the repo-local
  entrypoint

## Gate 9: release execution

Only after Gate 0-8 all pass should the actual release happen.

- [ ] final version number confirmed
- [ ] working tree is clean and only contains intended release changes
- [ ] the release commit is recorded
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

## First beta release result

- first public beta completed on `2026-07-31`:
  `zk-agent-cli@0.1.0-beta.1`
- publishing-account readback:
  `npm whoami -> jerrygod`
- post-publish npm readback:
  - `npm view zk-agent-cli version -> 0.1.0-beta.1`
  - `npm view zk-agent-cli dist-tags --json -> {"beta":"0.1.0-beta.1","latest":"0.1.0-beta.1"}`
- post-publish clean-machine smoke:
  - `npx --yes zk-agent-cli --help` ran successfully outside the repository
  - but host Node `20.10.0` emitted `EBADENGINE` warnings because the package
    currently declares `node >=24`; that environment is outside the supported
    runtime floor

## Current published baseline

- current public beta completed on `2026-08-04`:
  `zk-agent-cli@0.1.0-beta.4`
- no newer local release candidate is prepared yet
- publishing-account readback:
  `npm whoami -> jerrygod`
- post-publish npm readback:
  - `npm view zk-agent-cli version -> 0.1.0-beta.4`
  - `npm view zk-agent-cli@latest version -> 0.1.0-beta.4`
  - `npm view zk-agent-cli@beta version -> 0.1.0-beta.4`
  - `npm view zk-agent-cli dist-tags --json -> {"latest":"0.1.0-beta.4","beta":"0.1.0-beta.4"}`
- post-publish clean-machine smoke:
  - `npx --yes zk-agent-cli@latest --help` ran successfully outside the repository
  - `npx --yes zk-agent-cli@latest defaults --json` ran successfully outside the repository
  - `npx --yes zk-agent-cli@latest wallet smart-account profiles --json` ran successfully outside the repository
  - `zk-agent-cli@0.1.0-beta.3` had a published hosted-relay regression:
    `npx --yes zk-agent-cli@latest --json relay serve --port 0 --public-origin https://relay.example.test`
    exposed the public relay contract, but still reported `connectorUiAvailable: false`
  - `zk-agent-cli@0.1.0-beta.4` fixes that published regression by correcting
    bundled connector-UI path resolution and tightening `release:check` so the
    installed tarball must pass the same hosted-relay readiness check before
    publish

## Post-release follow-up to keep

- rerun `npm install -g zk-agent-cli` then `zk-agent --help` from a directory
  outside the repository
- decide whether to keep `engines.node >=24` or lower the supported floor after
  validation
- keep the root README, package README, and `skills/` aligned with the actual
  published surface

## Go / No-Go rule

It is only `GO` when all of the following are true:

1. Gate 0-9 are all `PASS`
2. there are no validation blind spots caused by environment shortcuts
3. public release copy only covers the real shipped capability boundary

Otherwise the answer is `NO-GO`.
