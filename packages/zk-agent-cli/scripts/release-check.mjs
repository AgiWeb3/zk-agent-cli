import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const workspaceRoot = resolve(packageDir, '../..');
const packDir = join(packageDir, '.release-pack');
const standaloneEnvKeys = [
  'ZK_AGENT_ACCOUNT_PROFILES_ROOT',
  'ZK_AGENT_OUTPUT',
  'ZK_AGENT_STORAGE_DIR',
  'ZK_AGENT_TOKEN_DIRECTORY_ROOT',
  'ZK_AGENT_WORKSPACE_ROOT',
  'ZKSYNC_SWAP_FEE_TIER',
  'ZKSYNC_SWAP_ROUTER_ADDRESS',
  'ZKSYNC_SYNCSWAP_CLASSIC_FACTORY_ADDRESS',
  'ZKSYNC_SYNCSWAP_ROUTER_ADDRESS'
];

function readPackageJson() {
  return JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
}

function readPackageReadme() {
  return readFileSync(join(packageDir, 'README.md'), 'utf8');
}

function readWorkspacePackageJson() {
  return JSON.parse(readFileSync(join(workspaceRoot, 'package.json'), 'utf8'));
}

function readRootReadme() {
  return readFileSync(join(workspaceRoot, 'README.md'), 'utf8');
}

function readPluginManifest() {
  return JSON.parse(
    readFileSync(join(workspaceRoot, '.codex-plugin', 'plugin.json'), 'utf8')
  );
}

function readPlans() {
  return readFileSync(join(workspaceRoot, 'PLANS.md'), 'utf8');
}

function readProjectState() {
  return readFileSync(join(workspaceRoot, 'PROJECT_STATE.md'), 'utf8');
}

function readReleaseGateDoc() {
  return readFileSync(join(workspaceRoot, 'docs', '11-npm-release-gate.md'), 'utf8');
}

function readOperatorJsonContractDoc() {
  return readFileSync(join(workspaceRoot, 'docs', '10-operator-json-contract.md'), 'utf8');
}

function readSkillQuickstart() {
  return readFileSync(join(workspaceRoot, 'skills', 'QUICKSTART.md'), 'utf8');
}

function readSkillGuide() {
  return readFileSync(join(workspaceRoot, 'skills', 'SKILL.md'), 'utf8');
}

function normalizeWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertReleaseMetadata(pkg) {
  assert.equal(pkg.name, 'zk-agent-cli');
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.bin?.['zk-agent'], 'dist/index.js');
  assert.equal(pkg.bin?.['zksync-agent'], 'dist/index.js');
  assert.equal(pkg.publishConfig?.access, 'public');
  assert.equal(pkg.engines?.node, '>=24');
  assert.equal(Array.isArray(pkg.files), true);
  assert.equal(pkg.files.includes('dist'), true);
  assert.equal(pkg.files.includes('README.md'), true);
  assert.equal(typeof pkg.description, 'string');
  assert.equal(Boolean(pkg.description?.trim()), true);
  assert.equal(typeof pkg.repository?.url, 'string');
  assert.equal(Boolean(pkg.repository?.url?.trim()), true);
  assert.equal(typeof pkg.homepage, 'string');
  assert.equal(Boolean(pkg.homepage?.trim()), true);
  assert.equal(typeof pkg.bugs?.url, 'string');
  assert.equal(Boolean(pkg.bugs?.url?.trim()), true);
  assert.equal(typeof pkg.license, 'string');
  assert.equal(Boolean(pkg.license?.trim()), true);

  const runtimeDeps = Object.entries(pkg.dependencies || {});
  const workspaceRuntimeDeps = runtimeDeps.filter(([, version]) =>
    String(version).startsWith('workspace:')
  );
  assert.equal(
    workspaceRuntimeDeps.length,
    0,
    `Published runtime dependencies must not contain workspace:* entries: ${workspaceRuntimeDeps
      .map(([name]) => name)
      .join(', ')}`
  );
}

function assertVersionAlignment(workspacePkg, packagePkg) {
  assert.equal(
    workspacePkg.version,
    packagePkg.version,
    'Workspace root version and published package version must stay aligned.'
  );
}

function assertPluginManifest(pluginManifest, packagePkg) {
  assert.equal(pluginManifest.name, packagePkg.name);
  assert.equal(
    pluginManifest.version,
    packagePkg.version,
    'Root plugin manifest version must stay aligned with the published package version.'
  );
  assert.equal(typeof pluginManifest.description, 'string');
  assert.equal(Boolean(pluginManifest.description?.trim()), true);
  assert.equal(pluginManifest.skills, './skills/');
  assert.equal(typeof pluginManifest.homepage, 'string');
  assert.equal(Boolean(pluginManifest.homepage?.trim()), true);
  assert.equal(typeof pluginManifest.repository, 'string');
  assert.equal(Boolean(pluginManifest.repository?.trim()), true);
  assert.equal(pluginManifest.license, packagePkg.license);
  assert.equal(Array.isArray(pluginManifest.keywords), true);
  assert.equal(pluginManifest.keywords.length > 0, true);
  assert.equal(typeof pluginManifest.author?.name, 'string');
  assert.equal(Boolean(pluginManifest.author?.name?.trim()), true);
  assert.equal(typeof pluginManifest.interface?.displayName, 'string');
  assert.equal(Boolean(pluginManifest.interface?.displayName?.trim()), true);
  assert.equal(typeof pluginManifest.interface?.shortDescription, 'string');
  assert.equal(Boolean(pluginManifest.interface?.shortDescription?.trim()), true);
  assert.equal(typeof pluginManifest.interface?.longDescription, 'string');
  assert.equal(Boolean(pluginManifest.interface?.longDescription?.trim()), true);
  assert.equal(typeof pluginManifest.interface?.developerName, 'string');
  assert.equal(Boolean(pluginManifest.interface?.developerName?.trim()), true);
  assert.equal(typeof pluginManifest.interface?.category, 'string');
  assert.equal(Boolean(pluginManifest.interface?.category?.trim()), true);
  assert.equal(Array.isArray(pluginManifest.interface?.capabilities), true);
  assert.equal(pluginManifest.interface.capabilities.length > 0, true);
  assert.equal(Array.isArray(pluginManifest.interface?.defaultPrompt), true);
  assert.equal(pluginManifest.interface.defaultPrompt.length > 0, true);
}

