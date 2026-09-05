# Operator JSON Contract

This document only describes the machine-readable outputs that are already
implemented, already covered by tests, and intended for operators or agent
harnesses.

The goal is not to restate every JSON payload field by field. The goal is to
stabilize the most important contracts on the default product path.

## Compatibility Boundary

This document is now the source of truth for the frozen machine-readable
operator contract on the default product path.

At the current `rc` stage, the intentionally frozen compatibility boundary is:

- `onboardingSummary`
- `workflowEntrySummary`
- `walletApprovalSummary`
- `suiteHandoffSummary`
- documented next-step command surfaces carried through:
  `recommendedCommands`, `nextAction`, `afterApproval`, and
  `afterApprovalStatus`

This boundary is intentionally narrower than "every JSON field emitted by the
CLI". Fields and command surfaces that are not documented here as current
stable contract are not frozen by default.

### Change policy

For the frozen contract set above:

1. Removing, renaming, or repurposing a documented stable field is a breaking
   change.
2. Changing the meaning or command shape of a documented stable follow-up
   command is a breaking change.
3. New fields may be added only when they are optional for existing callers,
   documented in this file, and covered by the same change's validation/tests.
4. If a breaking change is still required during `rc`, it must be called out
   explicitly in release notes and updated across docs/tests in the same
   changeset.

## Scope

The following outputs should currently be treated as the default operator
contract:

- `zk-agent setup`
- `zk-agent defaults`
- `zk-agent assets`
- `zk-agent balances --owned-tokens`
- `zk-agent tokens`
- `zk-agent resolve-token`
- `zk-agent doctor`
- `zk-agent next`
- `zk-agent relay serve`
- `zk-agent relay inspect`
- `zk-agent wallet next`
- `zk-agent wallet create --relay-url <url>`
- `zk-agent wallet reapprove --name <name> --relay-url <url>`
- `zk-agent wallet request relay-publish`
- `zk-agent wallet request relay-status`
- `zk-agent workflow plan`
- `zk-agent workflow start`
- `zk-agent workflow auto`
- `zk-agent workflow status`
- `zk-agent workflow next`
- `zk-agent workflow run`
- `zk-agent workflow resume`
- `zk-agent workflow list|show|update|delete`
- `zk-agent agent status|show`
- `pnpm smoke:operator-path`
- `pnpm smoke:product-path`
- `pnpm smoke:paymaster-success`
- `pnpm tool:run -- --list`

## Shared fields

### `ok`

All of these surfaces return top-level `ok: true|false`.

### `agentProfile`

Surfaces on the default operator path now return a summary of the local agent
identity state.

Field shape:

```json
{
  "profileExists": true,
  "status": "present",
  "agentId": "sed-operator",
  "name": "SED Operator",
  "activeWalletName": "main",
  "linkedWalletName": "main",
  "walletRelation": "linked-active-wallet",
  "tagCount": 1,
  "capabilityCount": 1,
  "metadataKeyCount": 1
}
```

Current stable semantics:

- `profileExists`
  Whether local `~/.zk-agent/agent/profile.json` exists.
- `status`
  Currently only `missing` or `present`.
- `walletRelation`
  Current stable values:
  - `missing`
  - `unlinked`
  - `linked-active-wallet`
  - `linked-other-wallet`

### `agentFollowup`

This is the local agent-identity follow-up companion to `agentProfile`. It is
not mixed into workflow or wallet execution follow-ups.

Field shape:

```json
{
  "status": "zk-agent agent status --wallet main",
  "show": "zk-agent agent show",
  "set": "zk-agent agent set --name <name> --wallet main",
  "linkWallet": "zk-agent agent set --wallet main",
  "nextAction": "zk-agent agent show"
}
```

Notes:

- `show`, `set`, and `linkWallet` appear selectively depending on context.
- `nextAction` is the default recommendation within this follow-up set.
- `agentFollowup` does not replace `recommendedCommands`; it only describes the
  local agent-identity dimension.

### `onboardingSummary`

`setup`, `doctor`, and top-level `next` now return the same compressed
onboarding contract so callers do not need to reverse-parse help text or
stage-specific prose.

Current stable fields:

- `stage`
- `baseline`
- `localOnly`
- `configExists`
- `walletExists`
- `approvalReady`
- `localExecutionKeyStored`
- `defaultChain`
- `connectorUrl`
- `relayUrl`
- `nextAction`
- `notes`

Current stable `stage` values:

- `setup`
- `wallet-bootstrap`
- `wallet-recovery`
- `wallet-ready`
- `workflow`

Current stable `baseline` values:

- `local-first`

Current semantics:

- `localOnly = true`
  The current recommendation is purely local-state driven and does not require
  live RPC inspection.
- `localOnly = false`
  The current recommendation depends on the live wallet/workflow path rather
  than just stored setup state.

### `recommendedPaths`

`setup`, `doctor`, and top-level `next` can now optionally return
`recommendedPaths` when the current guidance is still on an onboarding or
recovery path.

Current stable fields:

- `local`
- `remoteBrowser`

Current semantics:

- `local`
  Ordered commands for the canonical local-first path from the current scope.
- `remoteBrowser`
  Ordered commands for the remote-browser variant of that same path. This is
  omitted when no distinct remote-browser variant is relevant from the current
  scope.

### `relayApprovalPaths`

`relay serve` and `relay inspect` can now optionally return
`relayApprovalPaths` when the relay advertised enough compatibility to build
the relay-backed wallet approval path.

Current stable fields:

- `createWallet`
- `reapproveWallet`

Current semantics:

- `createWallet`
  Ordered commands for the relay-backed fresh-wallet path from the current
  relay surface.
- `reapproveWallet`
  Ordered commands for the relay-backed wallet-reapproval path from the
  current relay surface.

## `zk-agent setup`

`zk-agent setup` writes the validated first-run local defaults and returns the
same onboarding contract used by the rest of the canonical path.

Current stable top-level fields:

- `ok`
- `config`
- `onboardingSummary`
- `recommendedPaths`
- `recommendedCommands`
- `message`
  Present when config already exists and setup did not overwrite it.

Current stable `config` fields:

- `defaultChain`
- `connectorUrl`
- `provider`
- `createdAt`
- `updatedAt`

Current stable baseline defaults on the validated first-run path:

- `defaultChain = "zksync-sepolia"`
- `connectorUrl = "http://localhost:4444"`

Key fields:

```json
{
  "ok": true,
  "config": {
    "defaultChain": "zksync-sepolia",
    "connectorUrl": "http://localhost:4444",
    "provider": "zksync-sso"
  },
  "onboardingSummary": {
    "stage": "wallet-bootstrap",
    "baseline": "local-first",
    "localOnly": true,
    "configExists": true,
    "walletExists": null,
    "approvalReady": null,
    "localExecutionKeyStored": null,
    "defaultChain": "zksync-sepolia",
    "connectorUrl": "http://localhost:4444",
    "relayUrl": null,
    "nextAction": "zk-agent next"
  },
  "recommendedPaths": {
    "local": [
      "zk-agent setup",
      "zk-agent next",
      "zk-agent wallet create --await-local",
      "zk-agent next"
    ],
    "remoteBrowser": [
      "zk-agent setup",
      "zk-agent next",
      "zk-agent relay inspect --relay-url <url>",
      "zk-agent wallet create --relay-url <url> --wait-relay --prompt-code",
      "zk-agent next"
    ]
  },
  "recommendedCommands": {
    "next": "zk-agent next",
    "inspectDefaults": "zk-agent defaults",
    "createWallet": "zk-agent wallet create --await-local",
    "relayInspect": "zk-agent relay inspect --relay-url <url>",
    "createWalletRemote": "zk-agent wallet create --relay-url <url> --wait-relay --prompt-code",
    "afterWalletApproval": "zk-agent next"
  }
}
```

## `zk-agent doctor`

`zk-agent doctor` is the local-only onboarding and wallet-recovery diagnostic.
It inspects saved config, wallet approval metadata, local signer readiness,
and the shortest next command without requiring live RPC reads. Passing
`--relay-url` only makes remote approval fallback commands concrete; it does
not turn `doctor` into a live relay probe.

Current stable top-level fields:

