# Operator JSON Contract

This document only describes the machine-readable outputs that are already
implemented, already covered by tests, and intended for operators or agent
harnesses.

The goal is not to restate every JSON payload field by field. The goal is to
stabilize the most important contracts on the default product path.

## Scope

The following outputs should currently be treated as the default operator
contract:

- `zk-agent next`
- `zk-agent workflow plan`
- `zk-agent workflow start`
- `zk-agent workflow auto`
- `zk-agent workflow status`
- `zk-agent workflow next`
- `zk-agent workflow run`
- `zk-agent workflow resume`
- `zk-agent workflow list|show|update|delete`
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

## `zk-agent next`

`zk-agent next` is the default top-level routing contract.

### Shared fields

- `scope`
- `nextCommand`
- `agentProfile`
- `agentFollowup`
- `recommendedCommands`

### `scope = "setup"`

This means local config is missing.

Key fields:

```json
{
  "scope": "setup",
  "status": "action-required",
  "nextCommand": "zk-agent setup",
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
  "inspection": { "...": "wallet inspection payload" },
  "summary": { "...": "wallet next summary payload" },
  "nextCommand": "zk-agent workflow pay --wallet main --to <address> --amount <amount>",
  "recommendedCommands": {
    "walletNext": "zk-agent wallet next --name main",
    "walletStatus": "zk-agent wallet status --name main",
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
  "result": { "...": "workflow status payload" },
  "checkpoint": { "...": "stored checkpoint payload" }
}
```

## `zk-agent workflow *`

### `workflow plan`

The most important fields in the current contract are:

- `agentProfile`
- `agentFollowup`
- `inspection`
- `plan`
- `recommendedCommands`

On the plan surface, `recommendedCommands` is the default container for
bridge/swap/token follow-ups. It is not the agent-identity follow-up container.

### `workflow start`

Key fields:

- `workflowRequestId`
- `checkpoint`
- `status`
- `agentProfile`
- `agentFollowup`
- `recommendedCommands`

### `workflow auto`

This is the current default guided-execution contract.

Key fields:

- `source`
- `action`
- `checkpointPersisted`
- `workflowRequestId`
- `status`
- `result`
- `checkpoint`
- `walletApproval`
- `recommendedCommands`
- `agentProfile`
- `agentFollowup`

Two follow-up groups must be distinguished here:

- `recommendedCommands`
  The next step at the current workflow/action layer.
- `agentFollowup`
  The next step at the current local agent-identity layer.

### `workflow status|next|run|resume`

These surfaces currently all include:

- `agentProfile`
- `agentFollowup`
- `recommendedCommands`

Within that set:

- `workflow next`
  additionally includes a simplified `summary`
- `workflow run`
  includes `result` on successful execution
- `workflow resume`
  first verifies whether the checkpoint can actually be resumed

Tokenized workflow outputs should keep the same local-first recovery contract
visible:

- `discoverAssets`
- `discoverOwnedTokens`
- `discoverTokens`
- `inspectToken`
- `discoverPaymasterTokens`
- `inspectPaymasterToken`

### `workflow list|show|update|delete`

These checkpoint-management surfaces now also include:

- `agentProfile`
- `agentFollowup`

That keeps the agent-identity context available even when the harness moves
into checkpoint-management commands.

## `zk-agent wallet request relay-status`

This is the lower-level hosted relay/manual-approval status surface.

Current stable top-level fields:

- `ok`
- `walletRequestId`
- `relay`
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
  "note": "Relay approval expired. Reissue the remote request. If the original request used scoped session flags, add those same policy flags again."
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

## The role of `recommendedCommands`

In the current contract, `recommendedCommands` remains the main container for
action/path follow-ups.

Its contents vary by surface, but the semantics are now stable:

- executable next steps such as wallet/workflow/defaults/token-discovery
- not agent-identity-specific meaning

So the current contract layering is:

- `recommendedCommands`
  execution-path follow-ups
- `agentFollowup`
  local agent-identity follow-ups

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