function assertPackageReadme(readme) {
  const requiredPatterns = [
    [/## Public Entry Points/, 'Package README must include a Public Entry Points section.'],
    [
      /Choose the entrypoint that matches the environment\./,
      'Package README must explain how to choose the public entrypoint.'
    ],
    [
      /npx skills add https:\/\/github\.com\/AgiWeb3\/zk-agent-cli/,
      'Package README must document the compatible agent-harness skill install path.'
    ],
    [
      /\.codex-plugin\/plugin\.json/,
      'Package README must keep the current skill-vs-plugin boundary explicit.'
    ],
    [/npx zk-agent-cli --help/, 'Package README must document one-shot npx usage.'],
    [/npm install -g zk-agent-cli/, 'Package README must document global install usage.'],
    [/zksync-agent --help/, 'Package README must document the secondary binary name.'],
    [/Node\.js `>=24`/, 'Package README must document the supported Node runtime floor.'],
    [
      /zk-agent setup[\s\S]*zk-agent next[\s\S]*zk-agent wallet create --await-local[\s\S]*zk-agent next[\s\S]*zk-agent workflow pay --wallet main --to <address> --amount <amount>/,
      'Package README must document the shortest success path.'
    ],
    [
      /If the browser is not colocated with the terminal[\s\S]*zk-agent relay inspect --relay-url <relay-url>[\s\S]*zk-agent wallet create --relay-url <relay-url> --wait-relay --prompt-code[\s\S]*zk-agent next/,
      'Package README must document the remote-browser wallet-create fallback on the shortest path.'
    ],
    [
      /If local setup or wallet readiness is unclear, start with `zk-agent doctor`\.[\s\S]*without live RPC reads/,
      'Package README must document the local-only doctor entrypoint.'
    ],
    [
      /## Discovery Path[\s\S]*zk-agent assets --wallet main[\s\S]*zk-agent tokens --wallet main --owned[\s\S]*zk-agent tokens --chain zksync-sepolia[\s\S]*zk-agent resolve-token --chain zksync-sepolia --symbol USDC[\s\S]*zk-agent tokens --chain zksync-sepolia --role paymaster-fee-token[\s\S]*zk-agent resolve-token --chain zksync-sepolia --symbol <symbol> --role paymaster-fee-token[\s\S]*zk-agent defaults/,
      'Package README must document the discovery/defaults path and its command order.'
    ],
    [
      /## Direct Command Escape Hatches[\s\S]*zk-agent send-token --wallet main --symbol USDC[\s\S]*zk-agent swap --wallet main --token-in-symbol USDC --token-out-symbol ETH[\s\S]*zk-agent fund --wallet main --symbol USDC[\s\S]*zk-agent deposit --wallet main --symbol USDC[\s\S]*zk-agent withdraw --wallet main --symbol USDC/,
      'Package README must document the symbol-first direct-command escape hatches.'
    ],
    [
      /Current direct-command behavior:[\s\S]*send-token`, `fund`, `deposit`, and `withdraw` accept symbol-first token[\s\S]*`swap` follows the current registry-backed validated route by default[\s\S]*`bridge` can reuse the tracked default destination route/,
      'Package README must document the current direct-command behavior contract.'
    ],
    [
      /## Local Agent Identity[\s\S]*wallet approval and workflow execution do not[\s\S]*depend on it[\s\S]*zk-agent agent status[\s\S]*zk-agent agent set --name "<operator-name>" --wallet main[\s\S]*zk-agent agent show/,
      'Package README must document the optional local agent-identity path.'
    ],
    [
      /zk-agent wallet reapprove --name main --await-local/,
      'Package README must document the shortest stale-session recovery path.'
    ],
    [
      /if the blocker is unclear, run `zk-agent doctor --wallet <wallet>` first/,
      'Package README must document doctor as the first local recovery diagnostic.'
    ],
    [/~\/\.zk-agent\//, 'Package README must document the default local storage path.'],
    [
      /ZKSYNC_SEPOLIA_RPC_URL=[\s\S]*ETHEREUM_SEPOLIA_RPC_URL=/,
      'Package README must document the relevant Sepolia RPC environment variables.'
    ],
    [
      /You do not need a custom `\.env` just to run `setup`, `next`, or create a local[\s\S]*wallet request\./,
      'Package README must document the first-run .env boundary.'
    ],
    [
      /zk-agent relay inspect --relay-url <relay-url>[\s\S]*zk-agent wallet create --relay-url <relay-url> --wait-relay --prompt-code[\s\S]*zk-agent wallet reapprove --name main --relay-url <relay-url> --wait-relay --prompt-code/,
      'Package README must document the shortest relay-backed approval path.'
    ],
    [/workflows\/\*\.json/, 'Package README must document the workflows storage path correctly.'],
    [/## Common Failures/, 'Package README must include a Common Failures section.'],
    [
      /Connector callback never arrives:/,
      'Package README must document connector callback repair guidance.'
    ],
    [
      /Workflow stops on funding:/,
      'Package README must document funding-stop repair guidance.'
    ]
  ];

  for (const [pattern, message] of requiredPatterns) {
    assert.match(readme, pattern, message);
  }
}

function assertRepositoryDocs(rootReadme, quickstart, skillGuide) {
  const requiredChecks = [
    [
      rootReadme,
      /## Public Entry Points/,
      'Root README must expose a Public Entry Points section.'
    ],
    [
      rootReadme,
      /npx skills add https:\/\/github\.com\/AgiWeb3\/zk-agent-cli[\s\S]*npx zk-agent-cli --help[\s\S]*npm install -g zk-agent-cli/,
      'Root README must keep the skill, one-shot CLI, and global CLI entrypoints together.'
    ],
    [
      rootReadme,
      /\.codex-plugin\/plugin\.json/,
      'Root README must keep the current skill-vs-plugin boundary explicit.'
    ],
    [
      rootReadme,
      /zk-agent setup[\s\S]*zk-agent next[\s\S]*zk-agent wallet create --await-local[\s\S]*zk-agent next[\s\S]*zk-agent workflow pay --wallet main --to <address> --amount <amount>/,
      'Root README must keep the canonical terminal path visible.'
    ],
    [
      rootReadme,
      /If local config or wallet readiness is unclear before you choose a fork, run[\s\S]*`zk-agent doctor`[\s\S]*without live RPC reads/,
      'Root README must keep the local-only doctor diagnostic visible.'
    ],
    [
      rootReadme,
      /Discovery is also productized around one local-first path:[\s\S]*`assets` is the preferred single-chain asset view[\s\S]*`tokens --wallet <name> --owned` is the narrower ERC-20 holdings view[\s\S]*`tokens --chain <chain>` and `resolve-token` are the symbol-first discovery[\s\S]*surfaces[\s\S]*`tokens --chain <chain> --role paymaster-fee-token`[\s\S]*`resolve-token --chain <chain> --symbol <symbol> --role paymaster-fee-token`[\s\S]*`defaults` is the machine-readable registry escape hatch/,
      'Root README must keep the discovery/defaults contract visible.'
    ],
    [
      rootReadme,
      /Direct-command escape hatches still follow that same product contract:[\s\S]*`send-token`, `fund`, `deposit`, and `withdraw` can resolve symbols locally[\s\S]*`swap` follows the current registry-backed validated path by default[\s\S]*`bridge` can reuse the tracked default destination route/,
      'Root README must keep the direct-command symbol/default contract visible.'
    ],
    [
      rootReadme,
      /Optional local operator identity is a separate layer, not a prerequisite:[\s\S]*`zk-agent agent status`[\s\S]*`zk-agent agent set --name <name> --wallet main`[\s\S]*`zk-agent agent show`[\s\S]*wallet approval and workflow execution still work without a saved local[\s\S]*agent profile/,
      'Root README must keep the optional local operator-identity contract visible.'
    ],
    [
      rootReadme,
      /If the browser is not colocated with the terminal[\s\S]*zk-agent relay inspect --relay-url <relay-url>[\s\S]*zk-agent wallet create --relay-url <relay-url> --wait-relay --prompt-code[\s\S]*zk-agent next/,
      'Root README must keep the remote-browser wallet-create fallback visible.'
    ],
    [
      quickstart,
      /Choose the entrypoint that matches the environment\./,
      'Quickstart must explain how to choose the entrypoint.'
    ],
    [
      quickstart,
      /npx skills add https:\/\/github\.com\/AgiWeb3\/zk-agent-cli[\s\S]*npx zk-agent-cli --help[\s\S]*npm install -g zk-agent-cli/,
      'Quickstart must keep the skill, one-shot CLI, and global CLI entrypoints together.'
    ],
    [
      quickstart,
      /\.codex-plugin\/plugin\.json/,
      'Quickstart must keep the current skill-vs-plugin boundary explicit.'
    ],
    [
      quickstart,
      /zk-agent setup[\s\S]*zk-agent wallet create --await-local[\s\S]*zk-agent next[\s\S]*zk-agent workflow pay --wallet main --to <address> --amount <amount>/,
      'Quickstart must keep the canonical terminal path visible.'
    ],
    [
      quickstart,
      /Use `assets` as the default single-chain asset entrypoint\.[\s\S]*`balances --owned-tokens`[\s\S]*`tokens --owned`[\s\S]*`zk-agent defaults` now also[\s\S]*shows that source order[\s\S]*zk-agent tokens --chain zksync-sepolia[\s\S]*zk-agent resolve-token --chain zksync-sepolia --symbol USDC[\s\S]*zk-agent tokens --chain zksync-sepolia --role paymaster-fee-token[\s\S]*zk-agent resolve-token --chain zksync-sepolia --symbol USDC --role paymaster-fee-token/,
      'Quickstart must keep the discovery/defaults contract visible.'
    ],
    [
      quickstart,
      /the CLI auto-loads `\.env`[\s\S]*wallet-request creation usually work without custom RPC values/,
      'Quickstart must keep the first-run .env boundary visible.'
    ],
    [
      skillGuide,
      /Choose the entrypoint that matches the environment\./,
      'Primary skill guide must explain how to choose the entrypoint.'
    ],
    [
      skillGuide,
      /npx skills add https:\/\/github\.com\/AgiWeb3\/zk-agent-cli[\s\S]*zk-agent <command>[\s\S]*npx zk-agent-cli <command>[\s\S]*pnpm zk-agent <command>/,
      'Primary skill guide must keep the skill, packaged CLI, and source-checkout surfaces aligned.'
    ],
    [
      skillGuide,
      /\.codex-plugin\/plugin\.json/,
      'Primary skill guide must keep the current skill-vs-plugin boundary explicit.'
    ],
    [
      skillGuide,
      /zk-agent setup[\s\S]*zk-agent next[\s\S]*zk-agent wallet create --await-local[\s\S]*zk-agent workflow pay --wallet main --to <address> --amount <amount>/,
      'Primary skill guide must keep the canonical operator path visible.'
    ],
    [
      skillGuide,
      /When local setup or wallet readiness is unclear, run `zk-agent doctor` first\.[\s\S]*without live RPC reads/,
      'Primary skill guide must keep the doctor diagnostic visible.'
    ],
    [
      skillGuide,
      /Use `zk-agent defaults` when you need the current token-registry source[\s\S]*order[\s\S]*Use `zk-agent tokens --chain zksync-sepolia`[\s\S]*Use `zk-agent tokens --chain zksync-sepolia --role paymaster-fee-token`[\s\S]*Use `zk-agent tokens --wallet main --owned`[\s\S]*default asset view, start with `assets`\.[\s\S]*Use `zk-agent resolve-token --chain zksync-sepolia --symbol USDC`[\s\S]*Add `--role swap-token-a\|swap-token-b\|paymaster-fee-token`/,
      'Primary skill guide must keep the discovery/defaults contract visible.'
    ],
    [
      skillGuide,
      /the CLI auto-loads `\.env`[\s\S]*wallet-request creation usually work without custom RPC values/,
      'Primary skill guide must keep the first-run .env boundary visible.'
    ]
  ];

  for (const [source, pattern, message] of requiredChecks) {
    assert.match(source, pattern, message);
  }
}

function assertCurrentVersionDocs({
  version,
  rootReadme,
  plans,
  projectState,
  releaseGateDoc
}) {
  const escapedVersion = escapeRegExp(version);
  const requiredChecks = [
    [
      rootReadme,
      new RegExp(`zk-agent-cli@${escapedVersion}`),
      'Root README must mention the current published package version.'
    ],
    [
      rootReadme,
      new RegExp(`beta -> ${escapedVersion}`),
      'Root README must show the current beta dist-tag target.'
    ],
    [
      rootReadme,
      new RegExp(`latest -> ${escapedVersion}`),
      'Root README must show the current latest dist-tag target.'
    ],
    [
      plans,
      new RegExp(`zk-agent-cli@${escapedVersion}`),
      'PLANS.md must mention the current published package version in the closed baseline.'
    ],
    [
      projectState,
      new RegExp(`zk-agent-cli@${escapedVersion}`),
      'PROJECT_STATE.md must mention the current published package version.'
    ],
    [
      releaseGateDoc,
      new RegExp(`npm view zk-agent-cli version -> ${escapedVersion}`),
      'Release gate doc must record the current published npm version.'
    ],
    [
      releaseGateDoc,
      new RegExp(`npm view zk-agent-cli@latest version -> ${escapedVersion}`),
      'Release gate doc must record the current latest dist-tag target.'
    ],
    [
      releaseGateDoc,
      new RegExp(`npm view zk-agent-cli@beta version -> ${escapedVersion}`),
      'Release gate doc must record the current beta dist-tag target.'
    ],
    [
      releaseGateDoc,
      new RegExp(
        `npm view zk-agent-cli dist-tags --json -> \\{"latest":"${escapedVersion}","beta":"${escapedVersion}"\\}`
      ),
      'Release gate doc must record the current dist-tag alignment.'
    ]
  ];

  for (const [source, pattern, message] of requiredChecks) {
    assert.match(source, pattern, message);
  }
}

function assertTopLevelHelpContract(helpOutput) {
  const help = normalizeWhitespace(helpOutput);
  const requiredSnippets = [
    'Local-first zkSync Era CLI for wallet approval, workflow execution, and hosted relay recovery',
    'Public entrypoints:',
    'Agent harness: npx skills add https://github.com/AgiWeb3/zk-agent-cli',
    'One-shot CLI: npx zk-agent-cli --help',
    'Global CLI: npm install -g zk-agent-cli',
    'Canonical terminal path: zk-agent setup zk-agent next zk-agent wallet create --await-local zk-agent next zk-agent workflow pay --wallet main --to <address> --amount <amount>',
    'No custom .env is required for setup, next, or wallet create/reapprove request generation.',
    'Add RPC env vars later, before live reads or broadcasts.',
    'If local setup or wallet state is unclear: zk-agent doctor',
    'Use `zk-agent next --request-id <id>` to continue a stored workflow checkpoint.',
    'Use `zk-agent relay inspect --relay-url <url>` plus `zk-agent wallet create|reapprove --relay-url <url> --wait-relay --prompt-code` when the browser is not colocated.',
    'Use `zk-agent wallet --help` for wallet recovery details and `zk-agent workflow --help` when the intent is broader than the flagship native-send path.'
  ];

  for (const snippet of requiredSnippets) {
    assert.equal(
      help.includes(snippet),
      true,
      `Top-level CLI help is missing required public-entrypoint contract text: ${snippet}`
    );
  }
}

function assertSetupHelpContract(helpOutput) {
  const help = normalizeWhitespace(helpOutput);
  const requiredSnippets = [
    'What setup does:',
    'Writes the local default chain and connector URL used by the first-run path.',
    'After setup, stay on the canonical local-first path: zk-agent next zk-agent wallet create --await-local zk-agent next',
    'If the browser is not colocated with this terminal, switch at the wallet step: zk-agent relay inspect --relay-url <url> zk-agent wallet create --relay-url <url> --wait-relay --prompt-code zk-agent next',
    'Environment note: No custom .env is required for setup, next, or wallet request creation. Add RPC env vars later, before live reads or broadcasts.'
  ];

  for (const snippet of requiredSnippets) {
    assert.equal(
      help.includes(snippet),
      true,
      `Setup help is missing required onboarding contract text: ${snippet}`
    );
  }
}

function assertNextHelpContract(helpOutput) {
  const help = normalizeWhitespace(helpOutput);
  const requiredSnippets = [
    'Use `next` as the product entrypoint:',
    'Fresh local-first routing: zk-agent setup zk-agent next zk-agent wallet create --await-local zk-agent next',
    'If the browser is remote, switch at the wallet step instead of waiting for a local callback: zk-agent relay inspect --relay-url <url> zk-agent wallet create --relay-url <url> --wait-relay --prompt-code zk-agent next',
    'Continue a stored workflow checkpoint: zk-agent next --request-id <id>',
    'Stay on the wallet layer only when you need wallet-specific remediation: zk-agent wallet next --name main',
    'Switch to the hosted remote-approval path only when the browser is not colocated: zk-agent wallet --help',
    'Stay on the workflow layer only when you already have an explicit workflow or checkpoint: zk-agent workflow next --request-id <id>'
  ];

  for (const snippet of requiredSnippets) {
    assert.equal(
      help.includes(snippet),
      true,
      `Next help is missing required onboarding contract text: ${snippet}`
    );
  }
}

function assertDoctorHelpContract(helpOutput) {
  const help = normalizeWhitespace(helpOutput);
  const requiredSnippets = [
    'Use `doctor` when local state is unclear:',
    'zk-agent doctor',
    'zk-agent doctor --wallet main',
    'zk-agent doctor --wallet main --relay-url https://relay.example.com',
    'Default behavior: Inspects saved config, local wallet approval metadata, local signer state, and the shortest next command without requiring live RPC reads.',
    'Remote-browser recovery path: Pass --relay-url when you want the remote approval fallback commands to use a concrete relay URL instead of a placeholder.'
  ];

  for (const snippet of requiredSnippets) {
    assert.equal(
      help.includes(snippet),
      true,
      `Doctor help is missing required onboarding contract text: ${snippet}`
    );
  }
}

function assertDefaultsHelpContract(helpOutput) {
  const help = normalizeWhitespace(helpOutput);
  const requiredSnippets = [
    'Discovery defaults path:',
    'Use `defaults` as the machine-readable registry escape hatch for:',
    'For wallet-scoped asset discovery, prefer: zk-agent assets --wallet main',
    'For symbol-first token discovery, prefer: zk-agent tokens --chain zksync-sepolia zk-agent resolve-token --chain zksync-sepolia --symbol USDC'
  ];

  for (const snippet of requiredSnippets) {
    assert.equal(
      help.includes(snippet),
      true,
      `Defaults help is missing required discovery contract text: ${snippet}`
    );
  }
}

function assertAssetsHelpContract(helpOutput) {
  const help = normalizeWhitespace(helpOutput);
  const requiredSnippets = [
    'Discovery asset path:',
    'Preferred single-chain asset entrypoint: zk-agent assets --wallet main',
    'Narrower owned ERC-20 registry subset: zk-agent tokens --wallet main --owned',
    'Symbol-first token lookup before a tokenized command: zk-agent tokens --chain zksync-sepolia --symbol USDC zk-agent resolve-token --chain zksync-sepolia --symbol USDC',
    'For the machine-readable registry/default catalog: zk-agent defaults'
  ];

  for (const snippet of requiredSnippets) {
    assert.equal(
      help.includes(snippet),
      true,
      `Assets help is missing required discovery contract text: ${snippet}`
    );
  }
}

function assertTokensHelpContract(helpOutput) {
  const help = normalizeWhitespace(helpOutput);
  const requiredSnippets = [
    'Discovery token path:',
    'Start with the preferred wallet asset view when you need balances plus tracked ERC-20 holdings: zk-agent assets --wallet main',
    'Use the narrower owned ERC-20 registry subset when you only want held tokens: zk-agent tokens --wallet main --owned',
    'Use chain-scoped discovery before choosing a token address: zk-agent tokens --chain zksync-sepolia zk-agent tokens --chain zksync-sepolia --symbol USDC zk-agent tokens --chain zksync-sepolia --role paymaster-fee-token',
    'For one direct token-resolution check: zk-agent resolve-token --chain zksync-sepolia --symbol USDC',
    'For the full defaults/registry catalog: zk-agent defaults'
  ];

  for (const snippet of requiredSnippets) {
    assert.equal(
      help.includes(snippet),
      true,
      `Tokens help is missing required discovery contract text: ${snippet}`
    );
  }
}

function assertResolveTokenHelpContract(helpOutput) {
  const help = normalizeWhitespace(helpOutput);
  const requiredSnippets = [
    'Resolve-token path:',
    'Symbol-first resolution on one active chain: zk-agent resolve-token --chain zksync-sepolia --symbol USDC',
    'Use the stored wallet to infer the active chain: zk-agent resolve-token --wallet main --symbol USDC',
    'Use broader chain discovery before resolution when you still need the candidate set: zk-agent tokens --chain zksync-sepolia',
    'Use the wallet asset entrypoint when the real question is balances/holdings: zk-agent assets --wallet main',
    'Use the registry/default catalog when you need tracked roles or source order: zk-agent defaults'
  ];

  for (const snippet of requiredSnippets) {
    assert.equal(
      help.includes(snippet),
      true,
      `Resolve-token help is missing required discovery contract text: ${snippet}`
    );
  }
}

function assertWalletHelpContract(helpOutput) {
  const help = normalizeWhitespace(helpOutput);
  const requiredSnippets = [
    'Local-first wallet path:',
    'First bootstrap: zk-agent wallet create --await-local zk-agent next',
    'Restore approval metadata for an existing wallet: zk-agent wallet reapprove --name main --await-local zk-agent next',
    'Attach a local signer when approval is still present: zk-agent wallet signer attach --name main --private-key <hex> zk-agent next',
    'Hosted remote approval path: zk-agent relay inspect --relay-url <url> zk-agent wallet create --relay-url <url> --wait-relay --prompt-code zk-agent wallet reapprove --name main --relay-url <url> --wait-relay --prompt-code zk-agent next'
  ];

  for (const snippet of requiredSnippets) {
    assert.equal(
      help.includes(snippet),
      true,
      `Wallet help is missing required onboarding contract text: ${snippet}`
    );
  }
}

function assertWorkflowHelpContract(helpOutput) {
  const help = normalizeWhitespace(helpOutput);
  const requiredSnippets = [
    'Flagship native pay path: zk-agent workflow pay --wallet main --to <address> --amount <amount>',
    'Broader multi-intent guided path: zk-agent workflow auto --wallet main --intent <intent> [goal flags] --create-checkpoint --execute-when-ready',
    'Checkpointed execution: zk-agent workflow start --wallet main --intent <intent> [goal flags] zk-agent workflow status --request-id <id> zk-agent workflow next --request-id <id> zk-agent workflow resume --request-id <id> [--broadcast]',
    'Funding-only step: zk-agent workflow fund --wallet main --amount <amount> --execute',
    'Token/discovery recovery path: zk-agent assets --wallet main zk-agent tokens --wallet main --owned zk-agent tokens --chain zksync-sepolia zk-agent resolve-token --chain zksync-sepolia --symbol USDC',
    'Approval-based paymaster fee-token recovery: zk-agent tokens --chain zksync-sepolia --role paymaster-fee-token zk-agent resolve-token --chain zksync-sepolia --symbol <symbol> --role paymaster-fee-token zk-agent defaults',
    'Lower-level one-shot escape hatch: zk-agent workflow run --wallet main --intent <intent> [goal flags]'
  ];

  for (const snippet of requiredSnippets) {
    assert.equal(
      help.includes(snippet),
      true,
      `Workflow help is missing required onboarding contract text: ${snippet}`
    );
  }

  assert.equal(
    helpOutput.indexOf('pay [options]') < helpOutput.indexOf('auto [options]'),
    true,
    'Workflow help must list the flagship pay path ahead of workflow auto.'
  );
}

function assertBridgeHelpContract(helpOutput) {
  const help = normalizeWhitespace(helpOutput);
  const requiredSnippets = [
    '--to-chain <chain> Destination chain key or id. Optional when the current chain has a tracked default bridge route'
  ];

  for (const snippet of requiredSnippets) {
    assert.equal(
      help.includes(snippet),
      true,
      `Bridge help is missing required direct-command contract text: ${snippet}`
    );
  }
}

function assertSendTokenHelpContract(helpOutput) {
  const help = normalizeWhitespace(helpOutput);
  const requiredSnippets = [
    '--token <address> ERC-20 token contract address. Optional when --symbol resolves from the configured token registry',
    '--symbol <symbol> Token symbol for display. Also used for token-registry lookup when --token is omitted',
    '--role <role> Optional defaults-registry role filter for symbol-based token resolution'
  ];

  for (const snippet of requiredSnippets) {
    assert.equal(
      help.includes(snippet),
      true,
      `Send-token help is missing required direct-command contract text: ${snippet}`
    );
  }
}

function assertSwapHelpContract(helpOutput) {
  const help = normalizeWhitespace(helpOutput);
  const requiredSnippets = [
    '--token-in <address> Input ERC-20 token contract address. Optional when --token-in-symbol resolves from the configured token registry',
    '--token-out <address> Output ERC-20 token contract address. Optional when --token-out-symbol resolves from the configured token registry',
    '--protocol <protocol> Optional swap protocol override: uniswap-v3-exact-input-single or syncswap-classic. Defaults to the current registry-backed validated swap path',
    '--token-in-role <role> Optional defaults-registry role filter for input symbol-based token resolution',
    '--token-out-role <role> Optional defaults-registry role filter for output symbol-based token resolution'
  ];

  for (const snippet of requiredSnippets) {
    assert.equal(
      help.includes(snippet),
      true,
      `Swap help is missing required direct-command contract text: ${snippet}`
    );
  }
}

function assertFundHelpContract(helpOutput) {
  const help = normalizeWhitespace(helpOutput);
  const requiredSnippets = [
    '--token <address> Optional token address to embed into the suggested funding commands. Also optional when --symbol resolves from the configured token registry',
    '--role <role> Optional defaults-registry role filter for symbol-based token resolution'
  ];

  for (const snippet of requiredSnippets) {
    assert.equal(
      help.includes(snippet),
      true,
      `Fund help is missing required direct-command contract text: ${snippet}`
    );
  }
}

function assertDepositHelpContract(helpOutput) {
  const help = normalizeWhitespace(helpOutput);
  const requiredSnippets = [
    '--token <address> L1 token contract address. Omit for the native token path or when --symbol resolves from the configured token registry',
    '--role <role> Optional defaults-registry role filter for symbol-based token resolution'
  ];

  for (const snippet of requiredSnippets) {
    assert.equal(
      help.includes(snippet),
      true,
      `Deposit help is missing required direct-command contract text: ${snippet}`
    );
  }
}

function assertWithdrawHelpContract(helpOutput) {
  const help = normalizeWhitespace(helpOutput);
  const requiredSnippets = [
    '--token <address> L2 token contract address. Omit for the native token path or when --symbol resolves from the configured token registry',
    '--role <role> Optional defaults-registry role filter for symbol-based token resolution'
  ];

  for (const snippet of requiredSnippets) {
    assert.equal(
      help.includes(snippet),
      true,
      `Withdraw help is missing required direct-command contract text: ${snippet}`
    );
  }
}

function assertWalletRequestHelpContract(helpOutput) {
  const help = normalizeWhitespace(helpOutput);
  const requiredSnippets = [
    'Wallet request path:',
    'Colocated browser + terminal: zk-agent wallet request await-local --request-id <id>',
    'Remote relay completion: zk-agent wallet request relay-publish --request-id <id> --relay-url <url> zk-agent wallet request relay-status --request-id <id> --relay-url <url> --wait zk-agent wallet request approve --request-id <id> --relay-url <url> --code <code> --wait',
    'If relay-status returns status = expired: zk-agent relay inspect --relay-url <url> zk-agent wallet create|reapprove --relay-url <url> --wait-relay --prompt-code'
  ];

  for (const snippet of requiredSnippets) {
    assert.equal(
      help.includes(snippet),
      true,
      `Wallet request help is missing required public contract text: ${snippet}`
    );
  }

  assert.equal(
    helpOutput.indexOf('list') < helpOutput.indexOf('show [options]'),
    true,
    'Wallet request help must list list before show.'
  );
  assert.equal(
    helpOutput.indexOf('show [options]') < helpOutput.indexOf('await-local [options]'),
    true,
    'Wallet request help must list show before await-local.'
  );
  assert.equal(
    helpOutput.indexOf('await-local [options]') < helpOutput.indexOf('approve [options]'),
    true,
    'Wallet request help must list await-local before approve.'
  );
}

function assertWalletSignerHelpContract(helpOutput) {
  const help = normalizeWhitespace(helpOutput);
  const requiredSnippets = [
    'Wallet signer path:',
    'Inspect the stored local execution signer state: zk-agent wallet signer show --name main',
    'Attach a local execution signer without rebuilding approval metadata: zk-agent wallet signer attach --name main --private-key <hex>',
    'Remove the stored local execution signer: zk-agent wallet signer remove --name main'
  ];

  for (const snippet of requiredSnippets) {
    assert.equal(
      help.includes(snippet),
      true,
      `Wallet signer help is missing required public contract text: ${snippet}`
    );
  }

  assert.equal(
    helpOutput.indexOf('show [options]') < helpOutput.indexOf('attach [options]'),
    true,
    'Wallet signer help must list show before attach.'
  );
  assert.equal(
    helpOutput.indexOf('attach [options]') < helpOutput.indexOf('remove [options]'),
    true,
    'Wallet signer help must list attach before remove.'
  );
}

function assertSmartAccountHelpContract(helpOutput) {
  const help = normalizeWhitespace(helpOutput);
  const requiredSnippets = [
    'Smart-account path:',
    'Predict from a built-in profile: zk-agent wallet smart-account predict --name main --profile sed-lite',
    'Deploy and persist the new execution address: zk-agent wallet smart-account deploy --name main --profile sed-lite',
    'Inspect or update built-in SED behaviors after deployment: zk-agent wallet smart-account sed-lite hooks --name main zk-agent wallet smart-account daily-spend-limit show --name main'
  ];

  for (const snippet of requiredSnippets) {
    assert.equal(
      help.includes(snippet),
      true,
      `Smart-account help is missing required public contract text: ${snippet}`
    );
  }

  assert.equal(
    helpOutput.indexOf('profiles') < helpOutput.indexOf('predict [options]'),
    true,
    'Smart-account help must list profiles before predict.'
  );
  assert.equal(
    helpOutput.indexOf('predict [options]') < helpOutput.indexOf('deploy [options]'),
    true,
    'Smart-account help must list predict before deploy.'
  );
}

function assertRelayHelpContract(helpOutput) {
  const help = normalizeWhitespace(helpOutput);
  const requiredSnippets = [
    'Hosted remote-approval path: zk-agent relay serve --public-origin https://relay.example.com zk-agent relay inspect --relay-url <url> zk-agent wallet create --relay-url <url> --wait-relay --prompt-code zk-agent wallet reapprove --name main --relay-url <url> --wait-relay --prompt-code',
    'Keep `wallet create|reapprove --await-local` as the default baseline when the browser and terminal are colocated.',
    'Use `relay inspect` before sending operators to a hosted share link so the public origin, connector UI, and hosted-readiness contract are visible.'
  ];

  for (const snippet of requiredSnippets) {
    assert.equal(
      help.includes(snippet),
      true,
      `Relay help is missing required public contract text: ${snippet}`
    );
  }
}

function assertAgentHelpContract(helpOutput) {
  const help = normalizeWhitespace(helpOutput);
  const requiredSnippets = [
    'Agent identity path: zk-agent agent status zk-agent agent set --name "SED Operator" --wallet main zk-agent agent show',
    'Portable local profile management: zk-agent agent export zk-agent agent import --payload @agent-profile.json --overwrite',
    'Remove the saved local profile: zk-agent agent clear',
    'This profile is optional. Wallet approval and workflow execution still work without a saved local agent profile.'
  ];

  for (const snippet of requiredSnippets) {
    assert.equal(
      help.includes(snippet),
      true,
      `Agent help is missing required public contract text: ${snippet}`
    );
  }
}

function assertAgentStatusPayload(payload) {
  assert.equal(payload.ok, true);
  assert.equal(payload.profileExists, false);
  assert.equal(payload.profile, null);
  assert.equal(payload.plugin?.status, 'local-profile');
  assert.equal(typeof payload.plugin?.milestone, 'string');
  assert.equal(payload.plugin.milestone.length > 0, true);
  assert.equal(
    payload.recommendedCommands?.status,
    'zk-agent agent status'
  );
  assert.equal(
    payload.recommendedCommands?.show,
    'zk-agent agent show'
  );
  assert.equal(
    payload.recommendedCommands?.export,
    'zk-agent agent export'
  );
  assert.equal(
    payload.recommendedCommands?.import,
    'zk-agent agent import --payload @agent-profile.json'
  );
  assert.equal(
    payload.recommendedCommands?.set,
    'zk-agent agent set --name <name> --wallet main'
  );
}

function assertDoctorSetupPayload(payload) {
  assert.equal(payload.ok, true);
  assert.equal(payload.scope, 'setup');
  assert.equal(payload.walletName, 'main');
  assert.deepEqual(payload.config, { exists: false });
  assert.equal(payload.wallet, null);
  assert.equal(payload.summary?.stage, 'setup');
  assert.equal(payload.summary?.configExists, false);
  assert.equal(payload.summary?.walletExists, false);
  assert.equal(payload.summary?.approvalReady, null);
  assert.equal(payload.summary?.localExecutionKeyStored, null);
  assert.equal(payload.summary?.relayUrl, null);
  assert.equal(payload.summary?.nextAction, 'zk-agent setup');
  assert.equal(payload.summary?.localOnly, true);
  assert.equal(payload.nextAction, 'zk-agent setup');
  assert.deepEqual(payload.recommendedCommands, {
    setup: 'zk-agent setup',
    next: 'zk-agent next',
    inspectDefaults: 'zk-agent defaults'
  });
}

function assertOperatorJsonContract(doc) {
  const requiredChecks = [
    [
      /## `zk-agent doctor`[\s\S]*local-only onboarding and wallet-recovery diagnostic[\s\S]*Current stable top-level fields:[\s\S]*`ok`[\s\S]*`scope`[\s\S]*`walletName`[\s\S]*`config`[\s\S]*`wallet`[\s\S]*`summary`[\s\S]*`agentProfile`[\s\S]*`agentFollowup`[\s\S]*`nextAction`[\s\S]*`recommendedCommands`[\s\S]*Current stable `scope` values:[\s\S]*`setup`[\s\S]*`wallet-bootstrap`[\s\S]*`wallet-recovery`[\s\S]*`wallet-ready`[\s\S]*Current stable `config` fields:[\s\S]*`exists`[\s\S]*`defaultChain`[\s\S]*`connectorUrl`[\s\S]*`provider`[\s\S]*Current stable `wallet` fields when present:[\s\S]*`exists`[\s\S]*`walletName`[\s\S]*`walletAddress`[\s\S]*`chain`[\s\S]*`chainId`[\s\S]*`accountKind`[\s\S]*`smartAccountProfileId`[\s\S]*`syncedAt`[\s\S]*`approvalReady`[\s\S]*`localExecutionKeyStored`[\s\S]*`legacySessionKeyStored`[\s\S]*`signerType`[\s\S]*`signerAddress`[\s\S]*`signerSource`[\s\S]*Current stable `summary` fields:[\s\S]*`stage`[\s\S]*`configExists`[\s\S]*`walletExists`[\s\S]*`approvalReady`[\s\S]*`localExecutionKeyStored`[\s\S]*`relayUrl`[\s\S]*`nextAction`[\s\S]*`localOnly`[\s\S]*`notes`/,
      'Operator JSON contract doc must describe the doctor top-level contract.'
    ],
    [
      /### `scope = "setup"`[\s\S]*"scope": "setup"[\s\S]*"config": \{[\s\S]*"exists": false[\s\S]*"summary": \{[\s\S]*"stage": "setup"[\s\S]*"nextAction": "zk-agent setup"[\s\S]*"localOnly": true[\s\S]*"recommendedCommands": \{[\s\S]*"setup": "zk-agent setup"[\s\S]*"next": "zk-agent next"[\s\S]*"inspectDefaults": "zk-agent defaults"/,
      'Operator JSON contract doc must describe the doctor setup contract.'
    ],
    [
      /### `scope = "wallet-bootstrap"`[\s\S]*"scope": "wallet-bootstrap"[\s\S]*"defaultChain": "zksync-sepolia"[\s\S]*"connectorUrl": "http:\/\/localhost:4444"[\s\S]*"provider": "zksync-sso"[\s\S]*"nextAction": "zk-agent wallet create --await-local"[\s\S]*"recommendedCommands": \{[\s\S]*"createWallet": "zk-agent wallet create --await-local"[\s\S]*"relayInspect": "zk-agent relay inspect --relay-url https:\/\/relay\.example\.com"[\s\S]*"createWalletRemote": "zk-agent wallet create --relay-url https:\/\/relay\.example\.com --wait-relay --prompt-code"/,
      'Operator JSON contract doc must describe the doctor wallet-bootstrap contract.'
    ],
    [
      /### `scope = "wallet-recovery"`[\s\S]*"scope": "wallet-recovery"[\s\S]*"approvalReady": false[\s\S]*"localExecutionKeyStored": false[\s\S]*"nextAction": "zk-agent wallet reapprove --name main --await-local"[\s\S]*"recommendedCommands": \{[\s\S]*"walletStatus": "zk-agent wallet status --name main"[\s\S]*"walletNext": "zk-agent wallet next --name main"[\s\S]*"signerShow": "zk-agent wallet signer show --name main"[\s\S]*"relayInspect": "zk-agent relay inspect --relay-url https:\/\/relay\.example\.com"[\s\S]*"reapproveRemote": "zk-agent wallet reapprove --name main --relay-url https:\/\/relay\.example\.com --wait-relay --prompt-code"[\s\S]*"reapprove": "zk-agent wallet reapprove --name main --await-local"[\s\S]*When approval metadata is present but the local execution signer is missing[\s\S]*`zk-agent wallet signer attach --name main --private-key <hex>`[\s\S]*`attachSigner`[\s\S]*`reapprove`/,
      'Operator JSON contract doc must describe the doctor wallet-recovery contract.'
    ],
    [
      /### `scope = "wallet-ready"`[\s\S]*"scope": "wallet-ready"[\s\S]*"approvalReady": true[\s\S]*"localExecutionKeyStored": true[\s\S]*"nextAction": "zk-agent next"[\s\S]*"recommendedCommands": \{[\s\S]*"next": "zk-agent next"[\s\S]*"walletStatus": "zk-agent wallet status --name main"[\s\S]*"walletNext": "zk-agent wallet next --name main"[\s\S]*"workflowPay": "zk-agent workflow pay --wallet main --to <address> --amount <amount>"[\s\S]*"inspectDefaults": "zk-agent defaults"/,
      'Operator JSON contract doc must describe the doctor wallet-ready contract.'
    ],
    [
      /"scope": "setup"[\s\S]*"nextCommand": "zk-agent setup"[\s\S]*"recommendedCommands": \{[\s\S]*"setup": "zk-agent setup"[\s\S]*"afterSetup": "zk-agent next"[\s\S]*"inspectDefaults": "zk-agent defaults"/,
      'Operator JSON contract doc must describe the setup-scope recommendedCommands contract.'
    ],
    [
      /"scope": "wallet-bootstrap"[\s\S]*"nextCommand": "zk-agent wallet create --await-local"[\s\S]*"recommendedCommands": \{[\s\S]*"createWallet": "zk-agent wallet create --await-local"[\s\S]*"relayInspect": "zk-agent relay inspect --relay-url <url>"[\s\S]*"createWalletRemote": "zk-agent wallet create --relay-url <url> --wait-relay --prompt-code"[\s\S]*"afterApproval": "zk-agent next"[\s\S]*"inspectDefaults": "zk-agent defaults"/,
      'Operator JSON contract doc must describe the wallet-bootstrap recommendedCommands contract.'
    ],
    [
      /"scope": "wallet"[\s\S]*"recommendedCommands": \{[\s\S]*"walletNext": "zk-agent wallet next --name main"[\s\S]*"walletStatus": "zk-agent wallet status --name main"[\s\S]*"discoverAssets": "zk-agent assets --wallet main"[\s\S]*"discoverOwnedTokens": "zk-agent tokens --wallet main --owned"[\s\S]*"discoverTokens": "zk-agent tokens --chain zksync-sepolia"[\s\S]*"inspectToken": "zk-agent resolve-token --chain zksync-sepolia --symbol <symbol>"[\s\S]*"discoverPaymasterTokens": "zk-agent tokens --chain zksync-sepolia --role paymaster-fee-token"[\s\S]*"inspectPaymasterToken": "zk-agent resolve-token --chain zksync-sepolia --symbol <symbol> --role paymaster-fee-token"[\s\S]*"workflowPay": "zk-agent workflow pay --wallet main --to <address> --amount <amount>"[\s\S]*"workflowAuto": "zk-agent workflow auto --wallet main --intent <intent> \[goal flags\] --create-checkpoint --execute-when-ready"/,
      'Operator JSON contract doc must describe the wallet-scope discovery recommendedCommands contract.'
    ],
    [
      /### `scope = "wallet"`[\s\S]*"tokenDiscoverySummary": \{\s*"\.\.\.": "wallet-scope token recovery summary"\s*\}[\s\S]*When the wallet scope exposes token\/discovery follow-ups[\s\S]*`walletName`[\s\S]*`chain`[\s\S]*`intent`[\s\S]*`nextAction`[\s\S]*`paymasterMode`[\s\S]*`tokenizedIntent`[\s\S]*`includesAssetDiscovery`[\s\S]*`includesOwnedTokenDiscovery`[\s\S]*`includesChainTokenDiscovery`[\s\S]*`includesDirectTokenInspection`[\s\S]*`includesPaymasterTokenDiscovery`[\s\S]*`includesPaymasterTokenInspection`/,
      'Operator JSON contract doc must describe the top-level wallet tokenDiscoverySummary contract.'
    ],
    [
      /### `scope = "workflow"`[\s\S]*"tokenDiscoverySummary": \{\s*"\.\.\.": "workflow-scope token recovery summary"\s*\}[\s\S]*When the restored workflow intent is tokenized[\s\S]*the same field set described for wallet scope/,
      'Operator JSON contract doc must describe the top-level workflow tokenDiscoverySummary contract.'
    ],
    [
      /## `zk-agent wallet next`[\s\S]*Current stable top-level fields:[\s\S]*`ok`[\s\S]*`inspection`[\s\S]*`summary`[\s\S]*`tokenDiscoverySummary`[\s\S]*`recommendedCommands`[\s\S]*When wallet-scoped discovery follow-ups are present[\s\S]*`walletName`[\s\S]*`chain`[\s\S]*`intent`[\s\S]*`nextAction`[\s\S]*`paymasterMode`[\s\S]*`tokenizedIntent`[\s\S]*`includesAssetDiscovery`[\s\S]*`includesOwnedTokenDiscovery`[\s\S]*`includesChainTokenDiscovery`[\s\S]*`includesDirectTokenInspection`[\s\S]*`includesPaymasterTokenDiscovery`[\s\S]*`includesPaymasterTokenInspection`/,
      'Operator JSON contract doc must describe the wallet next tokenDiscoverySummary contract.'
    ],
    [
      /### `workflow status\|next\|run\|resume`[\s\S]*Tokenized workflow outputs should keep the same local-first recovery contract[\s\S]*visible:[\s\S]*`discoverAssets`[\s\S]*`discoverOwnedTokens`[\s\S]*`discoverTokens`[\s\S]*`inspectToken`[\s\S]*`discoverPaymasterTokens`[\s\S]*`inspectPaymasterToken`/,
      'Operator JSON contract doc must describe the tokenized workflow discovery follow-up contract.'
    ],
    [
      /### `workflow plan`[\s\S]*`inspection`[\s\S]*`plan`[\s\S]*`tokenDiscoverySummary`[\s\S]*`recommendedCommands`[\s\S]*When the current intent is tokenized[\s\S]*`walletName`[\s\S]*`chain`[\s\S]*`intent`[\s\S]*`nextAction`[\s\S]*`paymasterMode`[\s\S]*`tokenizedIntent`[\s\S]*`includesAssetDiscovery`[\s\S]*`includesOwnedTokenDiscovery`[\s\S]*`includesChainTokenDiscovery`[\s\S]*`includesDirectTokenInspection`[\s\S]*`includesPaymasterTokenDiscovery`[\s\S]*`includesPaymasterTokenInspection`/,
      'Operator JSON contract doc must describe the workflow plan tokenDiscoverySummary contract.'
    ],
    [
      /### `workflow auto`[\s\S]*`walletApproval`[\s\S]*`tokenDiscoverySummary`[\s\S]*`recommendedCommands`[\s\S]*### `workflow status\|next\|run\|resume`[\s\S]*`agentProfile`[\s\S]*`agentFollowup`[\s\S]*`tokenDiscoverySummary`[\s\S]*`recommendedCommands`[\s\S]*Current stable `tokenDiscoverySummary` fields on tokenized workflow surfaces:[\s\S]*`walletName`[\s\S]*`chain`[\s\S]*`intent`[\s\S]*`nextAction`[\s\S]*`paymasterMode`[\s\S]*`tokenizedIntent`[\s\S]*`includesAssetDiscovery`[\s\S]*`includesOwnedTokenDiscovery`[\s\S]*`includesChainTokenDiscovery`[\s\S]*`includesDirectTokenInspection`[\s\S]*`includesPaymasterTokenDiscovery`[\s\S]*`includesPaymasterTokenInspection`/,
      'Operator JSON contract doc must describe the workflow runtime tokenDiscoverySummary contract.'
    ],
    [
      /### `workflow auto`[\s\S]*`walletApprovalSummary`[\s\S]*### `workflow status\|next\|run\|resume`[\s\S]*`walletApprovalSummary`[\s\S]*Current stable `walletApprovalSummary` fields on workflow runtime surfaces when[\s\S]*`status`[\s\S]*`walletRequestId`[\s\S]*`reusedRequest`[\s\S]*`relayPublished`[\s\S]*`nextAction`[\s\S]*`afterApproval`[\s\S]*`afterApprovalStatus`/,
      'Operator JSON contract doc must describe the workflow walletApprovalSummary contract.'
    ],
    [
      /### Token-input workflow errors[\s\S]*`recommendedCommands`[\s\S]*`tokenDiscoverySummary`[\s\S]*Current stable `tokenDiscoverySummary` fields on that error path:[\s\S]*`chain`[\s\S]*`queryType`[\s\S]*`query`[\s\S]*`roleFilter`[\s\S]*`includesChainTokenDiscovery`[\s\S]*`includesDirectTokenInspection`[\s\S]*`workflowHelp`/,
      'Operator JSON contract doc must describe the workflow token-input error discovery summary contract.'
    ],
    [
      /## `zk-agent defaults`[\s\S]*Current stable top-level fields:[\s\S]*`ok`[\s\S]*`summary`[\s\S]*`recommendedCommands`[\s\S]*`defaults`[\s\S]*`localTokenRegistry`[\s\S]*`tokenRegistrySources`[\s\S]*`tokenDirectoryChains`[\s\S]*"inspectDefaults": "zk-agent defaults"[\s\S]*"discoverTokens": "zk-agent tokens --chain zksync-sepolia"[\s\S]*"inspectToken": "zk-agent resolve-token --chain zksync-sepolia --symbol ZKAT"[\s\S]*"discoverPaymasterTokens": "zk-agent tokens --chain zksync-sepolia --role paymaster-fee-token"[\s\S]*"inspectPaymasterToken": "zk-agent resolve-token --chain zksync-sepolia --symbol ZKAT --role paymaster-fee-token"[\s\S]*The current stable `summary` fields are:[\s\S]*`primaryDiscoveryChain`[\s\S]*`exampleTokenSymbol`[\s\S]*`paymasterFeeTokenSymbol`[\s\S]*`localTokenCount`[\s\S]*`tokenDirectoryChainCount`[\s\S]*`tokenRegistrySources`[\s\S]*`resolvedDefaults`/,
      'Operator JSON contract doc must describe the defaults discovery contract.'
    ],
    [
      /## `zk-agent assets`[\s\S]*Current stable top-level fields:[\s\S]*`ok`[\s\S]*`discoverySummary`[\s\S]*`recommendedCommands`[\s\S]*`walletName`[\s\S]*`walletAddress`[\s\S]*`chain`[\s\S]*`chainId`[\s\S]*`balances`[\s\S]*`ownedTokenRegistry`[\s\S]*"inspectDefaults": "zk-agent defaults"[\s\S]*"discoverOwnedTokens": "zk-agent tokens --wallet main --owned"[\s\S]*"discoverTokens": "zk-agent tokens --chain zksync-sepolia"[\s\S]*"inspectToken": "zk-agent resolve-token --chain zksync-sepolia --symbol <symbol>"[\s\S]*Current stable fields:[\s\S]*`walletName`[\s\S]*`chain`[\s\S]*`chainId`[\s\S]*`assetCount`[\s\S]*`nativeAssetSymbol`[\s\S]*`nativeAssetBalance`[\s\S]*`ownedTokenCount`[\s\S]*`primaryOwnedTokenSymbol`[\s\S]*`ownedTokenSymbols`[\s\S]*`ownedTokenSourceCounts`[\s\S]*`ownedBridgeMappingCounts`[\s\S]*`ownedRegistryRoleCounts`/,
      'Operator JSON contract doc must describe the assets discoverySummary contract.'
    ],
    [
      /## `zk-agent balances --owned-tokens`[\s\S]*Current stable top-level fields on that path:[\s\S]*`ok`[\s\S]*`discoverySummary`[\s\S]*`recommendedCommands`[\s\S]*`walletName`[\s\S]*`walletAddress`[\s\S]*`chain`[\s\S]*`chainId`[\s\S]*`balances`[\s\S]*`ownedTokenRegistry`[\s\S]*Same compressed single-chain owned-token summary contract as `zk-agent assets`\.[\s\S]*Same local-first discovery follow-up contract as `zk-agent assets`\./,
      'Operator JSON contract doc must describe the balances --owned-tokens discovery contract.'
    ],
    [
      /## `zk-agent tokens`[\s\S]*Current stable top-level fields:[\s\S]*`ok`[\s\S]*`discoverySummary`[\s\S]*`recommendedCommands`[\s\S]*`tokenRegistrySources`[\s\S]*`entries`[\s\S]*`entryCount`[\s\S]*Important current distinction:[\s\S]*`discoverySummary`[\s\S]*`summary`[\s\S]*"inspectDefaults": "zk-agent defaults"[\s\S]*"discoverTokens": "zk-agent tokens --chain zksync-sepolia"[\s\S]*"inspectToken": "zk-agent resolve-token --chain zksync-sepolia --symbol <symbol>"[\s\S]*"discoverAssets": "zk-agent assets --wallet main"[\s\S]*Current stable fields:[\s\S]*`mode`[\s\S]*`walletName`[\s\S]*`chainScope`[\s\S]*`chainCount`[\s\S]*`entryCount`[\s\S]*`symbolFilter`[\s\S]*`roleFilter`[\s\S]*`sourceFilter`[\s\S]*`primarySymbol`[\s\S]*`primarySource`[\s\S]*`sourceCounts`[\s\S]*`roleMatchCounts`[\s\S]*`currentDefaultEntryCount`[\s\S]*`probeFailureCount`[\s\S]*`bridgeMappingCounts`[\s\S]*`tokenRegistrySources`/,
      'Operator JSON contract doc must describe the tokens discoverySummary contract.'
    ],
    [
      /## `zk-agent resolve-token`[\s\S]*Current stable top-level fields:[\s\S]*`ok`[\s\S]*`discoverySummary`[\s\S]*`recommendedCommands`[\s\S]*`chainId`[\s\S]*`chainKey`[\s\S]*`queryType`[\s\S]*`symbol`[\s\S]*`address`[\s\S]*`role`[\s\S]*`source`[\s\S]*`matchCount`[\s\S]*`ambiguous`[\s\S]*`primaryMatch`[\s\S]*`matches`[\s\S]*`tokenRegistrySources`[\s\S]*"inspectDefaults": "zk-agent defaults"[\s\S]*"discoverTokens": "zk-agent tokens --chain zksync-sepolia --symbol USDC"[\s\S]*Current stable fields:[\s\S]*`chain`[\s\S]*`chainId`[\s\S]*`queryType`[\s\S]*`query`[\s\S]*`roleFilter`[\s\S]*`sourceFilter`[\s\S]*`matchCount`[\s\S]*`ambiguous`[\s\S]*`primarySymbol`[\s\S]*`primaryAddress`[\s\S]*`primaryDecimals`[\s\S]*`primarySource`[\s\S]*`sourceCounts`[\s\S]*`roleMatchCounts`[\s\S]*`currentDefaultEntryCount`[\s\S]*`tokenRegistrySources`/,
      'Operator JSON contract doc must describe the resolve-token discoverySummary contract.'
    ],
    [
      /## `zk-agent relay serve`[\s\S]*Current stable top-level fields:[\s\S]*`ok`[\s\S]*`status`[\s\S]*`origin`[\s\S]*`publicOrigin`[\s\S]*`publicOriginSource`[\s\S]*`stateBackend`[\s\S]*`deploymentScope`[\s\S]*`sameHostRestartPersists`[\s\S]*`shareLinkBaseUrl`[\s\S]*`statusApiBaseUrl`[\s\S]*`publicOriginLooksLocal`[\s\S]*`hostedReadinessSummary`[\s\S]*`deploymentSummary`[\s\S]*`healthUrl`[\s\S]*`publicHealthUrl`[\s\S]*`relayMode`[\s\S]*`connectorUiAvailable`[\s\S]*`hostedShareRedirectReady`[\s\S]*`capabilities`[\s\S]*`recommendedCommands`[\s\S]*`notes`[\s\S]*Current stable `hostedReadinessSummary` fields on this surface:[\s\S]*`status`[\s\S]*`compatible`[\s\S]*`hostedApprovalReady`[\s\S]*`publicOriginConfigured`[\s\S]*`publicOriginLooksLocal`[\s\S]*`connectorUiAvailable`[\s\S]*`singleHostFileState`[\s\S]*Current stable `status` values on this summary:[\s\S]*`ready`[\s\S]*`needs-public-origin`[\s\S]*`needs-connector-ui`[\s\S]*`needs-public-origin-and-ui`[\s\S]*`incompatible`[\s\S]*When present, `deploymentSummary` compresses the hosted deployment contract[\s\S]*into:[\s\S]*`origin`[\s\S]*`publicOrigin`[\s\S]*`publicOriginSource`[\s\S]*`shareLinkBaseUrl`[\s\S]*`statusApiBaseUrl`[\s\S]*`publicOriginConfigured`[\s\S]*`publicOriginLooksLocal`[\s\S]*`connectorUiAvailable`[\s\S]*`hostedShareRedirectReady`[\s\S]*`singleHostFileState`[\s\S]*Current stable `recommendedCommands` shape on this surface:[\s\S]*`inspectRelay`[\s\S]*`createWallet`[\s\S]*`reapproveWallet`[\s\S]*`restartWithPublicOrigin`/,
      'Operator JSON contract doc must describe the relay serve deploymentSummary contract.'
    ],
    [
      /## `zk-agent relay inspect`[\s\S]*Current stable top-level fields:[\s\S]*`ok`[\s\S]*`status`[\s\S]*`relayUrl`[\s\S]*`compatible`[\s\S]*`origin`[\s\S]*`publicOrigin`[\s\S]*`publicOriginSource`[\s\S]*`stateBackend`[\s\S]*`deploymentScope`[\s\S]*`sameHostRestartPersists`[\s\S]*`shareLinkBaseUrl`[\s\S]*`statusApiBaseUrl`[\s\S]*`relayUrlMatchesOrigin`[\s\S]*`relayUrlMatchesPublicOrigin`[\s\S]*`publicOriginLooksLocal`[\s\S]*`hostedReadinessSummary`[\s\S]*`deploymentSummary`[\s\S]*`connectorUiAvailable`[\s\S]*`hostedShareRedirectReady`[\s\S]*`capabilities`[\s\S]*`recommendedCommands`[\s\S]*`notes`[\s\S]*Current stable `hostedReadinessSummary` fields on this surface:[\s\S]*`status`[\s\S]*`compatible`[\s\S]*`hostedApprovalReady`[\s\S]*`publicOriginConfigured`[\s\S]*`publicOriginLooksLocal`[\s\S]*`connectorUiAvailable`[\s\S]*`singleHostFileState`[\s\S]*Current stable `status` values on this summary:[\s\S]*`ready`[\s\S]*`needs-public-origin`[\s\S]*`needs-connector-ui`[\s\S]*`needs-public-origin-and-ui`[\s\S]*`incompatible`[\s\S]*Current stable `deploymentSummary` fields on this surface:[\s\S]*`origin`[\s\S]*`publicOrigin`[\s\S]*`publicOriginSource`[\s\S]*`shareLinkBaseUrl`[\s\S]*`statusApiBaseUrl`[\s\S]*`publicOriginConfigured`[\s\S]*`publicOriginLooksLocal`[\s\S]*`connectorUiAvailable`[\s\S]*`hostedShareRedirectReady`[\s\S]*`singleHostFileState`[\s\S]*Current stable `recommendedCommands` shape on this surface:[\s\S]*`createWallet`[\s\S]*`reapproveWallet`[\s\S]*`restartWithPublicOrigin`/,
      'Operator JSON contract doc must describe the relay inspect deploymentSummary contract.'
    ],
    [
      /## `zk-agent wallet create --relay-url <url>`[\s\S]*Current stable top-level fields:[\s\S]*`ok`[\s\S]*`walletName`[\s\S]*`requestId`[\s\S]*`walletRequestId`[\s\S]*`approvalUrl`[\s\S]*`relay`[\s\S]*`relayRecoverySummary`[\s\S]*`expiresAt`[\s\S]*`chain`[\s\S]*`chainId`[\s\S]*`accountKind`[\s\S]*`paymasterMode`[\s\S]*`capabilities`[\s\S]*`sessionScope`[\s\S]*`nextAction`[\s\S]*`recommendedCommands`[\s\S]*Current stable `recommendedCommands` shape on this surface:[\s\S]*`awaitLocal`[\s\S]*`relayStatus`[\s\S]*`relayApprove`[\s\S]*`approve`[\s\S]*`afterApproval`[\s\S]*`afterApprovalStatus`[\s\S]*Current stable `relayRecoverySummary` fields on this surface:[\s\S]*`requestId`[\s\S]*`walletName`[\s\S]*`relayUrl`[\s\S]*`relayStatus`[\s\S]*`approvalReady`[\s\S]*`nextAction`[\s\S]*`shareLinkBaseUrl`[\s\S]*`statusApiBaseUrl`[\s\S]*`recoveryMode`[\s\S]*`includesStatusPoll`[\s\S]*`includesApprove`[\s\S]*`includesRelayInspect`[\s\S]*`includesRemoteReissue`[\s\S]*Defaults to `zk-agent wallet request relay-status --request-id <id> --relay-url <url>`/,
      'Operator JSON contract doc must describe the wallet create --relay-url recovery summary contract.'
    ],
    [
      /## `zk-agent wallet reapprove --name <name> --relay-url <url>`[\s\S]*Current stable top-level fields:[\s\S]*`ok`[\s\S]*`walletRequestId`[\s\S]*`wallet`[\s\S]*`request`[\s\S]*`relay`[\s\S]*`relayRecoverySummary`[\s\S]*`nextAction`[\s\S]*`recommendedCommands`[\s\S]*Current stable `recommendedCommands` shape on this surface:[\s\S]*`awaitLocal`[\s\S]*`relayStatus`[\s\S]*`relayApprove`[\s\S]*`approve`[\s\S]*`afterApproval`[\s\S]*`afterApprovalStatus`[\s\S]*Current stable `relayRecoverySummary` fields on this surface:[\s\S]*`requestId`[\s\S]*`walletName`[\s\S]*`relayUrl`[\s\S]*`relayStatus`[\s\S]*`approvalReady`[\s\S]*`nextAction`[\s\S]*`shareLinkBaseUrl`[\s\S]*`statusApiBaseUrl`[\s\S]*`recoveryMode`[\s\S]*`includesStatusPoll`[\s\S]*`includesApprove`[\s\S]*`includesRelayInspect`[\s\S]*`includesRemoteReissue`[\s\S]*Defaults to `zk-agent wallet request relay-status --request-id <id> --relay-url <url>`/,
      'Operator JSON contract doc must describe the wallet reapprove --relay-url recovery summary contract.'
    ],
    [
      /## `zk-agent wallet request relay-publish`[\s\S]*Current stable top-level fields:[\s\S]*`ok`[\s\S]*`walletRequestId`[\s\S]*`relay`[\s\S]*`relayRecoverySummary`[\s\S]*`request`[\s\S]*`recommendedCommands`[\s\S]*`nextAction`[\s\S]*Current stable `relayRecoverySummary` fields on this surface:[\s\S]*`requestId`[\s\S]*`walletName`[\s\S]*`relayUrl`[\s\S]*`relayStatus`[\s\S]*`approvalReady`[\s\S]*`nextAction`[\s\S]*`shareLinkBaseUrl`[\s\S]*`statusApiBaseUrl`[\s\S]*`recoveryMode`[\s\S]*`includesStatusPoll`[\s\S]*`includesApprove`[\s\S]*`includesRelayInspect`[\s\S]*`includesRemoteReissue`/,
      'Operator JSON contract doc must describe the wallet request relay-publish recovery summary contract.'
    ],
    [
      /## `zk-agent wallet request relay-status`[\s\S]*Current stable top-level fields:[\s\S]*`ok`[\s\S]*`walletRequestId`[\s\S]*`relay`[\s\S]*`relayRecoverySummary`[\s\S]*`recommendedCommands`[\s\S]*`nextAction`[\s\S]*Current stable `relay` fields:[\s\S]*`request_id`[\s\S]*`status`[\s\S]*`approval_ready`[\s\S]*`share_url`[\s\S]*`status_url`[\s\S]*`approval_url`[\s\S]*`expires_at`[\s\S]*Current stable `relayRecoverySummary` fields on this surface:[\s\S]*`requestId`[\s\S]*`walletName`[\s\S]*`relayUrl`[\s\S]*`relayStatus`[\s\S]*`approvalReady`[\s\S]*`nextAction`[\s\S]*`shareLinkBaseUrl`[\s\S]*`statusApiBaseUrl`[\s\S]*`recoveryMode`[\s\S]*`includesStatusPoll`[\s\S]*`includesApprove`[\s\S]*`includesRelayInspect`[\s\S]*`includesRemoteReissue`[\s\S]*"relayInspect": "zk-agent relay inspect --relay-url https:\/\/relay\.example\.com"[\s\S]*"reissueRemoteApproval": "zk-agent wallet reapprove --name main --relay-url https:\/\/relay\.example\.com --wait-relay --prompt-code"[\s\S]*The same `relayRecoverySummary` field set now also appears in:[\s\S]*`wallet create --relay-url <url>`[\s\S]*`wallet reapprove --name <name> --relay-url <url>`[\s\S]*`wallet request relay-publish`[\s\S]*`RELAY_APPROVAL_TIMEOUT` error details[\s\S]*`RELAY_APPROVAL_EXPIRED` error details/,
      'Operator JSON contract doc must describe the wallet request relay-status recovery summary contract.'
    ],
    [
      /## `zk-agent agent \*`[\s\S]*### `agent status\|show`[\s\S]*`ok`[\s\S]*`plugin`[\s\S]*`profileExists`[\s\S]*`profile`[\s\S]*`recommendedCommands`[\s\S]*"status": "zk-agent agent status"[\s\S]*"show": "zk-agent agent show"[\s\S]*"export": "zk-agent agent export"[\s\S]*"import": "zk-agent agent import --payload @agent-profile\.json"[\s\S]*"set": "zk-agent agent set --name <name> --wallet main"/,
      'Operator JSON contract doc must describe the agent status/show machine-readable contract.'
    ]
  ];

  for (const [pattern, message] of requiredChecks) {
    assert.match(doc, pattern, message);
  }
}

function createPackDir() {
  rmSync(packDir, { recursive: true, force: true });
  mkdirSync(packDir, { recursive: true });
}

function envWithoutDryRun() {
  const env = { ...process.env };
  delete env.npm_config_dry_run;
  delete env.NPM_CONFIG_DRY_RUN;
  return env;
}

function packPackage() {
  const output = execFileSync('pnpm', ['pack', '--pack-destination', packDir], {
    cwd: packageDir,
    env: envWithoutDryRun(),
    encoding: 'utf8'
  }).trim();

  if (output) {
    process.stdout.write(`${output}\n`);
  }

  const lines = output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const lastLine = lines.at(-1);
  return lastLine && lastLine.endsWith('.tgz') ? lastLine : null;
}

function listPackedFiles(tarballPath) {
  return execFileSync('tar', ['-tf', tarballPath], {
    cwd: packageDir,
    encoding: 'utf8'
  })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function assertTarballContents(entries) {
  assert.equal(entries.includes('package/package.json'), true);
  assert.equal(entries.includes('package/README.md'), true);
  assert.equal(entries.includes('package/dist/index.js'), true);
  assert.equal(entries.includes('package/dist/connector-ui/index.html'), true);
  assert.equal(
    entries.includes('package/dist/builtin-account-profiles/package.json'),
    true
  );
  assert.equal(
    entries.includes('package/dist/builtin-account-profiles/artifacts/sed-lite/Account.json'),
    true
  );
  assert.equal(
    entries.includes(
      'package/dist/builtin-account-profiles/artifacts/daily-spend-limit/Account.json'
    ),
    true
  );
  assert.equal(entries.some((entry) => entry.startsWith('package/src/')), false);
}

function createStandaloneInstallRoot() {
  return mkdtempSync(join(tmpdir(), 'zk-agent-cli-release-check-pack-'));
}

function createCleanMachineInstallRoot() {
  return mkdtempSync(join(tmpdir(), 'zk-agent-cli-release-check-install-'));
}

function extractTarball(tarballPath, installRoot) {
  execFileSync('tar', ['-xzf', tarballPath, '-C', installRoot], {
    cwd: packageDir,
    stdio: 'inherit'
  });

  const extractedPackageDir = join(installRoot, 'package');
  assert.equal(
    existsSync(extractedPackageDir),
    true,
    `Expected extracted package directory not found: ${extractedPackageDir}`
  );

  return extractedPackageDir;
}

function linkRuntimeNodeModules(extractedPackageDir) {
  const sourceNodeModulesDir = join(packageDir, 'node_modules');
  const linkedNodeModulesDir = join(extractedPackageDir, 'node_modules');
  assert.equal(
    existsSync(sourceNodeModulesDir),
    true,
    `Package node_modules directory not found: ${sourceNodeModulesDir}`
  );

  symlinkSync(sourceNodeModulesDir, linkedNodeModulesDir, 'dir');
}

function createStandaloneEnv(homeDir) {
  const env = {
    ...process.env,
    HOME: homeDir,
    ZKSYNC_SEPOLIA_RPC_URL: 'http://127.0.0.1:1',
    ETHEREUM_SEPOLIA_RPC_URL: 'http://127.0.0.1:1'
  };

  for (const key of standaloneEnvKeys) {
    delete env[key];
  }

  return env;
}

function isRecoverableRpcNoise(stderr, stdout) {
  if (!stderr.trim() || !stdout) {
    return false;
  }

  try {
    const payload = JSON.parse(stdout);
    return (
      payload?.ok === true &&
      (stderr.includes('getaddrinfo ENOTFOUND') ||
        stderr.includes('connect EPERM 127.0.0.1') ||
        stderr.includes('connect ECONNREFUSED 127.0.0.1'))
    );
  } catch {
    return false;
  }
}

function runCommand(command, args, options) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });

  if (result.error) {
    throw result.error;
  }

  const stdout = typeof result.stdout === 'string' ? result.stdout.trim() : '';
  const stderr = typeof result.stderr === 'string' ? result.stderr : '';

  if (result.status !== 0) {
    const error = new Error(
      `${options.description} exited with status ${result.status}: ${args.join(' ')}`
    );
    Object.assign(error, {
      stdout,
      stderr,
      status: result.status
    });
    throw error;
  }

  return { stdout, stderr };
}

function runPackedCli(extractedPackageDir, homeDir, args) {
  return runCommand(process.execPath, ['dist/index.js', ...args], {
    cwd: extractedPackageDir,
    env: createStandaloneEnv(homeDir),
    description: 'Packed CLI'
  });
}

function assertPackedCliStderr(stderr, stdout, description, { allowRecoverableRpcNoise = false } = {}) {
  if (!stderr.trim()) {
    return;
  }

  if (allowRecoverableRpcNoise && isRecoverableRpcNoise(stderr, stdout)) {
    return;
  }

  assert.fail(`Packed CLI emitted unexpected stderr during ${description}:\n${stderr}`);
}

function runPackedCliJson(extractedPackageDir, homeDir, args, options) {
  try {
    const result = runPackedCli(extractedPackageDir, homeDir, args);
    assertPackedCliStderr(result.stderr, result.stdout, args.join(' '), options);
    return result.stdout;
  } catch (error) {
    const stdout = typeof error?.stdout === 'string' ? error.stdout.trim() : '';
    const stderr = typeof error?.stderr === 'string' ? error.stderr : '';

    if (options?.allowRecoverableRpcNoise && isRecoverableRpcNoise(stderr, stdout)) {
      return stdout;
    }

    throw error;
  }
}

function writeCleanMachinePackageJson(projectRoot) {
  writeFileSync(
    join(projectRoot, 'package.json'),
    JSON.stringify(
      {
        name: 'zk-agent-cli-clean-machine-check',
        private: true,
        version: '0.0.0'
      },
      null,
      2
    ) + '\n'
  );
}

function installTarballInCleanMachineProject(projectRoot, tarballPath) {
  writeCleanMachinePackageJson(projectRoot);
  const installEnv = envWithoutDryRun();

  try {
    runCommand('pnpm', ['add', '--offline', tarballPath], {
      cwd: projectRoot,
      env: installEnv,
      description: 'Offline clean-machine tarball install'
    });
    return;
  } catch (error) {
    const stderr = typeof error?.stderr === 'string' ? error.stderr : '';
    const stdout = typeof error?.stdout === 'string' ? error.stdout : '';
    const combinedOutput = `${stdout}\n${stderr}`;

    if (!combinedOutput.includes('ERR_PNPM_NO_OFFLINE_TARBALL')) {
      throw error;
    }

    process.stdout.write(
      'Offline pnpm store was incomplete; retrying clean-machine install with prefer-offline.\n'
    );
    try {
      runCommand('pnpm', ['add', '--prefer-offline', '--fetch-retries', '0', tarballPath], {
        cwd: projectRoot,
        env: installEnv,
        description: 'Prefer-offline clean-machine tarball install'
      });
    } catch (retryError) {
      const retryStdout = typeof retryError?.stdout === 'string' ? retryError.stdout : '';
      const retryStderr = typeof retryError?.stderr === 'string' ? retryError.stderr : '';
      const combinedRetryOutput = `${retryStdout}\n${retryStderr}`;

      if (
        combinedRetryOutput.includes('getaddrinfo ENOTFOUND') ||
        combinedRetryOutput.includes('registry.npmjs.org') ||
        combinedRetryOutput.includes('ERR_PNPM_FETCH')
      ) {
        const error = new Error(
          'Clean-machine tarball install needs registry access when the local pnpm store is incomplete. This environment appears to block npm registry access.'
        );
        Object.assign(error, {
          stdout: retryStdout,
          stderr: retryStderr,
          status: retryError?.status ?? 1
        });
        throw error;
      }

      throw retryError;
    }
  }
}

function runInstalledCli(projectRoot, homeDir, args, binaryName = 'zk-agent') {
  const binaryPath = join(projectRoot, 'node_modules', '.bin', binaryName);
  assert.equal(existsSync(binaryPath), true, `Expected installed binary not found: ${binaryPath}`);
  return runCommand(binaryPath, args, {
    cwd: projectRoot,
    env: createStandaloneEnv(homeDir),
    description: `Installed ${binaryName}`
  });
}

function runInstalledCliJson(projectRoot, homeDir, args, options) {
  try {
    const result = runInstalledCli(projectRoot, homeDir, args, options?.binaryName);
    assertPackedCliStderr(
      result.stderr,
      result.stdout,
      `${options?.binaryName || 'zk-agent'} ${args.join(' ')}`,
      options
    );
    return result.stdout;
  } catch (error) {
    const stdout = typeof error?.stdout === 'string' ? error.stdout.trim() : '';
    const stderr = typeof error?.stderr === 'string' ? error.stderr : '';

    if (options?.allowRecoverableRpcNoise && isRecoverableRpcNoise(stderr, stdout)) {
      return stdout;
    }

    throw error;
  }
}

function waitForJsonOutput(stream, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for relay JSON output after ${timeoutMs}ms`));
    }, timeoutMs);

    const onData = (chunk) => {
      output += chunk.toString('utf8');
      try {
        const parsed = JSON.parse(output);
        cleanup();
        resolve(parsed);
      } catch {
        // keep reading
      }
    };

    const onError = (error) => {
      cleanup();
      reject(error);
    };

    const onEnd = () => {
      cleanup();
      reject(new Error(`Relay process ended before emitting valid JSON: ${output}`));
    };

    const cleanup = () => {
      clearTimeout(timer);
      stream.off('data', onData);
      stream.off('error', onError);
      stream.off('end', onEnd);
    };

    stream.on('data', onData);
    stream.once('error', onError);
    stream.once('end', onEnd);
  });
}