- `ok`
- `scope`
- `walletName`
- `config`
- `wallet`
- `productEntrySummary`
- `onboardingSummary`
- `summary`
- `suiteHandoffSummary`
  appears when local readiness is clear enough that `doctor` can expose the
  broader post-flagship `suite` surface without changing its own local-only
  nextAction
- `agentProfile`
- `agentFollowup`
- `nextAction`
- `recommendedPaths`
- `recommendedCommands`

Current stable `scope` values:

- `setup`
- `wallet-bootstrap`
- `wallet-recovery`
- `wallet-ready`

Current stable `config` fields:

- `exists`
- when present:
  - `defaultChain`
  - `connectorUrl`
  - `provider`

Current stable `wallet` fields when present:

- `exists`
- `walletName`
- `walletAddress`
- `chain`
- `chainId`
- `accountKind`
- `smartAccountProfileId`
- `syncedAt`
- `approvalReady`
- `localExecutionKeyStored`
- `legacySessionKeyStored`
- `signerType`
- `signerAddress`
- `signerSource`

Current stable `summary` fields:

- `stage`
- `configExists`
- `walletExists`
- `approvalReady`
- `localExecutionKeyStored`
- `relayUrl`
- `nextAction`
- `localOnly`
- `notes`

`onboardingSummary` uses the shared onboarding field set documented above.
On `doctor`, its values are always local-state driven.

`productEntrySummary` uses the same stable field set documented on
`zk-agent next`, but on `doctor` it remains local-only and never skips ahead to
live workflow routing by itself.

### `scope = "setup"`

This means local config is missing.

Key fields:

```json
{
  "scope": "setup",
  "walletName": "main",
  "config": {
    "exists": false
  },
  "wallet": null,
  "productEntrySummary": {
    "view": "product-entry",
    "currentSurface": "doctor",
    "stage": "setup",
    "category": "bootstrap",
    "recommendedMode": "local-first",
    "nextSurface": "setup",
    "nextAction": "zk-agent setup",
    "suiteAvailable": false
  },
  "onboardingSummary": {
    "stage": "setup",
    "baseline": "local-first",
    "localOnly": true,
    "configExists": false,
    "walletExists": false,
    "approvalReady": null,
    "localExecutionKeyStored": null,
    "defaultChain": null,
    "connectorUrl": null,
    "relayUrl": null,
    "nextAction": "zk-agent setup"
  },
  "summary": {
    "stage": "setup",
    "configExists": false,
    "walletExists": false,
    "approvalReady": null,
    "localExecutionKeyStored": null,
    "relayUrl": null,
    "nextAction": "zk-agent setup",
    "localOnly": true
  },
  "nextAction": "zk-agent setup",
  "recommendedPaths": {
    "local": [
      "zk-agent setup",
      "zk-agent next",
      "zk-agent wallet create --await-local",
      "zk-agent next"
    ],
    "remoteBrowser": [
      "zk-agent setup",
      "zk-agent next",
      "zk-agent relay inspect --relay-url <url>",
      "zk-agent wallet create --relay-url <url> --wait-relay --prompt-code",
      "zk-agent next"
    ]
  },
  "recommendedCommands": {
    "setup": "zk-agent setup",
    "next": "zk-agent next",
    "inspectDefaults": "zk-agent defaults"
  }
}
```

### `scope = "wallet-bootstrap"`

This means local config exists, but the target wallet does not.

Key fields:

```json
{
  "scope": "wallet-bootstrap",
  "walletName": "main",
  "config": {
    "exists": true,
    "defaultChain": "zksync-sepolia",
    "connectorUrl": "http://localhost:4444",
    "provider": "zksync-sso"
  },
  "wallet": null,
  "onboardingSummary": {
    "stage": "wallet-bootstrap",
    "baseline": "local-first",
    "localOnly": true,
    "configExists": true,
    "walletExists": false,
    "approvalReady": null,
    "localExecutionKeyStored": null,
    "defaultChain": "zksync-sepolia",
    "connectorUrl": "http://localhost:4444",
    "relayUrl": "https://relay.example.com",
    "nextAction": "zk-agent wallet create --await-local"
  },
  "summary": {
    "stage": "wallet-bootstrap",
    "configExists": true,
    "walletExists": false,
    "approvalReady": null,
    "localExecutionKeyStored": null,
    "relayUrl": "https://relay.example.com",
    "nextAction": "zk-agent wallet create --await-local",
    "localOnly": true
  },
  "nextAction": "zk-agent wallet create --await-local",
  "recommendedPaths": {
    "local": [
      "zk-agent wallet create --await-local",
      "zk-agent next"
    ],
    "remoteBrowser": [
      "zk-agent relay inspect --relay-url https://relay.example.com",
      "zk-agent wallet create --relay-url https://relay.example.com --wait-relay --prompt-code",
      "zk-agent next"
    ]
  },
  "recommendedCommands": {
    "next": "zk-agent next",
    "inspectDefaults": "zk-agent defaults",
    "createWallet": "zk-agent wallet create --await-local",
    "relayInspect": "zk-agent relay inspect --relay-url https://relay.example.com",
    "createWalletRemote": "zk-agent wallet create --relay-url https://relay.example.com --wait-relay --prompt-code"
  }
}
```

### `scope = "wallet-recovery"`

This means a saved wallet exists, but approval metadata or local signer
readiness is incomplete.

Key fields when approval metadata is missing:

```json
{
  "scope": "wallet-recovery",
  "walletName": "main",
  "wallet": {
    "exists": true,
    "walletName": "main",
    "approvalReady": false,
    "localExecutionKeyStored": false
  },
  "summary": {
    "stage": "wallet-recovery",
    "configExists": true,
    "walletExists": true,
    "approvalReady": false,
    "localExecutionKeyStored": false,
    "relayUrl": "https://relay.example.com",
    "nextAction": "zk-agent wallet reapprove --name main --await-local",
    "localOnly": true
  },
  "nextAction": "zk-agent wallet reapprove --name main --await-local",
  "recommendedCommands": {
    "next": "zk-agent next",
    "walletStatus": "zk-agent wallet status --name main",
    "walletNext": "zk-agent wallet next --name main",
    "signerShow": "zk-agent wallet signer show --name main",
    "relayInspect": "zk-agent relay inspect --relay-url https://relay.example.com",
    "reapproveRemote": "zk-agent wallet reapprove --name main --relay-url https://relay.example.com --wait-relay --prompt-code",
    "reapprove": "zk-agent wallet reapprove --name main --await-local"
  }
}
```

When approval metadata is present but the local execution signer is missing,
`nextAction` changes to
`zk-agent wallet signer attach --name main --private-key <hex>`, and
`recommendedCommands` also includes:

- `attachSigner`
- `reapprove`

### `scope = "wallet-ready"`

This means config, approval metadata, and local execution signer state are all
present locally.

Key fields:

```json
{
  "scope": "wallet-ready",
  "walletName": "main",
  "productEntrySummary": {
    "view": "product-entry",
    "currentSurface": "doctor",
    "stage": "wallet-ready",
    "category": "operate",
    "recommendedMode": "local-first",
    "nextSurface": "next",
    "nextAction": "zk-agent next",
    "suiteAvailable": true
  },
  "summary": {
    "stage": "wallet-ready",
    "configExists": true,
    "walletExists": true,
    "approvalReady": true,
    "localExecutionKeyStored": true,
    "relayUrl": null,
    "nextAction": "zk-agent next",
    "localOnly": true
  },
  "suiteHandoffSummary": {
    "currentSurface": "doctor",
    "recommendedNow": true,
    "command": "zk-agent suite",
    "recommendedJourney": {
      "id": "send-value-now",
      "title": "Send Value Now",
      "command": "zk-agent workflow pay --wallet main --to <address> --amount <amount>"
    }
  },
  "nextAction": "zk-agent next",
  "recommendedCommands": {
    "next": "zk-agent next",
    "suite": "zk-agent suite",
    "walletStatus": "zk-agent wallet status --name main",
    "walletNext": "zk-agent wallet next --name main",
    "workflowPay": "zk-agent workflow pay --wallet main --to <address> --amount <amount>",
    "inspectDefaults": "zk-agent defaults"
  }
}
```

Current stable `suiteHandoffSummary` fields on this surface use the same field
set described later for top-level `zk-agent next` wallet scope.

## `zk-agent next`

`zk-agent next` is the default top-level routing contract.

### Shared fields

