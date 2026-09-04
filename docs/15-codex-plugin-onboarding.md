# Codex Plugin Onboarding

Use this path only when you want Codex to load the checked-out repository
through `.codex-plugin/plugin.json`.

Do not use this note for the normal CLI path. For the terminal CLI, use the
root [README.md](../README.md), the package
[README.md](../packages/zk-agent-cli/README.md), or
[skills/QUICKSTART.md](../skills/QUICKSTART.md).

## What this path assumes

The repository ships:

- `.codex-plugin/plugin.json`
- `skills/`
- `pnpm codex:plugin:doctor`
- `pnpm codex:plugin:install-local`

The helper wiring targets the default personal marketplace file:

```text
~/.agents/plugins/marketplace.json
```

and the default personal source path:

```text
~/plugins/zk-agent-cli
```

## Short local flow

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

## What the helper changes

`pnpm codex:plugin:install-local` creates or updates:

- a Personal marketplace entry for `zk-agent-cli`
- a symlink from `~/plugins/zk-agent-cli` to this checked-out repository

After install, Codex usually caches the installed plugin under a personal cache
path such as:

```text
~/.codex/plugins/cache/personal/zk-agent-cli/<installed-version>
```

and reports the installed source as:

```text
~/plugins/zk-agent-cli
```

## What `codex:plugin:doctor` checks

- Codex availability on `PATH`
- `codex --version`
- whether `codex plugin --help` succeeds
- whether `.codex-plugin/plugin.json` exists and matches `zk-agent-cli`
- whether `~/.agents/plugins/marketplace.json` already contains the expected
  local entry
- whether `~/plugins/zk-agent-cli` already points at this repository

## Compatibility note

Do not assume every Codex build exposes the same install surface. Older builds
may not expose the `codex plugin` top-level subcommand even when newer builds
do. When that command is missing, use `/plugins` after the marketplace wiring
step instead of guessing hidden flags.

It intentionally fails when `~/plugins/zk-agent-cli` already exists but points
at a different directory. Fix that mismatch deliberately instead of letting the
helper silently overwrite another local plugin source.