async function waitForExit(child, timeoutMs = 10000) {
  return await Promise.race([
    new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code) => resolve(code));
    }),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Process did not exit within ${timeoutMs}ms`)), timeoutMs);
    })
  ]);
}

async function stopChild(child, timeoutMs = 10000) {
  if (!child || child.exitCode !== null || child.killed) {
    return;
  }

  child.kill('SIGTERM');
  try {
    await waitForExit(child, timeoutMs);
  } catch {
    child.kill('SIGKILL');
    await waitForExit(child, timeoutMs).catch(() => {});
  }
}

function buildRelayCreateRequest(requestId) {
  return {
    approval_url: 'https://connector.example.test/approve',
    request: {
      requestId,
      walletName: 'main',
      chain: 'zksync-sepolia',
      chainId: 300,
      provider: 'zksync-sso',
      createdAt: '2026-08-04T00:00:00.000Z',
      expiresAt: '2026-08-10T00:00:00.000Z',
      connectorUrl: 'https://connector.example.test',
      requestedAccountKind: 'smart-account',
      requestedPaymasterMode: 'none',
      requestedSessionScope: {
        chainKeys: ['zksync-sepolia'],
        chainIds: [300]
      },
      requestedCapabilities: {
        read: true,
        write: true,
        transfer: true,
        contractCall: true,
        paymaster: false
      },
      sessionPublicKey: '0x' + '11'.repeat(32)
    }
  };
}

async function assertHostedShareLink(projectOrigin, publicOrigin, requestId) {
  const createResponse = await fetch(`${projectOrigin}/api/requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(buildRelayCreateRequest(requestId))
  });
  assert.equal(createResponse.status, 201);
  const createdPayload = await createResponse.json();
  assert.equal(createdPayload.share_url, `${publicOrigin}/r/${requestId}`);
  assert.equal(createdPayload.status_url, `${publicOrigin}/api/requests/${requestId}`);
  assert.equal(createdPayload.approval_url, `${publicOrigin}/r/${requestId}`);

  const shareResponse = await fetch(`${projectOrigin}/r/${requestId}`, {
    redirect: 'manual'
  });
  assert.equal(shareResponse.status, 302);
  const location = shareResponse.headers.get('location');
  assert.equal(
    location,
    `/?relayRequestUrl=${encodeURIComponent(`${publicOrigin}/api/requests/${requestId}`)}`
  );

  const landingResponse = await fetch(`${projectOrigin}${location}`);
  assert.equal(landingResponse.status, 200);
  const landingHtml = await landingResponse.text();
  assert.match(landingHtml, /<div id="root"><\/div>/);
  const scriptMatch = landingHtml.match(/<script type="module" crossorigin src="([^"]+)"><\/script>/);
  assert.notEqual(scriptMatch, null);
  const scriptPath = scriptMatch?.[1];
  assert.match(scriptPath, /^\/assets\/index-.*\.js$/);

  const scriptResponse = await fetch(`${projectOrigin}${scriptPath}`);
  assert.equal(scriptResponse.status, 200);
  assert.match(scriptResponse.headers.get('content-type') || '', /text\/javascript/);
}