- `scope`
- `nextCommand`
- `productEntrySummary`
- `onboardingSummary`
- `recommendedPaths`
- `agentProfile`
- `agentFollowup`
- `recommendedCommands`

`onboardingSummary` uses the shared onboarding field set documented above.
On top-level `next`, `stage` usually stays on `setup` or `wallet-bootstrap`
when the routing decision is still purely local, and flips to
`wallet-recovery` or `wallet-ready` once the live wallet/workflow path is the
active decision boundary.

`productEntrySummary` is the compressed product-language companion to
`onboardingSummary`. It explains which operator question `next` is answering
right now without forcing callers to infer that from prose or command shape.

Current stable `productEntrySummary` fields:

- `view`
- `currentSurface`
- `stage`
- `category`
- `recommendedMode`
- `nextSurface`
- `nextAction`
- `suiteAvailable`
- `note`

### `scope = "setup"`

This means local config is missing.

Key fields:

```json
{
  "scope": "setup",
  "status": "action-required",
  "nextCommand": "zk-agent setup",
  "productEntrySummary": {
    "view": "product-entry",
    "currentSurface": "next",
    "stage": "setup",
    "category": "bootstrap",
    "recommendedMode": "local-first",
    "nextSurface": "setup",
    "nextAction": "zk-agent setup",
    "suiteAvailable": false
  },
  "onboardingSummary": {
    "stage": "setup",
    "baseline": "local-first",
    "localOnly": true,
    "configExists": false,
    "walletExists": false,
    "approvalReady": null,
    "localExecutionKeyStored": null,
    "defaultChain": null,
    "connectorUrl": null,
    "relayUrl": null,
    "nextAction": "zk-agent setup"
  },
  "recommendedPaths": {
    "local": [
      "zk-agent setup",
      "zk-agent next",
      "zk-agent wallet create --await-local",
      "zk-agent next"
    ],
    "remoteBrowser": [
      "zk-agent setup",
      "zk-agent next",
      "zk-agent relay inspect --relay-url <url>",
      "zk-agent wallet create --relay-url <url> --wait-relay --prompt-code",
      "zk-agent next"
    ]
  },
  "recommendedCommands": {
    "setup": "zk-agent setup",
    "afterSetup": "zk-agent next",
    "inspectDefaults": "zk-agent defaults"
  }
}
```

### `scope = "wallet-bootstrap"`

This means config exists, but the target wallet does not.

Key fields:

```json
{
  "scope": "wallet-bootstrap",
  "walletName": "main",
  "nextCommand": "zk-agent wallet create --await-local",
  "productEntrySummary": {
    "view": "product-entry",
    "currentSurface": "next",
    "stage": "wallet-bootstrap",
    "category": "bootstrap",
    "recommendedMode": "local-first",
    "nextSurface": "wallet",
    "nextAction": "zk-agent wallet create --await-local",
    "suiteAvailable": false
  },
  "onboardingSummary": {
    "stage": "wallet-bootstrap",
    "baseline": "local-first",
    "localOnly": true,
    "configExists": true,
    "walletExists": false,
    "approvalReady": null,
    "localExecutionKeyStored": null,
    "defaultChain": "zksync-sepolia",
    "connectorUrl": "http://localhost:4444",
    "relayUrl": null,
    "nextAction": "zk-agent wallet create --await-local"
  },
  "recommendedPaths": {
    "local": [
      "zk-agent wallet create --await-local",
      "zk-agent next"
    ],
    "remoteBrowser": [
      "zk-agent relay inspect --relay-url <url>",
      "zk-agent wallet create --relay-url <url> --wait-relay --prompt-code",
      "zk-agent next"
    ]
  },
  "recommendedCommands": {
    "createWallet": "zk-agent wallet create --await-local",
    "relayInspect": "zk-agent relay inspect --relay-url <url>",
    "createWalletRemote": "zk-agent wallet create --relay-url <url> --wait-relay --prompt-code",
    "afterApproval": "zk-agent next",
    "inspectDefaults": "zk-agent defaults"
  }
}
```

### `scope = "wallet"`

This means a local wallet record already exists and the recommended next step
is now at the wallet or workflow layer.

When the wallet is writable and there is no narrower blocker, the default
flagship next step now points to `workflow pay`, while `workflowAuto` remains
available for broader multi-intent guided execution.

When that flagship path stays on the default approval-based paymaster mode, the
same wallet-scope follow-up contract also surfaces the paymaster fee-token
recovery commands directly instead of forcing the operator back into generic
token discovery.

Key fields:

```json
{
  "scope": "wallet",
  "walletName": "main",
  "productEntrySummary": {
    "view": "product-entry",
    "currentSurface": "next",
    "stage": "wallet-ready",
    "category": "operate",
    "recommendedMode": "local-first",
    "nextSurface": "workflow",
    "nextAction": "zk-agent workflow pay --wallet main --to <address> --amount <amount>",
    "suiteAvailable": true
  },
  "inspection": { "...": "wallet inspection payload" },
  "summary": { "...": "wallet next summary payload" },
  "tokenDiscoverySummary": { "...": "wallet-scope token recovery summary" },
  "suiteHandoffSummary": {
    "currentSurface": "next",
    "recommendedNow": true,
    "command": "zk-agent suite",
    "recommendedJourney": {
      "id": "send-value-now",
      "title": "Send Value Now",
      "command": "zk-agent workflow pay --wallet main --to <address> --amount <amount>"
    }
  },
  "nextCommand": "zk-agent workflow pay --wallet main --to <address> --amount <amount>",
  "onboardingSummary": {
    "stage": "wallet-ready",
    "baseline": "local-first",
    "localOnly": false,
    "configExists": true,
    "walletExists": true,
    "approvalReady": true,
    "localExecutionKeyStored": true,
    "defaultChain": "zksync-sepolia",
    "connectorUrl": "http://localhost:4444",
    "relayUrl": null,
    "nextAction": "zk-agent workflow pay --wallet main --to <address> --amount <amount>"
  },
  "recommendedCommands": {
    "walletNext": "zk-agent wallet next --name main",
    "walletStatus": "zk-agent wallet status --name main",
    "suite": "zk-agent suite",
    "discoverAssets": "zk-agent assets --wallet main",
    "discoverOwnedTokens": "zk-agent tokens --wallet main --owned",
    "discoverTokens": "zk-agent tokens --chain zksync-sepolia",
    "inspectToken": "zk-agent resolve-token --chain zksync-sepolia --symbol <symbol>",
    "discoverPaymasterTokens": "zk-agent tokens --chain zksync-sepolia --role paymaster-fee-token",
    "inspectPaymasterToken": "zk-agent resolve-token --chain zksync-sepolia --symbol <symbol> --role paymaster-fee-token",
    "workflowPay": "zk-agent workflow pay --wallet main --to <address> --amount <amount>",
    "workflowAuto": "zk-agent workflow auto --wallet main --intent <intent> [goal flags] --create-checkpoint --execute-when-ready",
    "nextAction": "zk-agent workflow pay --wallet main --to <address> --amount <amount>"
  }
}
```

`recommendedCommands.suite` is the stable post-flagship entrypoint from the
same wallet-ready state when the operator wants discovery/defaults, funding,
and paymaster guidance in one packaged surface.

`suiteHandoffSummary` is the stable boundary marker for when `next` should
hand the operator from the product-entry surface to `suite`.

Current stable `suiteHandoffSummary` fields on this surface:

- `currentSurface`
- `recommendedNow`
- `command`
- `recommendedJourney`
- `useWhen`
- `stayOnCurrentSurfaceWhen`
- `note`

`recommendedJourney` is either `null` or a compressed suite-journey hint with:

- `id`
- `title`
- `command`

When the wallet scope exposes token/discovery follow-ups, `tokenDiscoverySummary`
compresses that routing contract into:

- `walletName`
- `chain`
- `intent`
- `nextAction`
- `paymasterMode`
- `tokenizedIntent`
- `includesAssetDiscovery`
- `includesOwnedTokenDiscovery`
- `includesChainTokenDiscovery`
- `includesDirectTokenInspection`
- `includesPaymasterTokenDiscovery`
- `includesPaymasterTokenInspection`

### `scope = "workflow"`

This means the result is a workflow follow-up restored from `--request-id`.

Key fields:

```json
{
  "scope": "workflow",
  "requestId": "wf123456",
  "workflowRequestId": "wf123456",
  "walletName": "main",
  "nextCommand": "zk-agent workflow resume --request-id wf123456",
  "productEntrySummary": {
    "view": "product-entry",
    "currentSurface": "next",
    "stage": "workflow",
    "category": "workflow",
    "recommendedMode": "workflow-followup",
    "nextSurface": "workflow",
    "nextAction": "zk-agent workflow resume --request-id wf123456",
    "suiteAvailable": false
  },
  "summary": {
    "status": "blocked",
    "readyForGoal": false,
    "nextCommand": "zk-agent workflow resume --request-id wf123456",
    "blockingActionIds": ["reapprove"]
  },
  "tokenDiscoverySummary": { "...": "workflow-scope token recovery summary" },
  "suiteHandoffSummary": {
    "currentSurface": "workflow",
    "recommendedNow": false,
    "command": "zk-agent suite",
    "recommendedJourney": null
  },
  "result": { "...": "workflow status payload" },
  "checkpoint": { "...": "stored checkpoint payload" },
  "recommendedCommands": {
    "inspectDefaults": "zk-agent defaults",
    "list": "zk-agent workflow list",
    "show": "zk-agent workflow show --request-id wf123456",
    "status": "zk-agent workflow status --request-id wf123456",
    "next": "zk-agent workflow next --request-id wf123456",
    "resume": "zk-agent workflow resume --request-id wf123456",
    "delete": "zk-agent workflow delete --request-id wf123456",
    "walletStatus": "zk-agent wallet status --name main",
    "suite": "zk-agent suite",
    "nextAction": "zk-agent workflow resume --request-id wf123456"
  }
}
```

Current stable `summary` fields on this surface:

- `status`
- `readyForGoal`
- `nextCommand`
- `blockingActionIds`
- `fundingProgress`

Current stable `recommendedCommands` fields on this surface include the stored
workflow follow-ups plus wallet and packaged post-flagship routing:

- `inspectDefaults`
- `list`
- `show`
- `status`
- `next`
- `resume`
- `delete`
- `walletStatus`
- `suite`
- `nextAction`

Current stable `suiteHandoffSummary` fields on this surface use the same field
set described above for wallet scope.

When the restored workflow intent is tokenized, `tokenDiscoverySummary` uses
the same field set described for wallet scope.

## `zk-agent wallet status|next`

`zk-agent wallet status` and `zk-agent wallet next` now share the same
machine-readable wallet-layer remediation and routing contract after local
setup and wallet bootstrap are already complete.

Current stable top-level fields:

- `ok`
- `inspection`
- `summary`
- `tokenDiscoverySummary`
- `suiteHandoffSummary`
- `recommendedCommands`

Within that set:

- `inspection`
  The detailed wallet inspection payload for approval, signer, deployment, and
  local execution readiness.
- `summary`
  The compressed wallet-remediation summary with current actions, notes, and
  the preferred wallet-layer next step.
- `recommendedCommands`
  The wallet-scoped remediation and discovery follow-up contract that can also
  point onward into the flagship workflow path.
- `suiteHandoffSummary`
  The stable wallet-layer handoff summary for when the current question should
  stay on `wallet status|next` versus move to `suite`.

The stable wallet-scoped follow-up contract now also includes `suite` as the
packaged post-flagship entrypoint when the operator wants discovery/defaults,
funding, and paymaster guidance from the same wallet state.

Current stable `suiteHandoffSummary` fields on this surface:

- `currentSurface`
- `recommendedNow`
- `command`
- `recommendedJourney`
- `useWhen`
- `stayOnCurrentSurfaceWhen`
- `note`

When the effective wallet paymaster mode is `approval-based`,
`recommendedCommands` can also include:

- `discoverPaymasterTokens`
- `inspectPaymasterToken`

When wallet-scoped discovery follow-ups are present, `tokenDiscoverySummary`
uses the same field set described for top-level `zk-agent next` wallet scope:

- `walletName`
- `chain`
- `intent`
- `nextAction`
- `paymasterMode`
- `tokenizedIntent`
- `includesAssetDiscovery`
- `includesOwnedTokenDiscovery`
- `includesChainTokenDiscovery`
- `includesDirectTokenInspection`
- `includesPaymasterTokenDiscovery`
- `includesPaymasterTokenInspection`

## `zk-agent workflow *`

### `workflow plan`

The most important fields in the current contract are:

- `agentProfile`
- `agentFollowup`
- `inspection`
- `plan`
- `workflowEntrySummary`
- `tokenDiscoverySummary`
- `recommendedCommands`

On the plan surface, `recommendedCommands` is the default container for
bridge/swap/token follow-ups. It is not the agent-identity follow-up container.

When the current intent is tokenized, `tokenDiscoverySummary` compresses the
workflow-scoped token recovery path into:

- `walletName`
- `chain`
- `intent`
- `nextAction`
- `paymasterMode`
- `tokenizedIntent`
- `includesAssetDiscovery`
- `includesOwnedTokenDiscovery`
- `includesChainTokenDiscovery`
- `includesDirectTokenInspection`
- `includesPaymasterTokenDiscovery`
- `includesPaymasterTokenInspection`

### `workflow start`

Key fields:

- `workflowRequestId`
- `checkpoint`
- `status`
- `workflowEntrySummary`
- `agentProfile`
- `agentFollowup`
- `recommendedCommands`

### `workflow auto`

This is the current default guided-execution contract.

Key fields:

- `source`
- `action`
- `summary`
- `checkpointPersisted`
- `workflowRequestId`
- `status`
- `result`
- `checkpoint`
- `walletApproval`
- `walletApprovalSummary`
- `workflowEntrySummary`
- `tokenDiscoverySummary`
- `recommendedCommands`
- `agentProfile`
- `agentFollowup`

Two follow-up groups must be distinguished here:

- `recommendedCommands`
  The next step at the current workflow/action layer.
- `agentFollowup`
  The next step at the current local agent-identity layer.

Current stable `summary` fields on workflow runtime surfaces:

- `status`
- `readyForGoal`
- `nextCommand`
- `blockingActionIds`
- `fundingProgress`

On `workflow auto|run|resume`, `summary.status` mirrors `result.stage` after a funding dispatch or goal execution, and otherwise mirrors the workflow readiness status.

`workflowEntrySummary` now provides the entrypoint-level compatibility contract
across `plan|start|auto|pay|run|status|next|resume` and the fixed-intent
workflow shortcuts.

Current stable `workflowEntrySummary` fields:

- `entrypoint`
- `command`
- `source`
- `workflowRequestId`
- `walletName`
- `intent`
- `runtimeStatus`
- `readyForGoal`
- `walletApprovalStatus`
- `checkpointPersisted`
- `nextAction`

Current stable `entrypoint` values:

- `workflow`

Current stable `source` values:

- `input`
- `checkpoint`
- `null`

### `workflow status|next|run|resume`

These surfaces currently all include:

- `summary`
- `agentProfile`
- `agentFollowup`
- `workflowEntrySummary`
- `walletApprovalSummary`
- `tokenDiscoverySummary`
- `suiteHandoffSummary`
- `recommendedCommands`

Within that set:

- `workflow run`
  includes `result` on successful execution
- `workflow resume`
  first verifies whether the checkpoint can actually be resumed

Current stable `summary` fields on workflow runtime surfaces:

- `status`
- `readyForGoal`
- `nextCommand`
- `blockingActionIds`
- `fundingProgress`

On `workflow auto|run|resume`, `summary.status` mirrors `result.stage` after a funding dispatch or goal execution, and otherwise mirrors the workflow readiness status.

Tokenized workflow outputs should keep the same local-first recovery contract
visible:

- `discoverAssets`
- `discoverOwnedTokens`
- `discoverTokens`
- `inspectToken`
- `discoverPaymasterTokens`
- `inspectPaymasterToken`

Current stable `tokenDiscoverySummary` fields on tokenized workflow surfaces:

- `walletName`
- `chain`
- `intent`
- `nextAction`
- `paymasterMode`
- `tokenizedIntent`
- `includesAssetDiscovery`
- `includesOwnedTokenDiscovery`
- `includesChainTokenDiscovery`
- `includesDirectTokenInspection`
- `includesPaymasterTokenDiscovery`
- `includesPaymasterTokenInspection`

