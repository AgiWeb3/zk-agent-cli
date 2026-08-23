# zk-agent-cli Project State

## Snapshot

- Last updated: 2026-08-23
- Latest commit at write time: `411504b`
- Current branch: `main`
- Working tree status when this document was written: dirty with workflow
  state/plan refresh based on the latest `polygon-agent-cli` comparison

## Current status

The product baseline is already closed for the core zkSync-native path:

- `zk-agent-cli@0.1.0-beta.10` is live and both npm dist-tags `beta` and
  `latest` point there
- the public package, local-first wallet/session lifecycle, hosted relay path,
  and flagship `workflow pay` AA flow all exist and have real validation proof
- the current work is productization closeout and public-surface hardening, not
  missing chain mechanics
- broader DeFi breadth remains deferred unless explicitly resumed

### Release-stage assessment

Current judged release stage:

- stay on `beta`
- do not claim `rc` readiness yet
- do not move to `1.0.0` yet

Why the project is still `beta`:

- the core chain path is proven, but the product contract is not fully closed
- the main remaining gaps are productization gaps, not missing zkSync
  execution mechanics
- the biggest blockers are still:
  - hosted approval is validated, but not yet specified and exercised as an
    operated product contract
  - release/version/doc discipline is still too manual for a formal release
  - the public machine-readable contract is much better now, but it is not yet
    frozen as a formal compatibility surface

Gate to move from `beta` to `rc`:

1. one canonical operator path is fully aligned across root README, package
   README, CLI help, skills, and runtime JSON contracts
2. hosted approval has an explicit operated contract:
   supported deployment shape, `publicOrigin`, persistence model, TTL/expiry,
   restart behavior, and approval/status URL semantics
3. release flow is repeatable without relying on operator memory:
   packaged install, version sync, dist-tag behavior, README/help sync, and
   release validation all run as one stable gate
4. public machine-readable contracts are intentionally frozen for the main
   operator path:
   `onboardingSummary`, `workflowEntrySummary`, `walletApprovalSummary`, and
   the corresponding next-step command surfaces are treated as compatibility
   boundaries
5. local recovery and hosted recovery semantics are stable:
   no known state-confusion bug around approval readiness, local signer
   readiness, relay-pending state, or expired requests on the default path

Gate to move from `rc` to `1.0.0`:

1. all `rc` gates stay closed under repeated real release validation
2. at least one additional zkSync-native product slice beyond flagship
   `workflow pay` is packaged as a real surface, most likely discovery,
   funding, or paymaster readiness
3. two consecutive end-to-end release rehearsals complete without contract
   churn on the public default path
4. no known release-blocking issue remains on:
   packaged install, local-first wallet bootstrap/recovery, hosted approval,
   or flagship `workflow pay`

Not required for `1.0.0`:

- broad DeFi feature-count parity with Polygon
- full ecosystem/app parity
- broad AA profile expansion beyond the current `sed-lite` default path
- resuming the deferred DeFi backlog by default

### Current priorities

This repository is now in a product-shell phase, not a chain-mechanics phase.

Current ordered priorities:

1. simplify the public shell and onboarding around one obvious operator path
2. define an operated hosted-approval baseline beyond the current prototype
3. reduce release/version/doc drift through stronger automation
4. package the next zkSync-native product vertical after `workflow pay`
5. keep broader DeFi breadth deferred unless it is deliberately resumed

Current interpretation after the latest `polygon-agent-cli` comparison:

- the remaining gap is mostly public-facing productization, not missing core
  execution capability
- the strongest current assets are still:
  - local-first wallet/session lifecycle
  - signer/session separation
  - zkSync-native AA/paymaster depth on `sed-lite`
  - workflow-first operator recovery
- the biggest remaining weakness is that the repo still exposes too much
  internal complexity at the public surface compared with the Polygon
  reference

Architecture baseline to keep fixed:

- signer/session separation is landed end to end for the current product path
- relay/browser approval can restore approval metadata without claiming local
  write readiness
- the legacy `sessionPayload.sessionPrivateKey` mirror remains compatibility
  baggage, not an active roadmap item
- `docs/14-best-session-model.md` still describes the longer-term design
  direction, but that architecture question is no longer blocking release work

Current workstreams:

1. public shell and onboarding
   - keep the root README short and front-door-oriented
   - keep the package README as the canonical operator manual
   - keep `setup`, `next`, `doctor`, and `wallet create|reapprove` aligned on
     one first-run story
   - current baseline improvement:
     `setup` now defaults the validated first-run path to `zksync-sepolia`
     plus the local connector at `http://localhost:4444`, and the CLI help,
     root README, package README, and primary skills now all say that
     explicitly
   - runtime contract improvement:
     `setup`, `next`, and `doctor` now emit a shared machine-readable
     `onboardingSummary`, while the runtime `workflow` entry commands now emit
     a shared `workflowEntrySummary` across `plan/start/pay/auto/run/status/
     next/resume` so the public operator path stays stable for both humans and
     agent wrappers
   - preserve the current public default:
     no custom `.env` is normally required until the operator intentionally
     switches to custom live infrastructure
2. hosted approval productization
   - keep the validated hosted path, but move past single-host/file-backed
     assumptions
   - make `publicOrigin`, deployment scope, state backend, and approval URL
     behavior an explicit operated contract
   - keep real hosted smoke coverage on the intended deployment mode, not only
     local prototype semantics
3. release/version/doc discipline
   - keep `release:sync-version` and `release:check`
   - reduce the remaining manual publish, dist-tag, changelog, and repo-doc
     sync steps
   - keep the release-stage docs, hosted operated-baseline doc, and packaged
     onboarding JSON contract under the same machine-checked release gate
   - current baseline improvement:
     `release:sync-version` now also maintains `CHANGELOG.md` plus a
     versioned `docs/releases/<version>.md` release artifact scaffold, and
     `release:draft-notes` can upsert the repo-owned `Draft Input` block for
     that version from a chosen git range
   - target one repeatable release flow that does not rely on hand-auditing
     version references after publish
4. post-flagship product slice
   - do not chase Polygon feature count directly
   - choose one real zkSync-native vertical after `workflow pay`, most likely
     around discovery, funding, or paymaster readiness rather than generic DeFi
     sprawl
5. DeFi breadth remains explicit backlog only
   - broader swap/deposit/withdraw coverage should not silently take back the
     main roadmap without an explicit product decision

### Current validated product baseline

- hosted relay approval is proven end to end:
  - public hosted relay inspection and hosted share-link/UI validation passed
  - real browser-mediated hosted approval completed for `sed-lite-sa-v2`
    through request `53328a56`
- the flagship AA pay path is proven:
  - `workflow pay` is the canonical zkSync-native flagship path
  - approval-based broadcast succeeded on `sed-lite-sa-v2` with tx hash
    `0x7904ecaad5edfee1f84dbdc4f83aaf2d577b7875fab060e8e272d7aa2697e7e0`
  - workflow request `d5181c7e` resolved back to `ready`
- release discipline is real:
  - `release:check` covers packaged install, hosted relay entrypoint, runtime
    floor, and package README contract
  - `release:check` now also enforces the release-stage docs, the hosted
    operated-baseline doc, and the packaged `setup/next/doctor`
    `onboardingSummary` contract
  - `release:check` now also rejects missing or placeholder-filled current
    release notes, so changelog/release artifact drift is no longer only a
    manual review concern
  - `release:draft-notes` has been validated on `0.1.0-beta.9` and can
    refresh the versioned release note's git-derived draft block without
    manual copy/paste
  - `pnpm validate:release` has passed on the supported host runtime
- the managed sandbox can still produce false negatives for local relay listen
  or DNS, so real release/runtime checks should continue to be verified from
  the host shell when needed

## Project goal

Build `zk-agent-cli` as a zkSync / ZK Stack counterpart to
`polygon-agent-cli`, while keeping the reusable three-part system shape:

- CLI entrypoint
- browser connector UI
- shared session / relay / crypto protocol

This repository is not intended to be a rename-level fork of
`polygon-agent-cli`. The reusable skeleton is kept, while Polygon /
Sequence-specific implementation is replaced with zkSync-native provider
boundaries.

## What exists right now

### Workspace and package layout

Active packages:

- `packages/zk-agent-cli`
- `packages/zk-connector-ui`
- `packages/agent-session-protocol`
- `packages/agent-core`
- `packages/provider-zksync-wallet`
- `packages/provider-zksync-defi`
- `packages/agent-tools`
- `packages/plugin-identity`
- `packages/paymaster-test-assets`
- `packages/account-profiles`