function standaloneSessionPayload() {
  return {
    version: 1,
    provider: 'zksync-sso',
    chain: 'zksync-sepolia',
    chainId: 300,
    walletAddress: '0x1111111111111111111111111111111111111111',
    account: {
      kind: 'smart-account',
      address: '0x1111111111111111111111111111111111111111',
      ownerAddress: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
      signerType: 'local'
    },
    sessionScope: {
      chainKeys: ['zksync-sepolia'],
      chainIds: [300]
    },
    capabilities: {
      read: true,
      write: true,
      transfer: true,
      contractCall: true,
      paymaster: false
    },
    sessionExpiresAt: '2026-08-31T00:00:00.000Z',
    paymaster: {
      mode: 'none',
      address: null
    },
    sessionPublicKey: '0x' + '11'.repeat(32),
    sessionPrivateKey:
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    permissions: {
      expiresAt: '2026-08-31T00:00:00.000Z'
    },
    connectorUrl: 'http://localhost:4444',
    paymasterAddress: null
  };
}

function assertNoWorkspaceLeak(output) {
  assert.equal(
    output.includes(workspaceRoot),
    false,
    'Packed CLI output must not reference the local workspace root during standalone smoke checks.'
  );
  assert.equal(
    output.includes(packageDir),
    false,
    'Packed CLI output must not reference the source package directory during standalone smoke checks.'
  );
}