When the current workflow intent is not tokenized, `tokenDiscoverySummary` may
be absent.

Current stable `walletApprovalSummary` fields on workflow runtime surfaces when
wallet approval context is present:

- `status`
- `walletRequestId`
- `reusedRequest`
- `relayPublished`
- `nextAction`
- `afterApproval`
- `afterApprovalStatus`

Current stable `suiteHandoffSummary` fields on workflow runtime surfaces:

- `currentSurface`
- `recommendedNow`
- `command`
- `recommendedJourney`
- `useWhen`
- `stayOnCurrentSurfaceWhen`
- `note`

### `workflowEntrySummary` examples

Plan-time example:

```json
{
  "workflowEntrySummary": {
    "entrypoint": "workflow",
    "command": "plan",
    "source": "input",
    "workflowRequestId": null,
    "walletName": "main",
    "intent": "swap",
    "runtimeStatus": "blocked",
    "readyForGoal": false,
    "walletApprovalStatus": null,
    "checkpointPersisted": false,
    "nextAction": "zk-agent resolve-token --chain zksync-sepolia --symbol <symbol>"
  }
}
```

Runtime example with checkpoint follow-up:

```json
{
  "workflowEntrySummary": {
    "entrypoint": "workflow",
    "command": "next",
    "source": "checkpoint",
    "workflowRequestId": "wf-await-001",
    "walletName": "main",
    "intent": "send-native",
    "runtimeStatus": "blocked",
    "readyForGoal": false,
    "walletApprovalStatus": "relay-pending",
    "checkpointPersisted": true,
    "nextAction": "zk-agent wallet request relay-status --request-id wr-reuse-001 --relay-url http://127.0.0.1:4445"
  }
}
```

### Token-input workflow errors

When `workflow status|next|run|resume|auto` fails during token input
resolution, the error payload now also includes:

- `recommendedCommands`
- `tokenDiscoverySummary`

Current stable `tokenDiscoverySummary` fields on that error path:

- `chain`
- `queryType`
- `query`
- `roleFilter`
- `includesChainTokenDiscovery`
- `includesDirectTokenInspection`
- `workflowHelp`

### `workflow list|show|update|delete`

These checkpoint-management surfaces now also include:

- `agentProfile`
- `agentFollowup`

That keeps the agent-identity context available even when the harness moves
into checkpoint-management commands.

## `zk-agent relay serve`

This is the local hosted-relay startup surface.

Current stable top-level fields:

- `ok`
- `status`
- `origin`
- `publicOrigin`
- `publicOriginSource`
- `stateBackend`
- `deploymentScope`
- `sameHostRestartPersists`
- `shareLinkBaseUrl`
- `statusApiBaseUrl`
- `publicOriginLooksLocal`
- `approvalEndpointSummary`
- `hostedReadinessSummary`
- `deploymentSummary`
- `healthUrl`
- `publicHealthUrl`
- `relayMode`
- `connectorUiAvailable`
- `hostedShareRedirectReady`
- `capabilities`
- `relayApprovalPaths`
- `recommendedCommands`
- `notes`

Current stable `hostedReadinessSummary` fields on this surface:

- `status`
- `compatible`
- `hostedApprovalReady`
- `publicOriginConfigured`
- `publicOriginLooksLocal`
- `connectorUiAvailable`
- `singleHostFileState`

Current stable `approvalEndpointSummary` fields on this surface:

- `status`
- `publicOriginConfigured`
- `publicOriginLooksLocal`
- `relayUrlMatchesPublicOrigin`
- `shareLinkBaseUrl`
- `statusApiBaseUrl`

Current stable approval-endpoint `status` values on this surface:

- `local-public-origin`
- `hosted-public-origin`

Current stable hosted-readiness `status` values on this surface:

- `ready`
- `needs-public-origin`
- `needs-connector-ui`
- `needs-public-origin-and-ui`
- `incompatible`

When present, `deploymentSummary` compresses the hosted deployment contract
into:

- `origin`
- `publicOrigin`
- `publicOriginSource`
- `shareLinkBaseUrl`
- `statusApiBaseUrl`
- `publicOriginConfigured`
- `publicOriginLooksLocal`
- `connectorUiAvailable`
- `hostedShareRedirectReady`
- `singleHostFileState`

Current stable `recommendedCommands` shape on this surface:

- `inspectRelay`
- `createWallet`
- `reapproveWallet`
- `restartWithPublicOrigin`
  appears selectively when the relay is still advertising a local-only public
  origin

Current stable `relayApprovalPaths` shape on this surface:

- `createWallet`
- `reapproveWallet`

## `zk-agent relay inspect`

This is the hosted-relay compatibility and deployment-inspection surface.

Current stable top-level fields:

- `ok`
- `status`
- `relayUrl`
- `compatible`
- `origin`
- `publicOrigin`
- `publicOriginSource`
- `stateBackend`
- `deploymentScope`
- `sameHostRestartPersists`
- `shareLinkBaseUrl`
- `statusApiBaseUrl`
- `relayUrlMatchesOrigin`
- `relayUrlMatchesPublicOrigin`
- `publicOriginLooksLocal`
- `approvalEndpointSummary`
- `hostedReadinessSummary`
- `deploymentSummary`
- `connectorUiAvailable`
- `hostedShareRedirectReady`
- `capabilities`
- `relayApprovalPaths`
- `recommendedCommands`
- `notes`

Current stable `hostedReadinessSummary` fields on this surface:

- `status`
- `compatible`
- `hostedApprovalReady`
- `publicOriginConfigured`
- `publicOriginLooksLocal`
- `connectorUiAvailable`
- `singleHostFileState`

Current stable `approvalEndpointSummary` fields on this surface:

- `status`
- `publicOriginConfigured`
- `publicOriginLooksLocal`
- `relayUrlMatchesPublicOrigin`
- `shareLinkBaseUrl`
- `statusApiBaseUrl`

Current stable approval-endpoint `status` values on this surface:

- `local-public-origin`
- `hosted-public-origin`
- `hosted-public-origin-via-proxy`

Current stable hosted-readiness `status` values on this surface:

- `ready`
- `needs-public-origin`
- `needs-connector-ui`
- `needs-public-origin-and-ui`
- `incompatible`

Current stable `deploymentSummary` fields on this surface:

- `origin`
- `publicOrigin`
- `publicOriginSource`
- `shareLinkBaseUrl`
- `statusApiBaseUrl`
- `publicOriginConfigured`
- `publicOriginLooksLocal`
- `connectorUiAvailable`
- `hostedShareRedirectReady`
- `singleHostFileState`

Current stable `recommendedCommands` shape on this surface:

- `createWallet`
- `reapproveWallet`
- `restartWithPublicOrigin`
  appears selectively when the relay is still advertising a local-only public
  origin

Current stable `relayApprovalPaths` shape on this surface:

- `createWallet`
- `reapproveWallet`

## `zk-agent wallet create --relay-url <url>`

This is the higher-level remote wallet-bootstrap publish surface.

Current stable top-level fields:

- `ok`
- `walletName`
- `requestId`
- `walletRequestId`
- `approvalUrl`
- `relay`
- `relayRecoverySummary`
- `expiresAt`
- `chain`
- `chainId`
- `accountKind`
- `paymasterMode`
- `capabilities`
- `sessionScope`
- `nextAction`
- `recommendedCommands`

Current stable `recommendedCommands` shape on this surface:

- `awaitLocal`
- `relayStatus`
- `relayApprove`
- `approve`
- `afterApproval`
- `afterApprovalStatus`

Current stable `relayRecoverySummary` fields on this surface:

- `requestId`
- `walletName`
- `relayUrl`
- `relayStatus`
- `approvalReady`
- `nextAction`
- `shareLinkBaseUrl`
- `statusApiBaseUrl`
- `recoveryMode`
- `includesStatusPoll`
- `includesApprove`
- `includesRelayInspect`
- `includesRemoteReissue`

Current stable semantics:

- `nextAction`
  Defaults to `zk-agent wallet request relay-status --request-id <id> --relay-url <url>`
  immediately after publish.
- `recommendedCommands.relayApprove`
  Preserves the lower-level manual finalize path even when the operator starts
  from the higher-level wallet-create entrypoint.

## `zk-agent wallet reapprove --name <name> --relay-url <url>`

This is the higher-level remote existing-wallet reapproval publish surface.

