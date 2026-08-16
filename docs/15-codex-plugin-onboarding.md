# Codex Plugin Onboarding

This note covers the native local-plugin path for the checked-out repository.

Use this path when you want Codex to load the repository through
`.codex-plugin/plugin.json` instead of using the external repo-skill install
flow.

## What the repo now ships

- root plugin manifest:
  - `.codex-plugin/plugin.json`
- bundled plugin skills:
  - `skills/`
- local bootstrap helper:
  - `pnpm codex:plugin:doctor`
  - `pnpm codex:plugin:install-local`

The helper targets the default personal marketplace path:

```text
~/.agents/plugins/marketplace.json
```

and the default personal plugin source path:

```text
~/plugins/zk-agent-cli
```

The install helper creates or updates both:

- a marketplace entry for `zk-agent-cli`
- a symlink from `~/plugins/zk-agent-cli` to this checked-out repository

## Recommended local flow

1. Inspect the current local state:

```bash
pnpm codex:plugin:doctor
```

2. Wire the repository into the default personal marketplace:

```bash
pnpm codex:plugin:install-local
```

3. Install the plugin from Codex:

If your Codex build exposes the plugin command:

```bash
codex plugin add zk-agent-cli@personal
```

If your Codex build does not expose that top-level command, open Codex or the
desktop app, enter:

```text
/plugins
```

Then install `zk-agent-cli` from the Personal marketplace.

4. Start a new Codex session before testing the installed plugin.

## Current local status

On the maintainer machine used for this repository, after upgrading to
`codex-cli 0.147.0`, the full native install path now works:

- `pnpm codex:plugin:install-local`
- `codex plugin marketplace list --json`
- `codex plugin add zk-agent-cli@personal --json`
- `codex plugin list --json`

That install writes the cached plugin under:

```text
/Users/mac/.codex/plugins/cache/personal/zk-agent-cli/0.1.0-beta.9
```

and reports the installed source as:

```text
~/plugins/zk-agent-cli
```

## Compatibility caution

Do not assume every Codex build exposes the same install surface. Older builds
may not expose the `codex plugin` top-level subcommand even when newer builds
do. When that command is missing, use `/plugins` after the marketplace wiring
step instead of guessing hidden flags.

## What `pnpm codex:plugin:doctor` checks

- Codex availability on `PATH`
- `codex --version`
- whether `codex plugin --help` succeeds
- whether `.codex-plugin/plugin.json` exists and matches `zk-agent-cli`
- whether `~/.agents/plugins/marketplace.json` already contains the expected
  local entry
- whether `~/plugins/zk-agent-cli` already points at this repository

## What `pnpm codex:plugin:install-local` changes

- creates `~/plugins/zk-agent-cli` when missing
- points that path at this repository with a symlink
- creates or updates `~/.agents/plugins/marketplace.json`
- preserves the existing marketplace name when one already exists

It intentionally fails when `~/plugins/zk-agent-cli` already exists but points
at a different directory. Fix that mismatch deliberately instead of letting the
helper silently overwrite another local plugin source.