function assertStandaloneSmoke(extractedPackageDir) {
  const homeDir = mkdtempSync(join(tmpdir(), 'zk-agent-cli-release-check-home-'));

  try {
    const helpResult = runPackedCli(extractedPackageDir, homeDir, ['--help']);
    assertPackedCliStderr(helpResult.stderr, helpResult.stdout, '--help');
    assert.match(helpResult.stdout, /Usage: zk-agent/);
    assertNoWorkspaceLeak(helpResult.stdout);
    assertTopLevelHelpContract(helpResult.stdout);

    const walletHelpResult = runPackedCli(extractedPackageDir, homeDir, ['wallet', '--help']);
    assertPackedCliStderr(walletHelpResult.stderr, walletHelpResult.stdout, 'wallet --help');
    assert.match(walletHelpResult.stdout, /Usage: zk-agent wallet/);
    assertNoWorkspaceLeak(walletHelpResult.stdout);
    assertWalletHelpContract(walletHelpResult.stdout);

    const walletRequestHelpResult = runPackedCli(extractedPackageDir, homeDir, [
      'wallet',
      'request',
      '--help'
    ]);
    assertPackedCliStderr(
      walletRequestHelpResult.stderr,
      walletRequestHelpResult.stdout,
      'wallet request --help'
    );
    assert.match(walletRequestHelpResult.stdout, /Usage: zk-agent wallet request/);
    assertNoWorkspaceLeak(walletRequestHelpResult.stdout);
    assertWalletRequestHelpContract(walletRequestHelpResult.stdout);

    const walletSignerHelpResult = runPackedCli(extractedPackageDir, homeDir, [
      'wallet',
      'signer',
      '--help'
    ]);
    assertPackedCliStderr(
      walletSignerHelpResult.stderr,
      walletSignerHelpResult.stdout,
      'wallet signer --help'
    );
    assert.match(walletSignerHelpResult.stdout, /Usage: zk-agent wallet signer/);
    assertNoWorkspaceLeak(walletSignerHelpResult.stdout);
    assertWalletSignerHelpContract(walletSignerHelpResult.stdout);

    const smartAccountHelpResult = runPackedCli(extractedPackageDir, homeDir, [
      'wallet',
      'smart-account',
      '--help'
    ]);
    assertPackedCliStderr(
      smartAccountHelpResult.stderr,
      smartAccountHelpResult.stdout,
      'wallet smart-account --help'
    );
    assert.match(smartAccountHelpResult.stdout, /Usage: zk-agent wallet smart-account/);
    assertNoWorkspaceLeak(smartAccountHelpResult.stdout);
    assertSmartAccountHelpContract(smartAccountHelpResult.stdout);

    const setupHelpResult = runPackedCli(extractedPackageDir, homeDir, ['setup', '--help']);
    assertPackedCliStderr(setupHelpResult.stderr, setupHelpResult.stdout, 'setup --help');
    assert.match(setupHelpResult.stdout, /Usage: zk-agent (init|setup)/);
    assertNoWorkspaceLeak(setupHelpResult.stdout);
    assertSetupHelpContract(setupHelpResult.stdout);

    const nextHelpResult = runPackedCli(extractedPackageDir, homeDir, ['next', '--help']);
    assertPackedCliStderr(nextHelpResult.stderr, nextHelpResult.stdout, 'next --help');
    assert.match(nextHelpResult.stdout, /Usage: zk-agent next/);
    assertNoWorkspaceLeak(nextHelpResult.stdout);
    assertNextHelpContract(nextHelpResult.stdout);

    const doctorHelpResult = runPackedCli(extractedPackageDir, homeDir, ['doctor', '--help']);
    assertPackedCliStderr(doctorHelpResult.stderr, doctorHelpResult.stdout, 'doctor --help');
    assert.match(doctorHelpResult.stdout, /Usage: zk-agent doctor/);
    assertNoWorkspaceLeak(doctorHelpResult.stdout);
    assertDoctorHelpContract(doctorHelpResult.stdout);

    const defaultsHelpResult = runPackedCli(extractedPackageDir, homeDir, ['defaults', '--help']);
    assertPackedCliStderr(defaultsHelpResult.stderr, defaultsHelpResult.stdout, 'defaults --help');
    assert.match(defaultsHelpResult.stdout, /Usage: zk-agent defaults/);
    assertNoWorkspaceLeak(defaultsHelpResult.stdout);
    assertDefaultsHelpContract(defaultsHelpResult.stdout);

    const assetsHelpResult = runPackedCli(extractedPackageDir, homeDir, ['assets', '--help']);
    assertPackedCliStderr(assetsHelpResult.stderr, assetsHelpResult.stdout, 'assets --help');
    assert.match(assetsHelpResult.stdout, /Usage: zk-agent assets/);
    assertNoWorkspaceLeak(assetsHelpResult.stdout);
    assertAssetsHelpContract(assetsHelpResult.stdout);

    const tokensHelpResult = runPackedCli(extractedPackageDir, homeDir, ['tokens', '--help']);
    assertPackedCliStderr(tokensHelpResult.stderr, tokensHelpResult.stdout, 'tokens --help');
    assert.match(tokensHelpResult.stdout, /Usage: zk-agent tokens/);
    assertNoWorkspaceLeak(tokensHelpResult.stdout);
    assertTokensHelpContract(tokensHelpResult.stdout);

    const resolveTokenHelpResult = runPackedCli(extractedPackageDir, homeDir, [
      'resolve-token',
      '--help'
    ]);
    assertPackedCliStderr(
      resolveTokenHelpResult.stderr,
      resolveTokenHelpResult.stdout,
      'resolve-token --help'
    );
    assert.match(resolveTokenHelpResult.stdout, /Usage: zk-agent resolve-token/);
    assertNoWorkspaceLeak(resolveTokenHelpResult.stdout);
    assertResolveTokenHelpContract(resolveTokenHelpResult.stdout);

    const workflowHelpResult = runPackedCli(extractedPackageDir, homeDir, [
      'workflow',
      '--help'
    ]);
    assertPackedCliStderr(
      workflowHelpResult.stderr,
      workflowHelpResult.stdout,
      'workflow --help'
    );
    assert.match(workflowHelpResult.stdout, /Usage: zk-agent workflow/);
    assertNoWorkspaceLeak(workflowHelpResult.stdout);
    assertWorkflowHelpContract(workflowHelpResult.stdout);

    const bridgeHelpResult = runPackedCli(extractedPackageDir, homeDir, ['bridge', '--help']);
    assertPackedCliStderr(bridgeHelpResult.stderr, bridgeHelpResult.stdout, 'bridge --help');
    assert.match(bridgeHelpResult.stdout, /Usage: zk-agent bridge/);
    assertNoWorkspaceLeak(bridgeHelpResult.stdout);
    assertBridgeHelpContract(bridgeHelpResult.stdout);

    const sendTokenHelpResult = runPackedCli(extractedPackageDir, homeDir, [
      'send-token',
      '--help'
    ]);
    assertPackedCliStderr(
      sendTokenHelpResult.stderr,
      sendTokenHelpResult.stdout,
      'send-token --help'
    );
    assert.match(sendTokenHelpResult.stdout, /Usage: zk-agent send-token/);
    assertNoWorkspaceLeak(sendTokenHelpResult.stdout);
    assertSendTokenHelpContract(sendTokenHelpResult.stdout);

    const swapHelpResult = runPackedCli(extractedPackageDir, homeDir, ['swap', '--help']);
    assertPackedCliStderr(swapHelpResult.stderr, swapHelpResult.stdout, 'swap --help');
    assert.match(swapHelpResult.stdout, /Usage: zk-agent swap/);
    assertNoWorkspaceLeak(swapHelpResult.stdout);
    assertSwapHelpContract(swapHelpResult.stdout);

    const fundHelpResult = runPackedCli(extractedPackageDir, homeDir, ['fund', '--help']);
    assertPackedCliStderr(fundHelpResult.stderr, fundHelpResult.stdout, 'fund --help');
    assert.match(fundHelpResult.stdout, /Usage: zk-agent fund/);
    assertNoWorkspaceLeak(fundHelpResult.stdout);
    assertFundHelpContract(fundHelpResult.stdout);

    const depositHelpResult = runPackedCli(extractedPackageDir, homeDir, ['deposit', '--help']);
    assertPackedCliStderr(depositHelpResult.stderr, depositHelpResult.stdout, 'deposit --help');
    assert.match(depositHelpResult.stdout, /Usage: zk-agent deposit/);
    assertNoWorkspaceLeak(depositHelpResult.stdout);
    assertDepositHelpContract(depositHelpResult.stdout);

    const withdrawHelpResult = runPackedCli(extractedPackageDir, homeDir, ['withdraw', '--help']);
    assertPackedCliStderr(withdrawHelpResult.stderr, withdrawHelpResult.stdout, 'withdraw --help');
    assert.match(withdrawHelpResult.stdout, /Usage: zk-agent withdraw/);
    assertNoWorkspaceLeak(withdrawHelpResult.stdout);
    assertWithdrawHelpContract(withdrawHelpResult.stdout);

    const relayHelpResult = runPackedCli(extractedPackageDir, homeDir, ['relay', '--help']);
    assertPackedCliStderr(relayHelpResult.stderr, relayHelpResult.stdout, 'relay --help');
    assert.match(relayHelpResult.stdout, /Usage: zk-agent relay/);
    assertNoWorkspaceLeak(relayHelpResult.stdout);
    assertRelayHelpContract(relayHelpResult.stdout);

    const agentHelpResult = runPackedCli(extractedPackageDir, homeDir, ['agent', '--help']);
    assertPackedCliStderr(agentHelpResult.stderr, agentHelpResult.stdout, 'agent --help');
    assert.match(agentHelpResult.stdout, /Usage: zk-agent agent/);
    assertNoWorkspaceLeak(agentHelpResult.stdout);
    assertAgentHelpContract(agentHelpResult.stdout);

    const defaultsOutput = runPackedCliJson(extractedPackageDir, homeDir, ['defaults', '--json']);
    assertNoWorkspaceLeak(defaultsOutput);
    const defaultsPayload = JSON.parse(defaultsOutput);
    assert.equal(defaultsPayload.ok, true);
    assert.equal(Array.isArray(defaultsPayload.defaults?.builtinChains), true);
    assert.equal(Array.isArray(defaultsPayload.localTokenRegistry), true);
    assert.deepEqual(defaultsPayload.defaults?.validated || {}, {});
    assert.deepEqual(defaultsPayload.localTokenRegistry || [], []);

    const profilesOutput = runPackedCliJson(extractedPackageDir, homeDir, [
      'wallet',
      'smart-account',
      'profiles',
      '--json'
    ]);
    assertNoWorkspaceLeak(profilesOutput);
    const profilesPayload = JSON.parse(profilesOutput);
    assert.equal(profilesPayload.ok, true);
    assert.equal(Array.isArray(profilesPayload.profiles), true);
    assert.equal(profilesPayload.profiles.length > 0, true);
    for (const profile of profilesPayload.profiles) {
      assert.equal(profile.artifactReady, true);
      assert.equal(
        profile.notes.some((note) =>
          String(note).includes('Built-in profile assets are not available in this runtime.')
        ),
        false
      );
    }

    const agentStatusOutput = runPackedCliJson(extractedPackageDir, homeDir, [
      'agent',
      'status',
      '--json'
    ]);
    assertNoWorkspaceLeak(agentStatusOutput);
    const agentStatusPayload = JSON.parse(agentStatusOutput);
    assertAgentStatusPayload(agentStatusPayload);

    const doctorOutput = runPackedCliJson(extractedPackageDir, homeDir, ['doctor', '--json']);
    assertNoWorkspaceLeak(doctorOutput);
    const doctorPayload = JSON.parse(doctorOutput);
    assertDoctorSetupPayload(doctorPayload);

    const importOutput = runPackedCliJson(extractedPackageDir, homeDir, [
      'wallet',
      'import',
      '--name',
      'main',
      '--payload',
      JSON.stringify(standaloneSessionPayload())
    ]);
    assertNoWorkspaceLeak(importOutput);
    const importPayload = JSON.parse(importOutput);
    assert.equal(importPayload.ok, true);
    assert.equal(importPayload.wallet.walletName, 'main');

    const predictOutput = runPackedCliJson(
      extractedPackageDir,
      homeDir,
      [
        'wallet',
        'smart-account',
        'predict',
        '--name',
        'main',
        '--profile',
        'sed-lite',
        '--deployment-type',
        'create2Account',
        '--salt',
        '0x00'
      ],
      { allowRecoverableRpcNoise: true }
    );
    assertNoWorkspaceLeak(predictOutput);
    const predictPayload = JSON.parse(predictOutput);
    assert.equal(predictPayload.ok, true);
    assert.equal(predictPayload.profile?.id, 'sed-lite');
    assert.equal(typeof predictPayload.plan?.predictedAddress, 'string');
    assert.equal(Boolean(predictPayload.plan?.artifactContractName), true);
  } finally {
    rmSync(homeDir, { recursive: true, force: true });
  }
}