Current stable top-level fields:

- `ok`
- `walletRequestId`
- `wallet`
- `request`
- `relay`
- `relayRecoverySummary`
- `nextAction`
- `recommendedCommands`

Current stable `recommendedCommands` shape on this surface:

- `awaitLocal`
- `relayStatus`
- `relayApprove`
- `approve`
- `afterApproval`
- `afterApprovalStatus`

Current stable `relayRecoverySummary` fields on this surface:

- `requestId`
- `walletName`
- `relayUrl`
- `relayStatus`
- `approvalReady`
- `nextAction`
- `shareLinkBaseUrl`
- `statusApiBaseUrl`
- `recoveryMode`
- `includesStatusPoll`
- `includesApprove`
- `includesRelayInspect`
- `includesRemoteReissue`

Current stable semantics:

- `request`
  Preserves the pending reapproval request metadata that the higher-level
  entrypoint generated before relay publication.
- `nextAction`
  Defaults to `zk-agent wallet request relay-status --request-id <id> --relay-url <url>`
  immediately after publish.

## `zk-agent wallet request relay-publish`

This is the lower-level hosted relay/manual-approval publish surface.

Current stable top-level fields:

- `ok`
- `walletRequestId`
- `relay`
- `relayRecoverySummary`
- `request`
- `recommendedCommands`
- `nextAction`

Current stable `relayRecoverySummary` fields on this surface:

- `requestId`
- `walletName`
- `relayUrl`
- `relayStatus`
- `approvalReady`
- `nextAction`
- `shareLinkBaseUrl`
- `statusApiBaseUrl`
- `recoveryMode`
- `includesStatusPoll`
- `includesApprove`
- `includesRelayInspect`
- `includesRemoteReissue`

## `zk-agent wallet request relay-status`

This is the lower-level hosted relay/manual-approval status surface.

Current stable top-level fields:

- `ok`
- `walletRequestId`
- `relay`
- `relayRecoverySummary`
- `recommendedCommands`
- `nextAction`
- `note`

Current stable `relay` fields:

- `request_id`
- `status`
- `approval_ready`
- `share_url`
- `status_url`
- `approval_url`
- `expires_at`

Current stable `relayRecoverySummary` fields on this surface:

- `requestId`
- `walletName`
- `relayUrl`
- `relayStatus`
- `approvalReady`
- `nextAction`
- `shareLinkBaseUrl`
- `statusApiBaseUrl`
- `recoveryMode`
- `includesStatusPoll`
- `includesApprove`
- `includesRelayInspect`
- `includesRemoteReissue`

When `status = ready`, `nextAction` points at:

- `zk-agent wallet request approve --request-id <id> --relay-url <url> --code <code> --wait`

When `status = expired`, `nextAction` stops self-polling and instead points at
remote request reissue.

Key expired-shape example:

```json
{
  "ok": true,
  "walletRequestId": "req12345",
  "relay": {
    "request_id": "req12345",
    "status": "expired",
    "approval_ready": false,
    "share_url": "https://relay.example.com/r/req12345",
    "status_url": "https://relay.example.com/api/requests/req12345",
    "approval_url": "https://relay.example.com/r/req12345",
    "expires_at": "2026-08-10T00:05:00.000Z"
  },
  "recommendedCommands": {
    "relayInspect": "zk-agent relay inspect --relay-url https://relay.example.com",
    "reissueRemoteApproval": "zk-agent wallet reapprove --name main --relay-url https://relay.example.com --wait-relay --prompt-code"
  },
  "nextAction": "zk-agent wallet reapprove --name main --relay-url https://relay.example.com --wait-relay --prompt-code",
  "note": "Relay approval expired. Reissue the remote request. The recovery command preserves any CLI-expressible session-policy flags from the expired request."
}
```

Current stable semantics:

- `recommendedCommands.relayInspect`
  Inspect the hosted relay contract again before retrying when deployment state
  is in doubt.
- `recommendedCommands.reissueRemoteApproval`
  The default remote retry path after expiry.
- `nextAction`
  The single best executable next step for the current relay state.

The same `relayRecoverySummary` field set now also appears in:

- `wallet create --relay-url <url>`
- `wallet reapprove --name <name> --relay-url <url>`
- `wallet request relay-publish`
- `RELAY_APPROVAL_TIMEOUT` error details
- `RELAY_APPROVAL_EXPIRED` error details

## The role of `recommendedCommands`

In the current contract, `recommendedCommands` remains the main container for
action/path follow-ups.

Its contents vary by surface, but the semantics are now stable:

- executable next steps such as wallet/workflow/defaults/token-discovery
- not agent-identity-specific meaning

So the current contract layering is:

- `recommendedCommands`
  execution-path follow-ups
- `suiteHandoffSummary`
  explicit boundary guidance for when the current surface should hand off to
  `suite`
- `agentFollowup`
  local agent-identity follow-ups

## `zk-agent suite`

This is the current top-level product-surface catalog for the flagship path
plus the explicit post-flagship operator slices, including the current hosted
approval recovery surface.

Current stable top-level fields:

- `ok`
- `summary`
- `preflight`
  appears only when `zk-agent suite --include-onboarding` is used
- `journeys`
- `surfaces`
- `flagship`
- `slices`
- `recommendedCommands`

Current stable `summary` fields:

- `suiteId`
- `catalogView`
- `walletName`
- `chain`
- `stage`
- `useWhen`
- `entryModes`
- `journeyOrder`
- `surfaceOrder`
- `categoryOrder`
- `flagshipId`
- `postFlagshipSliceIds`
- `recommendedOrder`
- `nextAction`

Current stable `flagship` / `slices[]` fields:

- `category`
- `surface`
- `id`
- `title`
- `goal`
- `useWhen`
- `primaryCommand`
- `surfaceCommand`
- `supportingCommands`
- `skillPath`
- `smokeCommand`
  appears selectively when the slice has a bounded smoke entrypoint

Current stable `surfaceOrder` values on this surface are:

- `workflow`
- `discovery`
- `relay`

Current stable `surface` semantics on `flagship` / `slices[]`:

- `workflow`
  The suite is handing the operator to the workflow surface next.
- `discovery`
  The suite is handing the operator to the discovery/defaults surface next.
- `relay`
  The suite is handing the operator to the hosted relay recovery surface next.

`surfaceCommand` is the stable deeper-surface entrypoint that owns that suite
slice after the initial suite classification. Current examples include
`zk-agent workflow --help`, `zk-agent defaults`, and `zk-agent relay --help`.

Current stable `surfaces[]` fields:

- `surface`
- `title`
- `useWhen`
- `command`
- `categoryIds`
- `entryIds`

Current stable `journeys[]` fields:

- `id`
- `title`
- `operatorQuestion`
- `useWhen`
- `startCommand`
- `surface`
- `categoryIds`
- `entryIds`

`journeys[]` is the higher-level operator-routing layer above the raw slice
catalog. It compresses the current packaged surface into the most common
questions a public operator is actually asking before they care about the
underlying slice ids.

Current stable `journeyOrder` values on this surface are:

- `send-value-now`
- `inspect-before-acting`
- `unstick-a-write`
- `recover-remote-approval`

`surfaces[]` is the top-level deeper-surface catalog that `suite` hands off
to after its first classification pass. It compresses the current post-
flagship product surface into the stable handoff layers:

- `workflow`
- `discovery`
- `relay`

Current stable `recommendedCommands` shape on this surface:

- `suite`
- `flagship`
- `workflowSurface`
- `discoverySurface`
- `relaySurface`
- `discovery`
- `paymaster`
- `funding`
- `hostedApproval`
- `inspectDefaults`

When `preflight` is present, its current stable fields are:

- `id`
- `title`
- `goal`
- `useWhen`
- `diagnosticCommand`
- `localPath`
- `remoteBrowserPath`
- `afterWalletReady`

When `zk-agent suite` is invoked with non-default `--wallet` or `--chain`
options, the stable contract preserves that context across `summary`,
`flagship`, `slices`, and `recommendedCommands`. In particular,
`recommendedCommands.suite` becomes the context-preserving rerun command for
the same packaged surface. When `--include-onboarding` is also used, that rerun
command preserves the onboarding-inclusive suite shape as well.

## `zk-agent defaults`

`zk-agent defaults` is the machine-readable defaults and discovery catalog for
the current validated product path.