### CLI and workflow surface

Implemented command areas include:

- `setup`
- `wallet create/import/list/address/remove`
- `wallet status`
- `wallet next`
- `wallet sync`
- `wallet export`
- `wallet restore`
- `wallet reapprove`
- `wallet paymaster set`
- `wallet request show/list/await-local/approve-local`
- `wallet smart-account profiles/predict/deploy`
- `wallet smart-account sed-lite ...`
- `wallet smart-account daily-spend-limit ...`
- `balances`
- `fund`
- `send`
- `send-token`
- `call`
- `swap`
- `bridge`
- `bridge-status`
- `deposit`
- `deposit-status`
- `withdraw`
- `withdraw-status`
- `withdraw-finalize`
- `workflow plan/start/run/status/resume/list/show/update/delete`
- `agent status/show/set/export/import/clear`
- top-level / wallet / workflow / wallet-request / smart-account help surfaces
  are now explicitly product-ordered around the canonical `next -> wallet ->
  workflow` path instead of the internal implementation order

### Agent-facing tool surface

`packages/agent-tools` now exposes real wrappers for:

- wallet lifecycle and approval orchestration
- wallet status and next-step guidance
- workflow planning, execution, checkpointing, and resume
- the flagship native-send tool preset through `workflowPayTool`
- balances
- contract reads and writes
- send / send-token
- swap preview
- bridge preview/status
- deposit preview/status
- withdraw preview/status/finalize preview
- smart-account plan/deploy wrappers
- local agent profile read/write wrappers
- `pnpm tool:list` / `pnpm tool:run -- --list` as the machine-readable tool
  registry surface, including:
  - grouped tool discovery
  - closest CLI equivalents
  - `operatorPathStage` for the canonical product path
  - `recommendedSequence` for the default stage order, now with
    `workflowPayTool` as the primary guided-execution entry
  - `exampleInput` on the key operator-path tools, now covering the main
    wallet/workflow inspection and checkpoint entry surfaces such as
    `wallet status|next`, `workflow plan|pay|status|next|run|start`, and
    `assets`
- smoke scripts for:
  - canonical operator-path preview validation
  - readonly provider access
  - lifecycle recovery
  - SED policy validation
  - paymaster-backed smart-account success path
  - validated default swap success path
  - product-path orchestration aggregation
  - withdraw follow-up through finalize preview/broadcast boundaries

### Session and wallet model

The local wallet/session model already supports:

- execution address vs owner address split
- stored session metadata and local write readiness
- approved local session import
- export / restore
- restore-time reapproval
- CLI and agent-tools session guardrail presets, including:
  - `full-access`
  - `transfer-only`
  - `contract-only`
  - `readonly`
  - workflow/tool-side `intent` derivation for guided session recovery
- deployed smart-account metadata refresh through `wallet sync`

### Local agent identity model

`packages/plugin-identity` is no longer placeholder-only.

The current shipped shape is intentionally local-first:

- one saved agent profile in `~/.zk-agent/agent/profile.json`
- stable local metadata fields such as name, description, uri, tags,
  capabilities, and free-form key/value metadata
- optional linkage to one stored wallet record for operator/harness context
- portable export/import bundle for cross-machine or harness handoff
- CLI surface through `zk-agent agent status|show|set|export|import|clear`
- agent-tools surface through `getAgentProfileTool`, `setAgentProfileTool`,
  `exportAgentProfileTool`, and `importAgentProfileTool`

What is still intentionally missing:

- no claim that this is a zkSync-native onchain identity standard
- no built-in reputation scoring model
- no external publish/register flow yet

### AA and account model

Current built-in AA profiles:

- `sed-lite`
- `daily-spend-limit`

Current posture:

- `sed-lite` is the main built-in AA base profile
- future AA defaults, acceptance, and operator examples should stay on
  `sed-lite`
- `daily-spend-limit` remains a narrower experiment
- `daily-spend-limit` is now kept for constrained policy coverage and targeted
  regression/control-wallet validation, not as the repository baseline

What is already validated:

- EraVM artifact compilation for both profiles
- live Sepolia `predict` and `deploy` for `sed-lite`
- live Sepolia `predict` and `deploy` for `daily-spend-limit`
- `sed-lite` self-call account management
- `sed-lite` validation-hook pipeline
- `NativePerTxLimitHook` live policy rejection on Sepolia
- approval-based paymaster execution under the validated `sed-lite` path

Relevant deployed addresses already validated in this repo:

- `sed-lite-sa-v1`
  `0x26920E7b9c7478C1227f27613BaDe04eF2ddE7bC`
- `sed-lite-sa-v2`
  `0x60E5E483DC4315f3db1185aF08499ce9a4C862CE`
- `daily-spend-limit-sa`
  `0x271bEEaE75462eabdE3632A624B17FF163504CA2`
- `NativePerTxLimitHook`
  `0xC709133f19aEaa635492c000795f8f274d13aE22`

### Paymaster status

Paymaster is no longer a placeholder. The validated state is:

- `none`
- `sponsored`
- `approval-based`

What has been validated:

- sponsored preview works with the self-deployed EraVM paymaster
- sponsored live broadcast works on Sepolia
- smart-account sponsored live broadcast is validated on `sed-lite-sa-v2`
  with tx hash:
  `0x7a6c4c7ca36ce3b5ec875a3ccb6b37e79dcd2f48574c6dd679ded5513da7d5db`
- approval-based preview / estimation works on the validated EraVM fee-token
  path
- approval-based live broadcast works when both the fee token and paymaster are
  native EraVM deployments
- smart-account approval-based live broadcast is validated on `sed-lite-sa-v2`
  with tx hash:
  `0x2783de9185bcd6af21822c9c0ffa35e5329e96c8137ff41598d3cd001344ce8c`
- real hosted relay reapprove is now validated on `sed-lite-sa-v2` through the
  encrypted relay payload/browser path with request:
  `53328a56`
- the latest flagship post-fix native-send write-path acceptance now also sits
  on `sed-lite-sa-v2`
  with tx hash:
  `0x7904ecaad5edfee1f84dbdc4f83aaf2d577b7875fab060e8e272d7aa2697e7e0`

What remains constrained:

- approval-based compatibility is not generic for any ERC-20
- older EVM-interpreter token paths can still fail with `SystemContext`-style
  validation errors
- fee-token compatibility must be treated as a validated matrix, not inferred
  from ERC-20 compliance

### Bridge, deposit, withdraw, and swap status

Implemented and at least partially validated:

- `bridge`
  - supported `ethereum-sepolia <-> zksync-sepolia` route
  - status tracking
- `deposit`
  - preview
  - broadcast
  - status
- `withdraw`
  - preview
  - broadcast
  - status
  - finalize preview
  - finalize broadcast
- `swap`
  - Uniswap V3 exact-input-single request shaping
  - SyncSwap classic single-pool request shaping
  - allowance preflight and optional auto-approve
  - pool/router preflight and quote checks

Recent Sepolia validations already completed:

- live preview `smoke:product-path -- --wallet paymaster-eoa`
  now succeeds outside the sandbox and validates:
  - canonical operator-path preview
  - validated approval-based paymaster preview path
  - machine-readable `followups` and `nextCommands` aggregation
- live preview `smoke:operator-path -- --wallet paymaster-eoa --amount 0.00001`
  still succeeds outside the sandbox on the current branch and now returns:
  - `phase = goal-executed`
  - a top-level broadcast-ready `recommendedCommand`
  - the validated approval-based paymaster registry/default path in both the
    direct payload and the summarized follow-up metadata
- live preview `smoke:product-path -- --wallet paymaster-eoa`
  still succeeds outside the sandbox on the current branch and confirms that:
  - `operator-path` and `paymaster-success` both pass in preview mode
  - the aggregated `summary.followups` still preserve registry and agent
    follow-up metadata across the two-step product path
- the previous broken local `main` record was preserved as
  `main-broken-20260713`; its blocker state was a purely local wallet-record
  issue, not a new chain-side regression:
  - signer mismatch
  - undeployed smart-account state
- the healthy approval-based EOA record previously stored as `paymaster-eoa`
  has now been promoted back to local `main`