async function assertInstalledRelayServe(projectRoot, homeDir) {
  const binaryPath = join(projectRoot, 'node_modules', '.bin', 'zk-agent');
  const relayEnv = createStandaloneEnv(homeDir);
  const child = spawn(
    binaryPath,
    ['--json', 'relay', 'serve', '--port', '0', '--public-origin', 'https://relay.example.test'],
    {
      cwd: projectRoot,
      env: relayEnv,
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );

  const stderrChunks = [];
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderrChunks.push(chunk);
  });

  try {
    const payload = await waitForJsonOutput(child.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.status, 'relay-serving');
    assert.equal(payload.publicOrigin, 'https://relay.example.test');
    assert.equal(payload.publicOriginLooksLocal, false);
    assert.equal(payload.connectorUiAvailable, true);
    assert.equal(payload.hostedShareRedirectReady, true);
    assert.equal(payload.capabilities.includes('connector-ui'), true);
    assertNoWorkspaceLeak(JSON.stringify(payload));

    const healthResponse = await fetch(payload.healthUrl);
    assert.equal(healthResponse.status, 200);
    const healthPayload = await healthResponse.json();
    assert.equal(healthPayload.connector_ui_available, true);
    assert.equal(healthPayload.capabilities.includes('connector-ui'), true);
    assert.equal(healthPayload.public_origin, 'https://relay.example.test');
    assert.equal(healthPayload.public_origin_source, 'configured');
    assert.equal(healthPayload.state_backend, 'local-filesystem');
    assert.equal(healthPayload.deployment_scope, 'single-host');
    assert.equal(healthPayload.same_host_restart_persists, true);

    await assertHostedShareLink(payload.origin, payload.publicOrigin, 'release-check-share-link');
  } finally {
    await stopChild(child, 10000);
    const stderr = stderrChunks.join('').trim();
    assert.equal(child.exitCode, 0, stderr || `relay exited with code ${child.exitCode}`);
  }
}

