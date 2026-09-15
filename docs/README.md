# zk-agent-cli Docs

This directory is the reference set for product contracts, release rules, and
deeper architecture notes.

It is not the primary first-run path for CLI users.

Choose the public entry surface first:

- project front door: [README.md](../README.md)
- canonical CLI manual:
  [packages/zk-agent-cli/README.md](../packages/zk-agent-cli/README.md)
- shortest verified path: [skills/QUICKSTART.md](../skills/QUICKSTART.md)
- native Codex plugin path:
  [15-codex-plugin-onboarding.md](./15-codex-plugin-onboarding.md)

The current public proof paths live in the root and package READMEs:

- flagship zkSync-native pay
- Agent Pay request capture and follow-up
- hosted approval recovery

Treat those three proof paths as the current public product shell before
dropping into the deeper reference docs below.

The machine-readable contract for those same bounded routes lives in
[10-operator-json-contract.md](./10-operator-json-contract.md).

## Public Product Docs

- [README.md](../README.md)
  product front door and current public proof paths
- [packages/zk-agent-cli/README.md](../packages/zk-agent-cli/README.md)
  canonical CLI manual
- [../skills/QUICKSTART.md](../skills/QUICKSTART.md)
  shortest verified path
- [10-operator-json-contract.md](./10-operator-json-contract.md)
  machine-readable product and routing contracts
- [16-hosted-approval-operated-baseline.md](./16-hosted-approval-operated-baseline.md)
  current hosted approval claim and recovery contract

## Release Docs

- [11-npm-release-gate.md](./11-npm-release-gate.md)
  full RC and `1.0.0` release policy
- [17-release-checklist.md](./17-release-checklist.md)
  short release runbook
- [release-stage-reviews/README.md](./release-stage-reviews/README.md)
  repo-tracked RC review artifacts

## Architecture And Reference Docs

Start here when you need repository reference context rather than day-one
product steps:

1. [10-operator-json-contract.md](./10-operator-json-contract.md)
2. [11-npm-release-gate.md](./11-npm-release-gate.md)
3. [16-hosted-approval-operated-baseline.md](./16-hosted-approval-operated-baseline.md)
4. [17-release-checklist.md](./17-release-checklist.md)
5. [release-stage-reviews/README.md](./release-stage-reviews/README.md)
6. [18-agent-pay-architecture.md](./18-agent-pay-architecture.md)
7. [01-core-differences.md](./01-core-differences.md)
8. [02-aa-transactions.md](./02-aa-transactions.md)
9. [03-paymasters.md](./03-paymasters.md)
10. [04-sessions-and-accounts.md](./04-sessions-and-accounts.md)
11. [05-bridging-and-network-model.md](./05-bridging-and-network-model.md)
12. [06-sdk-and-tooling.md](./06-sdk-and-tooling.md)
13. [07-source-map.md](./07-source-map.md)
14. [08-daily-spend-limit-profile.md](./08-daily-spend-limit-profile.md)
15. [09-sed-lite-profile.md](./09-sed-lite-profile.md)
16. [12-hosted-relay-prototype.md](./12-hosted-relay-prototype.md)
17. [13-session-key-separation.md](./13-session-key-separation.md)
18. [14-best-session-model.md](./14-best-session-model.md)
19. [15-codex-plugin-onboarding.md](./15-codex-plugin-onboarding.md)

Use the root [README.md](../README.md) for the public front door and
[packages/zk-agent-cli/README.md](../packages/zk-agent-cli/README.md) for the
canonical CLI manual.