- live preview `smoke:operator-path -- --wallet main --amount 0.00001`
  now succeeds again outside the sandbox and confirms that the repaired local
  `main` baseline is usable for operator-path preview:
  - `phase = goal-executed`
  - a top-level broadcast-ready `recommendedCommand`
  - the validated approval-based paymaster registry/default path is resolved in
    the goal preview payload for `main`
- live preview `smoke:swap-success -- --wallet main`
  now succeeds outside the sandbox and confirms that:
  - the validated tracked-default SyncSwap path resolves directly from the
    registry
  - the preview reaches `goal-executed`
  - the live quote and allowance-preflight metadata are returned in the
    normalized payload
  - the smoke now defaults to `--paymaster-mode none`, so swap-path validation
    is not blocked by an incompatible wallet paymaster
- live preview `zk-agent workflow swap --wallet main --protocol uniswap-v3-exact-input-single ... --paymaster-mode none`
  now also succeeds outside the sandbox on a real Sepolia `WETH/TKA @ 3000`
  Uniswap V3 pool and confirms that:
  - the explicit-router/manual Uniswap path itself is live
  - the router resolves factory
    `0x8FdA5a7a8dCA67BBcDd10F02Fa0649A937215422`
  - the selected pair resolves pool
    `0x0676Dc17562adD8778213b872B680ec170D101cD`
  - but the current swap-registry model is still protocol-level, so this
    pair-specific evidence is not yet enough to promote the generic
    `uniswap-v3-exact-input-single` entry without overclaiming broader pair
    validation
- live preview `smoke:operator-path -- --wallet main --paymaster-mode none --amount 0.00001`
  now succeeds outside the sandbox and confirms that:
  - the top-level recommended workflow command preserves the explicit
    `--paymaster-mode none` override
  - the workflow goal preview resolves
    `zksync-sepolia-no-paymaster` as the paymaster registry entry
  - that registry entry now reports `status = validated` and
    `isValidatedDefaultForMode = true` for the EOA baseline
- live preview `smoke:operator-path -- --wallet sed-lite-sa-v2 --paymaster-mode none --amount 0.00001`
  now succeeds outside the sandbox and confirms that:
  - the same explicit `--paymaster-mode none` override works on the deployed
    `sed-lite-sa-v2` smart-account baseline
  - the workflow goal preview still resolves
    `zksync-sepolia-no-paymaster` as the paymaster registry entry
  - the path is now strong enough to treat `smart-account` as separately
    live-validated for the no-paymaster mode
- the tracked `zksync-sepolia-no-paymaster` registry entry is now promoted
  from supported to validated for both EOA and smart-account and becomes the
  current validated default for `--paymaster-mode none`
- live preview `smoke:product-path -- --wallet main`
  now succeeds outside the sandbox and confirms that:
  - `operator-path`, `paymaster-success`, and `swap-success` all pass in one
    product-level preview chain
  - the aggregated `summary.followups` preserve registry, agent, and next-step
    metadata across all three steps
- native L2 withdraw broadcast from `paymaster-eoa`:
  `0xea192d3fda23a747328c1d63b6d2e22664fd353511faf327ba8f28c408800ba8`
- `pnpm zk-agent withdraw-status --wallet main --tx-hash 0xea192d3fda23a747328c1d63b6d2e22664fd353511faf327ba8f28c408800ba8 --chain zksync-sepolia`
  now reaches `status = finalized`, with the enclosing L1 batch already
  `verified` and carrying `executeTxHash`
- `pnpm zk-agent withdraw-finalize --wallet main --tx-hash 0xea192d3fda23a747328c1d63b6d2e22664fd353511faf327ba8f28c408800ba8 --chain zksync-sepolia`
  now succeeds in preview mode and returns concrete `finalizeDepositParams`
  plus a `16`-hash Merkle proof; only the actual L1 finalize broadcast remains
  intentionally unvalidated
- `pnpm zk-agent tokens --wallet main --owned`
  now also surfaces per-token shared-bridge mapping status on zkSync chains;
  on the live `main` wallet, both held `ZKAT` balances resolve as
  `local-only-or-unmapped`, which matches the current `asset-id-mismatch`
  withdraw/bridge failures

### Connector UI status

The connector is no longer just a blank scaffold, but it is not yet product-
grade parity with the reference repo.

Current state:

- local approval round-trip exists
- waiting CLI process can consume approved local payloads
- `--await-local` flows are covered
- relay/manual approval is implemented end-to-end
- real public-relay remote-operator validation now exists on the current
  baseline, including browser-mediated encrypted-payload approval on
  `sed-lite-sa-v2`
- the connector now preserves the submitted encrypted payload/code pair for the
  active request, so relay polling/manual refresh does not drift the visible
  approval code away from the payload already posted to the relay
- the remaining gap is polish/hardening on the hosted path, not missing
  protocol coverage or missing real-user proof

## Known environment constraint

In the Codex sandbox used for this repo, public RPC hostname resolution is not
reliable.

Important rule:

- if `sepolia.era.zksync.dev` or another public RPC fails inside the sandbox,
  do not treat that as proof that the endpoint is down
- retry from the host shell or an approved unsandboxed command before drawing a
  conclusion

## Main gap versus `polygon-agent-cli`

The remaining gap versus the local `../polygon-agent-cli` reference is no
longer raw chain mechanics. After re-reading the reference repo's root README,
package README, release setup, and skill split, the shortfalls that still
matter are:

1. public shell simplicity:
   the Polygon root README is a thin front door and its package README is the
   obvious public manual; `zk-agent-cli` still exposes more root-level process
   and state detail than a first-time user should need
2. zero-setup onboarding tightness:
   the Polygon reference gets closer to install -> login -> fund -> operate,
   while `zk-agent-cli` still surfaces more early decisions around setup,
   local-vs-hosted approval, and custom environment expectations
3. operated hosted-approval baseline:
   the reference has a clearer hosted login UI + relay deployment shape;
   `zk-agent-cli` has validation proof but still behaves more like a validated
   prototype than a well-defined operated service
4. release/changelog discipline:
   the reference already has repo-level changeset workflow and changelog
   output; `zk-agent-cli` has runtime validation gates, but the overall
   release path is still more manual
5. post-flagship product slices:
   the reference exposes distinct verticals such as discovery and polymarket;
   `zk-agent-cli` intentionally should not copy those, but it still needs one
   clearer zkSync-native vertical beyond the current flagship pay path

Important counterpoint:

- `zk-agent-cli` is already ahead in workflow explicitness
- relay/manual approval recovery is deeper than the reference baseline
- zkSync-native AA/paymaster/policy handling is richer than the Polygon
  reference

So the remaining work is the public-facing product shell plus one more real
product slice, not missing core execution capability.

## Deferred product areas

Active order:

1. broader DeFi / ERC-20 breadth, only when explicitly resumed
2. ecosystem-specific vertical workflows, only if real zkSync-native demand
   justifies them
3. broader identity / reputation framework, only if the current local-first
   profile model stops being enough
4. passkey / multisig / broader AA module expansion, only after the default
   single-operator path is settled
5. broader ZK Stack chain expansion, only after the zkSync Era baseline is
   materially more mature

## Most important files to read first

Start here:

- [README.md](./README.md)
- [PLANS.md](./PLANS.md)
- [AGENTS.md](./AGENTS.md)

Then read the current implementation boundary:

- [packages/zk-agent-cli/src/commands/workflow.ts](./packages/zk-agent-cli/src/commands/workflow.ts)
- [packages/zk-agent-cli/src/commands/operations.ts](./packages/zk-agent-cli/src/commands/operations.ts)
- [packages/agent-core/src/workflow-run.ts](./packages/agent-core/src/workflow-run.ts)
- [packages/agent-tools/src/create-toolset.ts](./packages/agent-tools/src/create-toolset.ts)
- [packages/provider-zksync-wallet/src/provider.ts](./packages/provider-zksync-wallet/src/provider.ts)
- [packages/provider-zksync-defi/src/index.ts](./packages/provider-zksync-defi/src/index.ts)
- [packages/account-profiles/src/profiles.ts](./packages/account-profiles/src/profiles.ts)

## Practical restart checklist

When resuming work in a new environment:

1. Run `pnpm install`.
2. Confirm the root `.env` still points to the intended Sepolia resources.
3. Run `pnpm typecheck`.
4. Run `pnpm build`.
5. Run the smallest relevant tests for the area you are touching.
6. If chain verification is needed, prefer an unsandboxed host-shell command
   when sandbox DNS is suspect.