async function assertCleanMachineInstallSmoke(tarballPath) {
  const projectRoot = createCleanMachineInstallRoot();
  const homeDir = mkdtempSync(join(tmpdir(), 'zk-agent-cli-release-check-install-home-'));

  try {
    installTarballInCleanMachineProject(projectRoot, tarballPath);
    assert.equal(
      existsSync(join(projectRoot, 'node_modules', 'zk-agent-cli', 'dist', 'connector-ui', 'index.html')),
      true,
      'Installed package must include the bundled connector UI build.'
    );

    const helpResult = runInstalledCli(projectRoot, homeDir, ['--help']);
    assertPackedCliStderr(helpResult.stderr, helpResult.stdout, 'installed zk-agent --help');
    assert.match(helpResult.stdout, /Usage: zk-agent/);
    assertNoWorkspaceLeak(helpResult.stdout);
    assertTopLevelHelpContract(helpResult.stdout);

    const aliasHelpResult = runInstalledCli(projectRoot, homeDir, ['--help'], 'zksync-agent');
    assertPackedCliStderr(
      aliasHelpResult.stderr,
      aliasHelpResult.stdout,
      'installed zksync-agent --help'
    );
    assert.match(aliasHelpResult.stdout, /Usage: zk-agent/);
    assertNoWorkspaceLeak(aliasHelpResult.stdout);
    assertTopLevelHelpContract(aliasHelpResult.stdout);

    const walletHelpResult = runInstalledCli(projectRoot, homeDir, ['wallet', '--help']);
    assertPackedCliStderr(
      walletHelpResult.stderr,
      walletHelpResult.stdout,
      'installed zk-agent wallet --help'
    );
    assert.match(walletHelpResult.stdout, /Usage: zk-agent wallet/);
    assertNoWorkspaceLeak(walletHelpResult.stdout);
    assertWalletHelpContract(walletHelpResult.stdout);

    const walletRequestHelpResult = runInstalledCli(projectRoot, homeDir, [
      'wallet',
      'request',
      '--help'
    ]);
    assertPackedCliStderr(
      walletRequestHelpResult.stderr,
      walletRequestHelpResult.stdout,
      'installed zk-agent wallet request --help'
    );
    assert.match(walletRequestHelpResult.stdout, /Usage: zk-agent wallet request/);
    assertNoWorkspaceLeak(walletRequestHelpResult.stdout);
    assertWalletRequestHelpContract(walletRequestHelpResult.stdout);

    const walletSignerHelpResult = runInstalledCli(projectRoot, homeDir, [
      'wallet',
      'signer',
      '--help'
    ]);
    assertPackedCliStderr(
      walletSignerHelpResult.stderr,
      walletSignerHelpResult.stdout,
      'installed zk-agent wallet signer --help'
    );
    assert.match(walletSignerHelpResult.stdout, /Usage: zk-agent wallet signer/);
    assertNoWorkspaceLeak(walletSignerHelpResult.stdout);
    assertWalletSignerHelpContract(walletSignerHelpResult.stdout);

    const smartAccountHelpResult = runInstalledCli(projectRoot, homeDir, [
      'wallet',
      'smart-account',
      '--help'
    ]);
    assertPackedCliStderr(
      smartAccountHelpResult.stderr,
      smartAccountHelpResult.stdout,
      'installed zk-agent wallet smart-account --help'
    );
    assert.match(smartAccountHelpResult.stdout, /Usage: zk-agent wallet smart-account/);
    assertNoWorkspaceLeak(smartAccountHelpResult.stdout);
    assertSmartAccountHelpContract(smartAccountHelpResult.stdout);

    const setupHelpResult = runInstalledCli(projectRoot, homeDir, ['setup', '--help']);
    assertPackedCliStderr(
      setupHelpResult.stderr,
      setupHelpResult.stdout,
      'installed zk-agent setup --help'
    );
    assert.match(setupHelpResult.stdout, /Usage: zk-agent (init|setup)/);
    assertNoWorkspaceLeak(setupHelpResult.stdout);
    assertSetupHelpContract(setupHelpResult.stdout);

    const nextHelpResult = runInstalledCli(projectRoot, homeDir, ['next', '--help']);
    assertPackedCliStderr(
      nextHelpResult.stderr,
      nextHelpResult.stdout,
      'installed zk-agent next --help'
    );
    assert.match(nextHelpResult.stdout, /Usage: zk-agent next/);
    assertNoWorkspaceLeak(nextHelpResult.stdout);
    assertNextHelpContract(nextHelpResult.stdout);

    const doctorHelpResult = runInstalledCli(projectRoot, homeDir, ['doctor', '--help']);
    assertPackedCliStderr(
      doctorHelpResult.stderr,
      doctorHelpResult.stdout,
      'installed zk-agent doctor --help'
    );
    assert.match(doctorHelpResult.stdout, /Usage: zk-agent doctor/);
    assertNoWorkspaceLeak(doctorHelpResult.stdout);
    assertDoctorHelpContract(doctorHelpResult.stdout);

    const defaultsHelpResult = runInstalledCli(projectRoot, homeDir, ['defaults', '--help']);
    assertPackedCliStderr(
      defaultsHelpResult.stderr,
      defaultsHelpResult.stdout,
      'installed zk-agent defaults --help'
    );
    assert.match(defaultsHelpResult.stdout, /Usage: zk-agent defaults/);
    assertNoWorkspaceLeak(defaultsHelpResult.stdout);
    assertDefaultsHelpContract(defaultsHelpResult.stdout);

    const assetsHelpResult = runInstalledCli(projectRoot, homeDir, ['assets', '--help']);
    assertPackedCliStderr(
      assetsHelpResult.stderr,
      assetsHelpResult.stdout,
      'installed zk-agent assets --help'
    );
    assert.match(assetsHelpResult.stdout, /Usage: zk-agent assets/);
    assertNoWorkspaceLeak(assetsHelpResult.stdout);
    assertAssetsHelpContract(assetsHelpResult.stdout);

    const tokensHelpResult = runInstalledCli(projectRoot, homeDir, ['tokens', '--help']);
    assertPackedCliStderr(
      tokensHelpResult.stderr,
      tokensHelpResult.stdout,
      'installed zk-agent tokens --help'
    );
    assert.match(tokensHelpResult.stdout, /Usage: zk-agent tokens/);
    assertNoWorkspaceLeak(tokensHelpResult.stdout);
    assertTokensHelpContract(tokensHelpResult.stdout);

    const resolveTokenHelpResult = runInstalledCli(projectRoot, homeDir, ['resolve-token', '--help']);
    assertPackedCliStderr(
      resolveTokenHelpResult.stderr,
      resolveTokenHelpResult.stdout,
      'installed zk-agent resolve-token --help'
    );
    assert.match(resolveTokenHelpResult.stdout, /Usage: zk-agent resolve-token/);
    assertNoWorkspaceLeak(resolveTokenHelpResult.stdout);
    assertResolveTokenHelpContract(resolveTokenHelpResult.stdout);

    const workflowHelpResult = runInstalledCli(projectRoot, homeDir, ['workflow', '--help']);
    assertPackedCliStderr(
      workflowHelpResult.stderr,
      workflowHelpResult.stdout,
      'installed zk-agent workflow --help'
    );
    assert.match(workflowHelpResult.stdout, /Usage: zk-agent workflow/);
    assertNoWorkspaceLeak(workflowHelpResult.stdout);
    assertWorkflowHelpContract(workflowHelpResult.stdout);

    const bridgeHelpResult = runInstalledCli(projectRoot, homeDir, ['bridge', '--help']);
    assertPackedCliStderr(
      bridgeHelpResult.stderr,
      bridgeHelpResult.stdout,
      'installed zk-agent bridge --help'
    );
    assert.match(bridgeHelpResult.stdout, /Usage: zk-agent bridge/);
    assertNoWorkspaceLeak(bridgeHelpResult.stdout);
    assertBridgeHelpContract(bridgeHelpResult.stdout);

    const sendTokenHelpResult = runInstalledCli(projectRoot, homeDir, ['send-token', '--help']);
    assertPackedCliStderr(
      sendTokenHelpResult.stderr,
      sendTokenHelpResult.stdout,
      'installed zk-agent send-token --help'
    );
    assert.match(sendTokenHelpResult.stdout, /Usage: zk-agent send-token/);
    assertNoWorkspaceLeak(sendTokenHelpResult.stdout);
    assertSendTokenHelpContract(sendTokenHelpResult.stdout);

    const swapHelpResult = runInstalledCli(projectRoot, homeDir, ['swap', '--help']);
    assertPackedCliStderr(
      swapHelpResult.stderr,
      swapHelpResult.stdout,
      'installed zk-agent swap --help'
    );
    assert.match(swapHelpResult.stdout, /Usage: zk-agent swap/);
    assertNoWorkspaceLeak(swapHelpResult.stdout);
    assertSwapHelpContract(swapHelpResult.stdout);

    const fundHelpResult = runInstalledCli(projectRoot, homeDir, ['fund', '--help']);
    assertPackedCliStderr(
      fundHelpResult.stderr,
      fundHelpResult.stdout,
      'installed zk-agent fund --help'
    );
    assert.match(fundHelpResult.stdout, /Usage: zk-agent fund/);
    assertNoWorkspaceLeak(fundHelpResult.stdout);
    assertFundHelpContract(fundHelpResult.stdout);

    const depositHelpResult = runInstalledCli(projectRoot, homeDir, ['deposit', '--help']);
    assertPackedCliStderr(
      depositHelpResult.stderr,
      depositHelpResult.stdout,
      'installed zk-agent deposit --help'
    );
    assert.match(depositHelpResult.stdout, /Usage: zk-agent deposit/);
    assertNoWorkspaceLeak(depositHelpResult.stdout);
    assertDepositHelpContract(depositHelpResult.stdout);

    const withdrawHelpResult = runInstalledCli(projectRoot, homeDir, ['withdraw', '--help']);
    assertPackedCliStderr(
      withdrawHelpResult.stderr,
      withdrawHelpResult.stdout,
      'installed zk-agent withdraw --help'
    );
    assert.match(withdrawHelpResult.stdout, /Usage: zk-agent withdraw/);
    assertNoWorkspaceLeak(withdrawHelpResult.stdout);
    assertWithdrawHelpContract(withdrawHelpResult.stdout);

    const relayHelpResult = runInstalledCli(projectRoot, homeDir, ['relay', '--help']);
    assertPackedCliStderr(
      relayHelpResult.stderr,
      relayHelpResult.stdout,
      'installed zk-agent relay --help'
    );
    assert.match(relayHelpResult.stdout, /Usage: zk-agent relay/);
    assertNoWorkspaceLeak(relayHelpResult.stdout);
    assertRelayHelpContract(relayHelpResult.stdout);

    const agentHelpResult = runInstalledCli(projectRoot, homeDir, ['agent', '--help']);
    assertPackedCliStderr(
      agentHelpResult.stderr,
      agentHelpResult.stdout,
      'installed zk-agent agent --help'
    );
    assert.match(agentHelpResult.stdout, /Usage: zk-agent agent/);
    assertNoWorkspaceLeak(agentHelpResult.stdout);
    assertAgentHelpContract(agentHelpResult.stdout);

    const defaultsOutput = runInstalledCliJson(projectRoot, homeDir, ['defaults', '--json']);
    assertNoWorkspaceLeak(defaultsOutput);
    const defaultsPayload = JSON.parse(defaultsOutput);
    assert.equal(defaultsPayload.ok, true);
    assert.equal(Array.isArray(defaultsPayload.defaults?.builtinChains), true);
    assert.equal(Array.isArray(defaultsPayload.localTokenRegistry), true);

    const profilesOutput = runInstalledCliJson(projectRoot, homeDir, [
      'wallet',
      'smart-account',
      'profiles',
      '--json'
    ]);
    assertNoWorkspaceLeak(profilesOutput);
    const profilesPayload = JSON.parse(profilesOutput);
    assert.equal(profilesPayload.ok, true);
    assert.equal(Array.isArray(profilesPayload.profiles), true);
    assert.equal(profilesPayload.profiles.length > 0, true);
    for (const profile of profilesPayload.profiles) {
      assert.equal(profile.artifactReady, true);
    }

    const agentStatusOutput = runInstalledCliJson(projectRoot, homeDir, [
      'agent',
      'status',
      '--json'
    ]);
    assertNoWorkspaceLeak(agentStatusOutput);
    const agentStatusPayload = JSON.parse(agentStatusOutput);
    assertAgentStatusPayload(agentStatusPayload);

    const doctorOutput = runInstalledCliJson(projectRoot, homeDir, ['doctor', '--json']);
    assertNoWorkspaceLeak(doctorOutput);
    const doctorPayload = JSON.parse(doctorOutput);
    assertDoctorSetupPayload(doctorPayload);

    await assertInstalledRelayServe(projectRoot, homeDir);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
  }
}