Current stable top-level fields:

- `ok`
- `summary`
- `recommendedCommands`
- `defaults`
- `localTokenRegistry`
- `tokenRegistrySources`
- `tokenDirectoryChains`

### `recommendedCommands`

The current stable discovery follow-up contract is:

```json
{
  "recommendedCommands": {
    "inspectDefaults": "zk-agent defaults",
    "discoverTokens": "zk-agent tokens --chain zksync-sepolia",
    "inspectToken": "zk-agent resolve-token --chain zksync-sepolia --symbol ZKAT",
    "discoverPaymasterTokens": "zk-agent tokens --chain zksync-sepolia --role paymaster-fee-token",
    "inspectPaymasterToken": "zk-agent resolve-token --chain zksync-sepolia --symbol ZKAT --role paymaster-fee-token"
  }
}
```

Current stable semantics:

- `inspectDefaults`
  Reopen the registry/defaults catalog directly.
- `discoverTokens`
  Start the symbol-first chain token discovery path from the current primary
  chain.
- `inspectToken`
  Inspect one concrete token symbol on that same primary discovery chain.
- `discoverPaymasterTokens`
  Narrow discovery to tokens that are valid for approval-based paymaster fees.
- `inspectPaymasterToken`
  Inspect one concrete paymaster-fee-token candidate on the primary discovery
  chain.

### `summary`

The current stable `summary` fields are:

- `primaryDiscoveryChain`
- `exampleTokenSymbol`
- `paymasterFeeTokenSymbol`
- `localTokenCount`
- `tokenDirectoryChainCount`
- `tokenRegistrySources`
- `resolvedDefaults`

Example shape on the current validated Sepolia path:

```json
{
  "summary": {
    "primaryDiscoveryChain": "zksync-sepolia",
    "exampleTokenSymbol": "ZKAT",
    "paymasterFeeTokenSymbol": "ZKAT",
    "localTokenCount": 3,
    "tokenDirectoryChainCount": 0,
    "tokenRegistrySources": [
      {
        "id": "local-deployments",
        "enabled": true,
        "exists": true
      }
    ],
    "resolvedDefaults": {
      "swap": {
        "entryId": "syncswap-classic",
        "chain": "zksync-sepolia",
        "protocol": "syncswap-classic",
        "status": "validated"
      },
      "bridgeDeposit": {
        "entryId": "ethereum-sepolia-to-zksync-sepolia",
        "fromChain": "ethereum-sepolia",
        "toChain": "zksync-sepolia",
        "status": "validated"
      },
      "bridgeWithdraw": {
        "entryId": "zksync-sepolia-to-ethereum-sepolia",
        "fromChain": "zksync-sepolia",
        "toChain": "ethereum-sepolia",
        "status": "validated",
        "requiresFinalize": true
      },
      "paymasterDefault": {
        "entryId": "zksync-sepolia-approval-based-eravm",
        "chain": "zksync-sepolia",
        "mode": "approval-based",
        "status": "validated"
      },
      "paymasterByMode": {
        "none": "zksync-sepolia-no-paymaster",
        "sponsored": "zksync-sepolia-sponsored",
        "approvalBased": "zksync-sepolia-approval-based-eravm"
      }
    }
  }
}
```

Current stable semantics:

- `primaryDiscoveryChain`
  The one chain that downstream discovery flows should prefer by default.
- `exampleTokenSymbol`
  The current concrete symbol used for symbol-first discovery follow-ups.
- `paymasterFeeTokenSymbol`
  The current concrete symbol used for approval-based paymaster fee-token
  follow-ups, or `null` when no validated candidate exists.
- `localTokenCount`
  Count of locally indexed token entries shipped with the repo/runtime.
- `tokenDirectoryChainCount`
  Count of indexed token-directory chains available locally to the CLI.
- `tokenRegistrySources`
  The enabled/existing source-state summary for the merged token registry.
- `resolvedDefaults`
  The compressed swap/bridge/paymaster defaults that the flagship product path
  currently resolves to.

## `zk-agent assets`

`zk-agent assets` is the preferred single-chain asset entrypoint on the
current product path.

Current stable top-level fields:

- `ok`
- `discoverySummary`
- `recommendedCommands`
- `walletName`
- `walletAddress`
- `chain`
- `chainId`
- `balances`
- `ownedTokenRegistry`

### `recommendedCommands`

Current stable discovery follow-up shape:

```json
{
  "recommendedCommands": {
    "inspectDefaults": "zk-agent defaults",
    "discoverOwnedTokens": "zk-agent tokens --wallet main --owned",
    "discoverTokens": "zk-agent tokens --chain zksync-sepolia",
    "inspectToken": "zk-agent resolve-token --chain zksync-sepolia --symbol <symbol>"
  }
}
```

### `discoverySummary`

Current stable fields:

- `walletName`
- `chain`
- `chainId`
- `assetCount`
- `nativeAssetSymbol`
- `nativeAssetBalance`
- `ownedTokenCount`
- `primaryOwnedTokenSymbol`
- `ownedTokenSymbols`
- `ownedTokenSourceCounts`
- `ownedBridgeMappingCounts`
- `ownedRegistryRoleCounts`

Current stable semantics:

- `assetCount`
  Count of entries in the merged single-chain asset view, including native
  balance plus registry-backed owned ERC-20 balances.
- `ownedTokenCount`
  Count of owned registry-backed ERC-20 entries in the same asset view.
- `primaryOwnedTokenSymbol`
  The first concrete owned token symbol exposed by this asset view, or `null`
  when none are currently held.
- `ownedTokenSourceCounts`
  Compressed source counts for the owned ERC-20 subset.
- `ownedBridgeMappingCounts`
  Compressed shared-bridge mapping status counts for the owned ERC-20 subset.
- `ownedRegistryRoleCounts`
  Compressed defaults-registry role counts for the owned ERC-20 subset.

## `zk-agent balances --owned-tokens`

When `zk-agent balances` stays on the single-chain path and `--owned-tokens`
is enabled, it now exposes the same discovery follow-up contract as
`zk-agent assets`.

Current stable top-level fields on that path:

- `ok`
- `discoverySummary`
- `recommendedCommands`
- `walletName`
- `walletAddress`
- `chain`
- `chainId`
- `balances`
- `ownedTokenRegistry`

Current stable semantics:

- `discoverySummary`
  Same compressed single-chain owned-token summary contract as `zk-agent assets`.
- `recommendedCommands`
  Same local-first discovery follow-up contract as `zk-agent assets`.

## `zk-agent tokens`

`zk-agent tokens` is the symbol-first discovery surface for either:

- chain-scoped discoverable tokens
- wallet-scoped owned registry-backed ERC-20 tokens via `--owned`

Current stable top-level fields:

- `ok`
- `discoverySummary`
- `recommendedCommands`
- `tokenRegistrySources`
- `entries`
- `entryCount`

Additional current stable top-level fields depend on mode:

- chain discovery:
  - `chainFilter`
  - `symbol`
  - `role`
  - `source`
- owned discovery:
  - `walletName`
  - `walletAddress`
  - `ownedOnly`
  - `chainFilter`
  - `symbol`
  - `role`
  - `source`
  - `summary`
  - `probeFailureCount`
  - `probeFailures`

Important current distinction:

- `discoverySummary`
  The compressed operator-facing summary contract added by the CLI surface.
- `summary`
  On `tokens --owned`, the existing detailed owned-token probe summary from the
  underlying registry path. This is preserved and not replaced.

### `recommendedCommands`

Current stable chain-discovery shape:

```json
{
  "recommendedCommands": {
    "inspectDefaults": "zk-agent defaults",
    "discoverTokens": "zk-agent tokens --chain zksync-sepolia",
    "inspectToken": "zk-agent resolve-token --chain zksync-sepolia --symbol <symbol>"
  }
}
```

Current stable owned-token shape:

```json
{
  "recommendedCommands": {
    "inspectDefaults": "zk-agent defaults",
    "discoverAssets": "zk-agent assets --wallet main",
    "discoverTokens": "zk-agent tokens --chain zksync-sepolia",
    "inspectToken": "zk-agent resolve-token --chain zksync-sepolia --symbol <symbol>"
  }
}
```

### `discoverySummary`

Current stable fields:

- `mode`
- `walletName`
- `chainScope`
- `chainCount`
- `entryCount`
- `symbolFilter`
- `roleFilter`
- `sourceFilter`
- `primarySymbol`
- `primarySource`
- `sourceCounts`
- `roleMatchCounts`
- `currentDefaultEntryCount`
- `probeFailureCount`
- `bridgeMappingCounts`
- `tokenRegistrySources`

Current stable semantics:

- `mode`
  Currently `discoverable` or `owned-registry-erc20`.
- `chainScope`
  The active chain key when discovery is narrowed to one chain, otherwise
  `all-built-in-chains`.
- `primarySymbol`
  The first concrete symbol surfaced by the current token query, or `null`
  when the query is empty.
- `sourceCounts`
  Compressed token-source counts across the returned entries.
- `roleMatchCounts`
  Compressed defaults-registry role-match counts across the returned entries.
- `currentDefaultEntryCount`
  Count of returned entries that match at least one current validated default.
- `probeFailureCount`
  On `tokens --owned`, the count of ERC-20 probe failures; otherwise `null`.
- `bridgeMappingCounts`
  On `tokens --owned`, the compressed shared-bridge mapping status counts;
  otherwise `null`.

## `zk-agent resolve-token`

`zk-agent resolve-token` is the direct token inspection surface after the
candidate set is already known.

Current stable top-level fields:

- `ok`
- `discoverySummary`
- `recommendedCommands`
- `chainId`
- `chainKey`
- `queryType`
- `symbol`
- `address`
- `role`
- `source`
- `matchCount`
- `ambiguous`
- `primaryMatch`
- `matches`
- `tokenRegistrySources`

### `recommendedCommands`

Current stable follow-up shape:

```json
{
  "recommendedCommands": {
    "inspectDefaults": "zk-agent defaults",
    "discoverTokens": "zk-agent tokens --chain zksync-sepolia --symbol USDC"
  }
}
```

### `discoverySummary`

Current stable fields:

- `chain`
- `chainId`
- `queryType`
- `query`
- `roleFilter`
- `sourceFilter`
- `matchCount`
- `ambiguous`
- `primarySymbol`
- `primaryAddress`
- `primaryDecimals`
- `primarySource`
- `sourceCounts`
- `roleMatchCounts`
- `currentDefaultEntryCount`
- `tokenRegistrySources`

Current stable semantics:

- `query`
  The concrete symbol or address that the command inspected on the active
  chain.
- `primary*`
  The compressed identity of the preferred match when at least one match
  exists.
- `sourceCounts`
  Compressed source counts across the returned matches.
- `roleMatchCounts`
  Compressed defaults-registry role-match counts across the returned matches.
- `currentDefaultEntryCount`
  Count of returned matches that align with at least one current validated
  default.

## `zk-agent agent *`

The local operator-identity commands are also part of the machine-readable
contract.

### `agent status|show`

These surfaces currently include:

- `ok`
- `plugin`
- `profileExists`
- `profile`
- `recommendedCommands`

For `agent status`, an optional `inspectedWallet` may also be present.

Key fields:

```json
{
  "ok": true,
  "profileExists": false,
  "profile": null,
  "recommendedCommands": {
    "status": "zk-agent agent status",
    "show": "zk-agent agent show",
    "export": "zk-agent agent export",
    "import": "zk-agent agent import --payload @agent-profile.json",
    "set": "zk-agent agent set --name <name> --wallet main"
  }
}
```

Current stable semantics:

- `profileExists`
  Whether a local profile is already saved.
- `profile`
  `null` when no local profile exists; otherwise the saved local profile.
- `recommendedCommands`
  The local agent-identity follow-up set for create, inspect, export, and
  import paths.

### `agent export|set|import|clear`

These surfaces also keep `recommendedCommands` as the main follow-up
container, with command-specific payloads such as:

- `export`
  portable local profile bundle
- `profile`
  saved profile after `set` or `import`
- `removed`
  whether `clear` actually removed a saved profile

## `pnpm tool:run -- --list`

This is the current agent-tools discoverability contract.

### Top-level fields

- `ok`
- `tools`
- `recommendedSequence`

### `tools[]`

Current stable fields:

- `name`
- `description`
- `group`
- `cliCommand`
- `exampleInput`
- `operatorPathStage`
- `recommended`
- `aliasOf`

Where:

- `cliCommand`
  Gives the closest CLI-equivalent entrypoint so the tool surface stays aligned
  with the human command surface.
- `exampleInput`
  Currently covers the default operator path and most commonly used non-zero
  input tools so the harness does not have to guess input shapes. Zero-input
  or reserialization-heavy tools may omit it.
- `operatorPathStage`
  Current stable values:
  - `decide-next`
  - `acquire-session`
  - `guided-execution`
  - `funding-fallback`
  - `checkpoint-follow-up`
- `recommended`
  Currently used mainly to mark `workflowAutoTool` as the default guided
  workflow entry.
- `aliasOf`
  Currently used to express compatibility aliases explicitly, such as
  `workflowOrchestratorTool -> workflowAutoTool`.

### `recommendedSequence`

This compresses the default operator path into a machine-readable stage
sequence.

Current stable fields on each item:

- `stage`
- `summary`
- `primaryToolName`
- `toolNames`

Current stable stage order:

1. `decide-next`
2. `acquire-session`
3. `guided-execution`
4. `funding-fallback`
5. `checkpoint-follow-up`

### Current session-guardrail discoverability convention

Session-recovery tools on the default operator path now expose preset usage
through `exampleInput` instead of forcing external harnesses to infer it:

- `walletReapproveTool.exampleInput.policyPreset`
- `workflowAutoTool.exampleInput.approvalPolicyPreset`
- `workflowOrchestratorTool.exampleInput.approvalPolicyPreset`

The semantics of `approvalPolicyPreset = "intent"` are also now fixed:
derive the narrowest default session from the workflow goal.

## Smoke contract

### `smoke:operator-path`

The current `summary` is fixed to include:

- `topLevelScope`
- `topLevelNextCommand`
- `topLevelAgentProfile`
- `topLevelAgentFollowup`
- `topLevelRecommendedCommands`
- `walletNextCommand`
- `workflowAction`
- `workflowStage`
- `workflowRegistry`
- `workflowNextCommand`
- `workflowAgentProfile`
- `workflowAgentFollowup`
- `walletApprovalRecommendedCommands`
- `workflowRecommendedCommands`

The purpose of this summary is to compress "top-level routing + guided workflow
execution" into one machine-readable product-path snapshot.

### `smoke:paymaster-success`

The current `result` is fixed to include:

- `stage`
- `goalMode`
- `txHash`
- `agentProfile`
- `agentFollowup`
- `registry`
- `paymaster`
- `nextCommand`
- `recommendedCommands`
- `notes`

### `smoke:product-path`

The most important fields in the current `summary` are:

- `nextCommands`
- `followups`

`followups.<stepId>` can now include:

- `nextCommand`
- `recommendedCommands`
- `registry`
- `agentProfile`
- `agentFollowup`
- `workflowAgentProfile`
- `workflowAgentFollowup`

In other words, the aggregate smoke now preserves not only the execution path
but also the agent-identity layer.

## Current stability boundary

The following field semantics can currently be treated as relatively stable:

- `ok`
- `scope`
- `workflowRequestId`
- `agentProfile`
- `agentFollowup`
- `recommendedCommands`
- `tools[].group`
- `tools[].cliCommand`
- `tools[].exampleInput`
- `tools[].operatorPathStage`
- `recommendedSequence`
- smoke-summary `topLevel*`, `workflow*`, and `followups`

The following payloads should not yet be treated as a permanently stable strong
schema:

- full `inspection` detail
- all nested fields inside `status`, `result`, or `checkpoint`
- the full deep provider/path structure inside `registry`

The more accurate consumption pattern is:

1. first use the top-level routing/follow-up fields to determine the next step
2. then consume `status`, `result`, `checkpoint`, or `registry` details only as
   needed

## Guidance for external harnesses

If you consume these outputs outside the repository, the current recommended
order is:

1. check `ok` first
2. then inspect `scope` or `action`
3. prefer the most relevant command from `agentFollowup.nextAction` or
   `recommendedCommands`
4. only parse `status`, `result`, or `registry` deeply when explanation is
   actually needed

That minimizes coupling to internal provider detail.