async function main() {
  const workspacePkg = readWorkspacePackageJson();
  const pkg = readPackageJson();
  const readme = readPackageReadme();
  const rootReadme = readRootReadme();
  const pluginManifest = readPluginManifest();
  const plans = readPlans();
  const projectState = readProjectState();
  const releaseGateDoc = readReleaseGateDoc();
  const operatorJsonContractDoc = readOperatorJsonContractDoc();
  const quickstart = readSkillQuickstart();
  const skillGuide = readSkillGuide();
  assertVersionAlignment(workspacePkg, pkg);
  assertReleaseMetadata(pkg);
  assertPluginManifest(pluginManifest, pkg);
  assertPackageReadme(readme);
  assertRepositoryDocs(rootReadme, quickstart, skillGuide);
  assertOperatorJsonContract(operatorJsonContractDoc);
  assertCurrentVersionDocs({
    version: pkg.version,
    rootReadme,
    plans,
    projectState,
    releaseGateDoc
  });
  createPackDir();
  const reportedTarballPath = packPackage();

  const tarballName = `${pkg.name.replace('@', '').replace('/', '-')}-${pkg.version}.tgz`;
  const tarballPath =
    reportedTarballPath && existsSync(reportedTarballPath)
      ? reportedTarballPath
      : join(packDir, tarballName);
  assert.equal(existsSync(tarballPath), true, `Expected tarball not found: ${tarballPath}`);

  const entries = listPackedFiles(tarballPath);
  assertTarballContents(entries);
  const standaloneInstallRoot = createStandaloneInstallRoot();

  try {
    const extractedPackageDir = extractTarball(tarballPath, standaloneInstallRoot);
    linkRuntimeNodeModules(extractedPackageDir);
    assertStandaloneSmoke(extractedPackageDir);
  } finally {
    rmSync(standaloneInstallRoot, { recursive: true, force: true });
  }

  await assertCleanMachineInstallSmoke(tarballPath);

  rmSync(packDir, { recursive: true, force: true });
  process.stdout.write(`Release check passed: ${tarballName}\n`);
}

await main();
