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

function readChangelog() {
  return readFileSync(join(workspaceRoot, 'CHANGELOG.md'), 'utf8');
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

function readHostedApprovalBaselineDoc() {
  return readFileSync(
    join(workspaceRoot, 'docs', '16-hosted-approval-operated-baseline.md'),
    'utf8'
  );
}

function readReleaseNotes(version) {
  return readFileSync(join(workspaceRoot, 'docs', 'releases', `${version}.md`), 'utf8');
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
    [/## One-minute path/, 'Package README must include the one-minute path section.'],
    [/## Install/, 'Package README must include an Install section.'],
    [/npx zk-agent-cli --help/, 'Package README must document one-shot npx usage.'],
    [/npm install -g zk-agent-cli/, 'Package README must document global install usage.'],
    [/zksync-agent --help/, 'Package README must document the secondary binary name.'],
    [/Node\.js `>=24`/, 'Package README must document the supported Node runtime floor.'],
    [
      /zk-agent setup[\s\S]*zk-agent next[\s\S]*zk-agent wallet create --await-local[\s\S]*zk-agent next[\s\S]*zk-agent workflow pay --wallet main --to <address> --amount <amount>/,
      'Package README must document the shortest success path.'
    ],
    [
      /zk-agent relay inspect --relay-url <relay-url>[\s\S]*zk-agent wallet create --relay-url <relay-url> --wait-relay --prompt-code[\s\S]*zk-agent next/,
      'Package README must document the remote-browser wallet-create fallback on the shortest path.'
    ],
    [
      /If readiness is unclear before you choose a fix, use:[\s\S]*zk-agent doctor/,
      'Package README must document the local-only doctor entrypoint.'
    ],
    [
      /zk-agent suite[\s\S]*(post-flagship|packaged surface)/,
      'Package README must keep the operator-suite surface visible.'
    ],
    [
      /## (Direct Discovery and Bypass Commands|Direct Paths)[\s\S]*zk-agent assets --wallet main[\s\S]*zk-agent tokens --wallet main --owned[\s\S]*zk-agent defaults[\s\S]*zk-agent resolve-token --chain zksync-sepolia --symbol <symbol>/,
      'Package README must document the discovery/defaults path and its command order.'
    ],
    [
      /zk-agent send-token --wallet main --symbol USDC[\s\S]*zk-agent swap --wallet main --token-in-symbol USDC --token-out-symbol ETH[\s\S]*zk-agent fund --wallet main --symbol USDC[\s\S]*zk-agent deposit --wallet main --symbol USDC[\s\S]*zk-agent withdraw --wallet main --symbol USDC/,
      'Package README must document the symbol-first direct-command escape hatches.'
    ],
    [
      /zk-agent wallet reapprove --name main --await-local/,
      'Package README must document the shortest stale-session recovery path.'
    ],
    [/~\/\.zk-agent\//, 'Package README must document the default local storage path.'],
    [
      /ZKSYNC_SEPOLIA_RPC_URL=[\s\S]*ETHEREUM_SEPOLIA_RPC_URL=/,
      'Package README must document the relevant Sepolia RPC environment variables.'
    ],
    [
      /You do not need a custom `\.env` just to run `setup`, `next`, `doctor`, or[\s\S]*create a wallet request\./,
      'Package README must document the first-run .env boundary.'
    ],
    [
      /zk-agent relay inspect --relay-url <relay-url>[\s\S]*zk-agent wallet create --relay-url <relay-url> --wait-relay --prompt-code[\s\S]*zk-agent wallet reapprove --name main --relay-url <relay-url> --wait-relay --prompt-code/,
      'Package README must document the shortest relay-backed approval path.'
    ],
    [
      /docs\/16-hosted-approval-operated-baseline\.md/,
      'Package README must link to the current hosted-approval operated baseline doc.'
    ],
    [/workflows\/\*\.json/, 'Package README must document the workflows storage path correctly.'],
    [/## Common [Ff]ailures/, 'Package README must include a Common Failures section.'],
    [
      /[Cc]onnector callback never arrives:/,
      'Package README must document connector callback repair guidance.'
    ],
    [
      /[Ww]orkflow stops on funding:/,
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
      /## (Entry Points|Use It From)/,
      'Root README must expose a public entrypoint section.'
    ],
    [
      rootReadme,
      /npx zk-agent-cli --help[\s\S]*npm install -g zk-agent-cli[\s\S]*npx skills add https:\/\/github\.com\/AgiWeb3\/zk-agent-cli/,
      'Root README must keep the skill, one-shot CLI, and global CLI entrypoints together.'
    ],
    [
      rootReadme,
      /## Fastest Path[\s\S]*zk-agent setup[\s\S]*zk-agent next[\s\S]*zk-agent wallet create --await-local[\s\S]*zk-agent next[\s\S]*zk-agent workflow pay --wallet main --to <address> --amount <amount>[\s\S]*zk-agent suite/,
      'Root README must keep the canonical terminal path visible.'
    ],
    [
      rootReadme,
      /Current public stage: `[^`]+`\./,
      'Root README must keep the current public-stage product baseline visible.'
    ],
    [
      rootReadme,
      /Focused product slices live under \[skills\/\]\(\.\/skills\/\):[\s\S]*`zk-aa`[\s\S]*`zk-discovery`[\s\S]*`zk-funding`[\s\S]*`zk-paymaster`[\s\S]*`zk-relay`[\s\S]*`zk-defi`/,
      'Root README must keep the split product-skill surface visible, including discovery, funding, and paymaster readiness.'
    ],
    [
      rootReadme,
      /CLI operator manual:[\s\S]*packages\/zk-agent-cli\/README\.md/,
      'Root README must hand off the detailed operator path to the package README.'
    ],
    [
      rootReadme,
      /## Read Next[\s\S]*packages\/zk-agent-cli\/README\.md[\s\S]*skills\/QUICKSTART\.md[\s\S]*docs\/16-hosted-approval-operated-baseline\.md[\s\S]*docs\/README\.md/,
      'Root README must keep the focused reference handoff visible.'
    ],
    [
      rootReadme,
      /Hosted remote approval is documented in:[\s\S]*packages\/zk-agent-cli\/README\.md[\s\S]*docs\/16-hosted-approval-operated-baseline\.md/,
      'Root README must hand off hosted remote approval to the package README and operated-baseline doc.'
    ],
    [
      rootReadme,
      /## Development[\s\S]*pnpm typecheck[\s\S]*pnpm test[\s\S]*pnpm build[\s\S]*pnpm validate:release[\s\S]*pnpm validate:rc/,
      'Root README must keep the release-validation entrypoints visible.'
    ],
    [
      quickstart,
      /## 1\. Install the surface you need/,
      'Quickstart must explain how to choose the entrypoint.'
    ],
    [
      quickstart,
      /npx zk-agent-cli --help[\s\S]*npm install -g zk-agent-cli[\s\S]*npx skills add https:\/\/github\.com\/AgiWeb3\/zk-agent-cli/,
      'Quickstart must keep the skill, one-shot CLI, and global CLI entrypoints together.'
    ],
    [
      quickstart,
      /zk-agent setup[\s\S]*zk-agent next[\s\S]*zk-agent wallet create --await-local[\s\S]*zk-agent next[\s\S]*zk-agent workflow pay --wallet main --to <address> --amount <amount>/,
      'Quickstart must keep the canonical terminal path visible.'
    ],
    [
      quickstart,
      /If readiness is unclear before you choose a fix, use:[\s\S]*zk-agent doctor/,
      'Quickstart must keep the local-only doctor diagnostic visible.'
    ],
    [
      quickstart,
      /## 5\. Use `suite` as the default post-flagship surface[\s\S]*zk-agent suite[\s\S]*zk-agent assets --wallet main[\s\S]*zk-agent defaults[\s\S]*zk-agent resolve-token --chain zksync-sepolia --symbol USDC[\s\S]*zk-agent tokens --chain zksync-sepolia --role paymaster-fee-token/,
      'Quickstart must keep the discovery/defaults contract visible.'
    ],
    [
      quickstart,
      /\[zk-discovery\/SKILL\.md\]\(\.\/zk-discovery\/SKILL\.md\)/,
      'Quickstart must keep the focused discovery skill visible.'
    ],
    [
      quickstart,
      /\[zk-funding\/SKILL\.md\]\(\.\/zk-funding\/SKILL\.md\)/,
      'Quickstart must keep the focused funding skill visible.'
    ],
    [
      quickstart,
      /\[zk-paymaster\/SKILL\.md\]\(\.\/zk-paymaster\/SKILL\.md\)/,
      'Quickstart must keep the focused paymaster skill visible.'
    ],
    [
      quickstart,
      /## 5\. Use `suite` as the default post-flagship surface[\s\S]*zk-agent suite/,
      'Quickstart must keep the operator-suite handoff visible.'
    ],
    [
      quickstart,
      /`\.env` is usually not required for `setup`, `next`, `doctor`, or wallet[\s\S]*request creation/,
      'Quickstart must keep the first-run .env boundary visible.'
    ],
    [
      skillGuide,
      /## Entry points/,
      'Primary skill guide must explain how to choose the entrypoint.'
    ],
    [
      skillGuide,
      /zk-agent <command>[\s\S]*npx zk-agent-cli <command>[\s\S]*pnpm zk-agent <command>[\s\S]*npx skills add https:\/\/github\.com\/AgiWeb3\/zk-agent-cli/,
      'Primary skill guide must keep the skill, packaged CLI, and source-checkout surfaces aligned.'
    ],
    [
      skillGuide,
      /zk-agent setup[\s\S]*zk-agent next[\s\S]*zk-agent wallet create --await-local[\s\S]*zk-agent next[\s\S]*zk-agent workflow pay --wallet main --to <address> --amount <amount>/,
      'Primary skill guide must keep the canonical operator path visible.'
    ],
    [
      skillGuide,
      /Use `zk-agent doctor` before choosing a remediation path when readiness is[\s\S]*unclear\./,
      'Primary skill guide must keep the doctor diagnostic visible.'
    ],
    [
      skillGuide,
      /\[zk-aa\/SKILL\.md\]\(\.\/zk-aa\/SKILL\.md\)[\s\S]*\[zk-discovery\/SKILL\.md\]\(\.\/zk-discovery\/SKILL\.md\)[\s\S]*\[zk-funding\/SKILL\.md\]\(\.\/zk-funding\/SKILL\.md\)[\s\S]*\[zk-paymaster\/SKILL\.md\]\(\.\/zk-paymaster\/SKILL\.md\)[\s\S]*\[zk-relay\/SKILL\.md\]\(\.\/zk-relay\/SKILL\.md\)[\s\S]*\[zk-defi\/SKILL\.md\]\(\.\/zk-defi\/SKILL\.md\)/,
      'Primary skill guide must keep the split sub-skill surface visible, including funding and paymaster readiness.'
    ],
    [
      skillGuide,
      /## Readiness, suite, and funding[\s\S]*zk-agent workflow fund --wallet main[\s\S]*zk-agent workflow fund --wallet main --amount <amount> --execute/,
      'Primary skill guide must keep the funding-readiness contract visible.'
    ],
    [
      skillGuide,
      /## Direct command escape hatches[\s\S]*zk-agent assets --wallet main[\s\S]*zk-agent defaults[\s\S]*zk-agent resolve-token --chain zksync-sepolia --symbol USDC[\s\S]*zk-agent tokens --chain zksync-sepolia --role paymaster-fee-token/,
      'Primary skill guide must keep the discovery/defaults contract visible.'
    ],
    [
      skillGuide,
      /`\.env` is usually not required for `setup`, `next`, `doctor`, or wallet[\s\S]*request creation/,
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
  changelog,
  releaseNotes,
  plans,
  projectState,
  releaseGateDoc
}) {
  const escapedVersion = escapeRegExp(version);
  const releaseStage = version.includes('-rc')
    ? 'rc'
    : version.includes('-beta')
      ? 'beta'
      : 'stable';
  const stageTag = releaseStage === 'stable' ? 'latest' : releaseStage;
  const requiredChecks = [
    [
      rootReadme,
      new RegExp(`Current public stage: \`${escapedVersion}\`\\.`),
      'README.md must keep the current published version visible in the public-stage line.'
    ],
    [
      changelog,
      new RegExp('- `' + escapedVersion + '`'),
      'CHANGELOG.md must point at the current release version.'
    ],
    [
      changelog,
      new RegExp(`- notes: \\[${escapedVersion}\\]\\(\\.\\/docs\\/releases\\/${escapedVersion}\\.md\\)`),
      'CHANGELOG.md must point at the current versioned release-notes file.'
    ],
    [
      changelog,
      new RegExp(
        '- `' +
          escapedVersion +
          '` \\(\\`[^\\`]+\\`\\) - \\[release notes\\]\\(\\.\\/docs\\/releases\\/' +
          escapedVersion +
          '\\.md\\)'
      ),
      'CHANGELOG.md history must include the current release.'
    ],
    [
      plans,
      /release stage: `rc`|release stage: `beta`|release stage: `stable`/,
      'PLANS.md must mention the current release stage.'
    ],
    [
      projectState,
      new RegExp(`package stage: \`${escapedVersion}\``),
      'PROJECT_STATE.md must mention the current package stage.'
    ],
    [
      releaseNotes,
      new RegExp(`# zk-agent-cli ${escapedVersion}`),
      'Versioned release notes must use the current version in the title.'
    ],
    [
      releaseNotes,
      new RegExp('- \\`latest -> ' + escapedVersion + '\\`'),
      'Versioned release notes must record the current latest dist-tag target.'
    ]
  ];

  if (stageTag !== 'latest') {
    requiredChecks.push(
      [
        releaseNotes,
        new RegExp('- \\`' + stageTag + ' -> ' + escapedVersion + '\\`'),
        `Versioned release notes must record the current ${stageTag} dist-tag target.`
      ]
    );
  }

  for (const [source, pattern, message] of requiredChecks) {
    assert.match(source, pattern, message);
  }
}

function assertReleaseStageDocs({
  packageReadme,
  rootReadme,
  plans,
  projectState,
  releaseGateDoc,
  hostedBaselineDoc
}) {
  const requiredChecks = [
    [
      releaseGateDoc,
      /## Release-stage progression[\s\S]*already on the `rc` track[\s\S]*next release-stage decision is `rc -> 1\.0\.0`[\s\S]*not ready to claim `1\.0\.0` yet/,
      'Release gate doc must keep the current RC-stage judgment explicit.'
    ],
    [
      releaseGateDoc,
      /### Closed gate: `beta -> rc`[\s\S]*historical contract[\s\S]*canonical operator path[\s\S]*hosted approval is documented and exercised as an operated product contract[\s\S]*release flow is repeatable[\s\S]*`onboardingSummary`, `workflowEntrySummary`, `walletApprovalSummary`[\s\S]*local and hosted recovery semantics are stable/,
      'Release gate doc must keep the beta-to-rc gate explicit.'
    ],
    [
      releaseGateDoc,
      /### Machine-checkable RC subset[\s\S]*pnpm validate:rc[\s\S]*--report-file <path>[\s\S]*pnpm validate:release[\s\S]*smoke:hosted-operated-baseline[\s\S]*smoke:hosted-recovery[\s\S]*auto-detects the newest matching public hosted evidence report[\s\S]*~\/\.zk-agent\/reports\/hosted-operated-baseline\/[\s\S]*--report-file <path>[\s\S]*necessary for ongoing `rc` maintenance[\s\S]*does not replace the real public browser\/manual rehearsal[\s\S]*--save-report[\s\S]*~\/\.zk-agent\/reports\/hosted-operated-baseline\/[\s\S]*### RC review artifact[\s\S]*pnpm review:rc[\s\S]*repo-tracked file[\s\S]*does not promote the package to `1\.0\.0` by itself[\s\S]*docs\/release-stage-reviews\/<YYYY-MM-DD>-<wallet>-rc\.md/,
      'Release gate doc must keep the machine-checkable RC subset and its manual boundary explicit.'
    ],
    [
      releaseGateDoc,
      /### Gate: `rc -> 1\.0\.0`[\s\S]*every `rc` gate remains closed[\s\S]*one additional zkSync-native product slice[\s\S]*two consecutive end-to-end release rehearsals[\s\S]*no known release-blocking issue remains/,
      'Release gate doc must keep the rc-to-1.0.0 gate explicit.'
    ],
    [
      releaseGateDoc,
      /### Not required for `1\.0\.0`[\s\S]*broad DeFi breadth[\s\S]*Polygon feature-count parity[\s\S]*broader AA profile expansion beyond the current `sed-lite` default path/,
      'Release gate doc must keep the non-blocking scope boundary explicit.'
    ],
    [
      hostedBaselineDoc,
      /## Current Supported Deployment Profile[\s\S]*one relay process[\s\S]*one host[\s\S]*one persistent local filesystem view[\s\S]*same-origin for relay API and approval UI[\s\S]*It is not currently:[\s\S]*horizontally scaled[\s\S]*multi-instance active\/active[\s\S]*stateless/,
      'Hosted baseline doc must describe the current supported single-host deployment profile.'
    ],
    [
      hostedBaselineDoc,
      /### URL contract[\s\S]*share links are emitted from:[\s\S]*`https:\/\/<publicOrigin>\/r\/<request-id>`[\s\S]*status URLs are emitted from:[\s\S]*`https:\/\/<publicOrigin>\/api\/requests\/<request-id>`[\s\S]*browser approval must complete on that same public origin[\s\S]*externally shared URL must come from `publicOrigin`, not the local bind[\s\S]*origin/,
      'Hosted baseline doc must describe the hosted URL contract explicitly.'
    ],
    [
      hostedBaselineDoc,
      /## Request Lifecycle[\s\S]*create or reapprove emits a relay-backed request[\s\S]*relay status is `pending`[\s\S]*browser operator opens the share URL[\s\S]*terminal finalizes via:[\s\S]*zk-agent wallet request approve --request-id <id> --relay-url <url> --code <code> --wait[\s\S]*If relay status becomes `expired`:[\s\S]*treat that as a reissue state, not a polling state[\s\S]*inspect the relay again if deployment readiness is in doubt[\s\S]*reissue `wallet create --relay-url \.\.\.` or[\s\S]*`wallet reapprove --relay-url \.\.\.`[\s\S]*generated recovery command now preserves any CLI-expressible[\s\S]*session-policy flags from the expired request/,
      'Hosted baseline doc must describe the expired-request recovery lifecycle.'
    ],
    [
      hostedBaselineDoc,
      /## Required Readiness Checks[\s\S]*`relay inspect` returns `compatible = true`[\s\S]*`publicOriginLooksLocal = false`[\s\S]*`connectorUiAvailable = true`[\s\S]*`hostedShareRedirectReady = true`[\s\S]*`hostedReadinessSummary\.status = ready`[\s\S]*`deploymentSummary\.singleHostFileState = true`/,
      'Hosted baseline doc must describe the required hosted readiness checks.'
    ],
    [
      hostedBaselineDoc,
      /## Standard Rehearsal Command[\s\S]*--repeat 2 --prompt-code --save-report[\s\S]*~\/\.zk-agent\/reports\/hosted-operated-baseline\/\*\.json/,
      'Hosted baseline doc must describe the report-backed repeated rehearsal evidence path.'
    ],
    [
      hostedBaselineDoc,
      /## Release-stage Meaning[\s\S]*current hosted operated baseline used on[\s\S]*the `rc` track[\s\S]*not, by itself, enough to justify `1\.0\.0`[\s\S]*real smoke coverage on this exact operated mode[\s\S]*relay\/UI\/package contract synchronized[\s\S]*stable recovery semantics/,
      'Hosted baseline doc must keep the rc blocker explicit.'
    ],
    [
      packageReadme,
      /docs\/16-hosted-approval-operated-baseline\.md/,
      'Package README must keep the hosted baseline doc link visible.'
    ],
    [
      rootReadme,
      /## Development[\s\S]*pnpm validate:release[\s\S]*pnpm validate:rc/,
      'Root README must keep the release-validation entrypoints visible.'
    ],
    [
      plans,
      /## Release gates[\s\S]*### Ready for the next RC refresh[\s\S]*validate:release[\s\S]*validate:rc[\s\S]*### Ready for `1\.0\.0`/,
      'PLANS.md must keep the release-stage gates explicit.'
    ],
    [
      projectState,
      /## Snapshot[\s\S]*package stage: `[^`]+`[\s\S]*current focus: RC hardening and productization closeout/,
      'PROJECT_STATE.md must keep the release-stage assessment explicit.'
    ],
    [
      projectState,
      /## Current priorities[\s\S]*hosted approval operated baseline[\s\S]*post-flagship product surface centered on `suite`[\s\S]*release validation and dist-tag behavior/,
      'PROJECT_STATE.md must keep the current RC workstreams explicit.'
    ]
  ];

  for (const [source, pattern, message] of requiredChecks) {
    assert.match(source, pattern, message);
  }
}

function assertReleaseArtifact(changelog, releaseNotes) {
  assert.match(
    changelog,
    /# Changelog[\s\S]*## Current Release[\s\S]*<!-- release-current:start -->[\s\S]*<!-- release-current:end -->[\s\S]*## History[\s\S]*<!-- release-history:start -->[\s\S]*<!-- release-history:end -->/,
    'CHANGELOG.md must keep the managed current/history marker blocks.'
  );

  const requiredReleaseNotesSections = [
    /<!-- release-meta:start -->[\s\S]*Release date: `[^`]+`[\s\S]*Dist-tags:[\s\S]*Release stage: `[^`]+`[\s\S]*<!-- release-meta:end -->/,
    /## Summary/,
    /## Highlights/,
    /## Validation/,
    /## Known Limits/,
    /## References/
  ];

  for (const pattern of requiredReleaseNotesSections) {
    assert.match(
      releaseNotes,
      pattern,
      `Versioned release notes are missing required structure: ${pattern}`
    );
  }

  assert.doesNotMatch(
    releaseNotes,
    /Fill in the public-facing summary|Fill in the most important operator-visible|^TODO\b/im,
    'Versioned release notes must be filled in before release; placeholder text is not allowed.'
  );
}

function assertTopLevelHelpContract(helpOutput) {
  const help = normalizeWhitespace(helpOutput);
  const requiredSnippets = [
    'Local-first zkSync-native CLI for wallet approval, workflow execution, and single-host hosted relay recovery',
    'Public entrypoints:',
    'Agent harness: npx skills add https://github.com/AgiWeb3/zk-agent-cli',
    'One-shot CLI: npx zk-agent-cli --help',
    'Global CLI: npm install -g zk-agent-cli',
    'Canonical terminal path: zk-agent setup zk-agent next zk-agent wallet create --await-local zk-agent next zk-agent workflow pay --wallet main --to <address> --amount <amount>',
    'Validated first-run baseline: setup defaults to zksync-sepolia and the local connector at http://localhost:4444',
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
    'Validated first-run baseline: Default chain: zksync-sepolia Connector URL: http://localhost:4444 Override --default-chain or --connector-url only when you intentionally deviate from that path.',
    'After setup, stay on the canonical local-first path: zk-agent next zk-agent wallet create --await-local zk-agent next',
    'Remote-browser variant of the same path: zk-agent relay inspect --relay-url <url> zk-agent wallet create --relay-url <url> --wait-relay --prompt-code zk-agent next',
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
    'Stay on `next` until it points you at a wallet-specific or workflow-specific blocker.',
    'Fresh local-first routing: zk-agent setup zk-agent next zk-agent wallet create --await-local zk-agent next',
    'Remote-browser variant of the same path: zk-agent relay inspect --relay-url <url> zk-agent wallet create --relay-url <url> --wait-relay --prompt-code zk-agent next',
    'If setup has not run yet, `next` will send you back to `zk-agent setup` first.',
    'Continue a stored workflow checkpoint: zk-agent next --request-id <id>',
    'Stay on the wallet layer only when you need wallet-specific remediation: zk-agent wallet next --name main',
    'Switch to the hosted remote-approval path only when the browser is not colocated: zk-agent relay inspect --relay-url <url> zk-agent wallet create|reapprove --relay-url <url> --wait-relay --prompt-code',
    'Use wallet-layer commands when you already know the blocker is wallet-specific: zk-agent wallet next --name main zk-agent wallet status --name main',
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
    'Run this before guessing whether the blocker is setup, wallet approval, or local signer state.',
    'Remote-browser variant: Pass --relay-url when you want the remote approval fallback commands to use a concrete relay URL instead of a placeholder.'
  ];

  for (const snippet of requiredSnippets) {
    assert.equal(
      help.includes(snippet),
      true,
      `Doctor help is missing required onboarding contract text: ${snippet}`
    );
  }
}

function assertWalletCreateHelpContract(helpOutput) {
  const help = normalizeWhitespace(helpOutput);
  const requiredSnippets = [
    'Default wallet-create path:',
    'Keep `--await-local` as the local-first baseline when the browser and terminal are colocated.',
    'Fresh bootstrap: zk-agent next zk-agent wallet create --await-local zk-agent next',
    'Remote-browser fallback: zk-agent relay inspect --relay-url <url> zk-agent wallet create --relay-url <url> --wait-relay --prompt-code zk-agent next',
    'Environment note: No custom .env is required to create the wallet request itself. Add RPC env vars later, before live reads or broadcasts.'
  ];

  for (const snippet of requiredSnippets) {
    assert.equal(
      help.includes(snippet),
      true,
      `Wallet create help is missing required onboarding contract text: ${snippet}`
    );
  }
}

function assertWalletReapproveHelpContract(helpOutput) {
  const help = normalizeWhitespace(helpOutput);
  const requiredSnippets = [
    'Default wallet-reapprove path:',
    'Use this when the wallet already exists locally but its approval/session must be refreshed.',
    'Colocated browser + terminal: zk-agent wallet reapprove --name main --await-local zk-agent next',
    'Remote-browser fallback: zk-agent relay inspect --relay-url <url> zk-agent wallet reapprove --name main --relay-url <url> --wait-relay --prompt-code zk-agent next',
    'Environment note: No custom .env is required to create the reapproval request itself. Add RPC env vars later, before live reads or broadcasts.'
  ];

  for (const snippet of requiredSnippets) {
    assert.equal(
      help.includes(snippet),
      true,
      `Wallet reapprove help is missing required onboarding contract text: ${snippet}`
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
    'Use this layer when the blocker is specifically about wallet approval or signer state. Otherwise start with `zk-agent next` or `zk-agent doctor`.',
    'First bootstrap: zk-agent wallet create --await-local zk-agent next',
    'Restore approval metadata for an existing wallet: zk-agent wallet reapprove --name main --await-local zk-agent next',
    'Attach a local signer when approval is still present: zk-agent wallet signer attach --name main --private-key <hex> zk-agent next',
    'Hosted remote approval path: zk-agent relay inspect --relay-url <url> zk-agent wallet create --relay-url <url> --wait-relay --prompt-code zk-agent wallet reapprove --name main --relay-url <url> --wait-relay --prompt-code zk-agent next Use this only when the browser is not colocated with the terminal.'
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

function assertSetupPayload(payload) {
  assert.equal(payload.ok, true);
  assert.equal(payload.config?.defaultChain, 'zksync-sepolia');
  assert.equal(payload.config?.connectorUrl, 'http://localhost:4444');
  assert.equal(payload.config?.provider, 'zksync-sso');
  assert.deepEqual(payload.onboardingSummary, {
    stage: 'wallet-bootstrap',
    baseline: 'local-first',
    localOnly: true,
    configExists: true,
    walletExists: null,
    approvalReady: null,
    localExecutionKeyStored: null,
    defaultChain: 'zksync-sepolia',
    connectorUrl: 'http://localhost:4444',
    relayUrl: null,
    nextAction: 'zk-agent next',
    notes: [
      'Setup only writes local defaults and does not inspect wallet state.',
      'Stay on zk-agent next so the product entrypoint can decide between wallet bootstrap and workflow guidance.'
    ]
  });
  assert.deepEqual(payload.recommendedCommands, {
    next: 'zk-agent next',
    inspectDefaults: 'zk-agent defaults',
    createWallet: 'zk-agent wallet create --await-local',
    relayInspect: 'zk-agent relay inspect --relay-url <url>',
    createWalletRemote: 'zk-agent wallet create --relay-url <url> --wait-relay --prompt-code',
    afterWalletApproval: 'zk-agent next'
  });
}

function assertNextSetupPayload(payload) {
  assert.equal(payload.ok, true);
  assert.equal(payload.scope, 'setup');
  assert.equal(payload.nextCommand, 'zk-agent setup');
  assert.deepEqual(payload.onboardingSummary, {
    stage: 'setup',
    baseline: 'local-first',
    localOnly: true,
    configExists: false,
    walletExists: false,
    approvalReady: null,
    localExecutionKeyStored: null,
    defaultChain: null,
    connectorUrl: null,
    relayUrl: null,
    nextAction: 'zk-agent setup',
    notes: [
      'No local config was found, so setup is still the first required onboarding step.',
      'This scope is local-only and does not require live RPC reads.'
    ]
  });
  assert.deepEqual(payload.recommendedCommands, {
    setup: 'zk-agent setup',
    afterSetup: 'zk-agent next',
    inspectDefaults: 'zk-agent defaults'
  });
}

function assertNextWalletBootstrapPayload(payload) {
  assert.equal(payload.ok, true);
  assert.equal(payload.scope, 'wallet-bootstrap');
  assert.equal(payload.walletName, 'main');
  assert.equal(payload.nextCommand, 'zk-agent wallet create --await-local');
  assert.deepEqual(payload.onboardingSummary, {
    stage: 'wallet-bootstrap',
    baseline: 'local-first',
    localOnly: true,
    configExists: true,
    walletExists: false,
    approvalReady: null,
    localExecutionKeyStored: null,
    defaultChain: 'zksync-sepolia',
    connectorUrl: 'http://localhost:4444',
    relayUrl: null,
    nextAction: 'zk-agent wallet create --await-local',
    notes: [
      'Config exists, but no saved wallet record was found for this name yet.',
      'Use the remote approval fallback only when the browser is not colocated with this terminal.'
    ]
  });
  assert.deepEqual(payload.recommendedCommands, {
    createWallet: 'zk-agent wallet create --await-local',
    relayInspect: 'zk-agent relay inspect --relay-url <url>',
    createWalletRemote:
      'zk-agent wallet create --relay-url <url> --wait-relay --prompt-code',
    afterApproval: 'zk-agent next',
    inspectDefaults: 'zk-agent defaults'
  });
}

function assertDoctorSetupPayload(payload) {
  assert.equal(payload.ok, true);
  assert.equal(payload.scope, 'setup');
  assert.equal(payload.walletName, 'main');
  assert.deepEqual(payload.config, { exists: false });
  assert.equal(payload.wallet, null);
  assert.deepEqual(payload.onboardingSummary, {
    stage: 'setup',
    baseline: 'local-first',
    localOnly: true,
    configExists: false,
    walletExists: false,
    approvalReady: null,
    localExecutionKeyStored: null,
    defaultChain: null,
    connectorUrl: null,
    relayUrl: null,
    nextAction: 'zk-agent setup',
    notes: [
      'Local config is missing, so the canonical operator path should start with setup.',
      'Doctor is local-only by default and does not require live RPC reads.'
    ]
  });
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
      /## Compatibility Boundary[\s\S]*source of truth for the frozen machine-readable[\s\S]*operator contract on the default product path[\s\S]*At the current `rc` stage, the intentionally frozen compatibility boundary is:[\s\S]*`onboardingSummary`[\s\S]*`workflowEntrySummary`[\s\S]*`walletApprovalSummary`[\s\S]*`recommendedCommands`[\s\S]*`nextAction`[\s\S]*`afterApproval`[\s\S]*`afterApprovalStatus`[\s\S]*Fields and command surfaces that are not documented here as current[\s\S]*stable contract are not frozen by default[\s\S]*### Change policy[\s\S]*Removing, renaming, or repurposing[\s\S]*Changing the meaning or command shape[\s\S]*New fields may be added only when they are optional[\s\S]*breaking change is still required during `rc`/,
      'Operator JSON contract doc must declare the frozen compatibility boundary and change policy for rc work.'
    ],
    [
      /### `onboardingSummary`[\s\S]*Current stable fields:[\s\S]*`stage`[\s\S]*`baseline`[\s\S]*`localOnly`[\s\S]*`configExists`[\s\S]*`walletExists`[\s\S]*`approvalReady`[\s\S]*`localExecutionKeyStored`[\s\S]*`defaultChain`[\s\S]*`connectorUrl`[\s\S]*`relayUrl`[\s\S]*`nextAction`[\s\S]*`notes`/,
      'Operator JSON contract doc must describe the shared onboardingSummary contract.'
    ],
    [
      /## `zk-agent setup`[\s\S]*Current stable top-level fields:[\s\S]*`ok`[\s\S]*`config`[\s\S]*`onboardingSummary`[\s\S]*`recommendedCommands`[\s\S]*Current stable baseline defaults on the validated first-run path:[\s\S]*`defaultChain = "zksync-sepolia"`[\s\S]*`connectorUrl = "http:\/\/localhost:4444"`/,
      'Operator JSON contract doc must describe the setup onboarding contract.'
    ],
    [
      /## `zk-agent doctor`[\s\S]*local-only onboarding and wallet-recovery diagnostic[\s\S]*Current stable top-level fields:[\s\S]*`ok`[\s\S]*`scope`[\s\S]*`walletName`[\s\S]*`config`[\s\S]*`wallet`[\s\S]*`onboardingSummary`[\s\S]*`summary`[\s\S]*`agentProfile`[\s\S]*`agentFollowup`[\s\S]*`nextAction`[\s\S]*`recommendedCommands`[\s\S]*Current stable `scope` values:[\s\S]*`setup`[\s\S]*`wallet-bootstrap`[\s\S]*`wallet-recovery`[\s\S]*`wallet-ready`[\s\S]*Current stable `config` fields:[\s\S]*`exists`[\s\S]*`defaultChain`[\s\S]*`connectorUrl`[\s\S]*`provider`[\s\S]*Current stable `wallet` fields when present:[\s\S]*`exists`[\s\S]*`walletName`[\s\S]*`walletAddress`[\s\S]*`chain`[\s\S]*`chainId`[\s\S]*`accountKind`[\s\S]*`smartAccountProfileId`[\s\S]*`syncedAt`[\s\S]*`approvalReady`[\s\S]*`localExecutionKeyStored`[\s\S]*`legacySessionKeyStored`[\s\S]*`signerType`[\s\S]*`signerAddress`[\s\S]*`signerSource`[\s\S]*Current stable `summary` fields:[\s\S]*`stage`[\s\S]*`configExists`[\s\S]*`walletExists`[\s\S]*`approvalReady`[\s\S]*`localExecutionKeyStored`[\s\S]*`relayUrl`[\s\S]*`nextAction`[\s\S]*`localOnly`[\s\S]*`notes`/,
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
      /## `zk-agent next`[\s\S]*### Shared fields[\s\S]*`scope`[\s\S]*`nextCommand`[\s\S]*`onboardingSummary`[\s\S]*`agentProfile`[\s\S]*`agentFollowup`[\s\S]*`recommendedCommands`/,
      'Operator JSON contract doc must describe the shared next onboardingSummary contract.'
    ],
    [
      /"scope": "setup"[\s\S]*"nextCommand": "zk-agent setup"[\s\S]*"onboardingSummary": \{[\s\S]*"stage": "setup"[\s\S]*"baseline": "local-first"[\s\S]*"localOnly": true[\s\S]*"nextAction": "zk-agent setup"[\s\S]*"recommendedCommands": \{[\s\S]*"setup": "zk-agent setup"[\s\S]*"afterSetup": "zk-agent next"[\s\S]*"inspectDefaults": "zk-agent defaults"/,
      'Operator JSON contract doc must describe the setup-scope recommendedCommands contract.'
    ],
    [
      /"scope": "wallet-bootstrap"[\s\S]*"nextCommand": "zk-agent wallet create --await-local"[\s\S]*"onboardingSummary": \{[\s\S]*"stage": "wallet-bootstrap"[\s\S]*"baseline": "local-first"[\s\S]*"defaultChain": "zksync-sepolia"[\s\S]*"connectorUrl": "http:\/\/localhost:4444"[\s\S]*"nextAction": "zk-agent wallet create --await-local"[\s\S]*"recommendedCommands": \{[\s\S]*"createWallet": "zk-agent wallet create --await-local"[\s\S]*"relayInspect": "zk-agent relay inspect --relay-url <url>"[\s\S]*"createWalletRemote": "zk-agent wallet create --relay-url <url> --wait-relay --prompt-code"[\s\S]*"afterApproval": "zk-agent next"[\s\S]*"inspectDefaults": "zk-agent defaults"/,
      'Operator JSON contract doc must describe the wallet-bootstrap recommendedCommands contract.'
    ],
    [
      /"scope": "wallet"[\s\S]*"onboardingSummary": \{[\s\S]*"stage": "wallet-ready"[\s\S]*"baseline": "local-first"[\s\S]*"localOnly": false[\s\S]*"defaultChain": "zksync-sepolia"[\s\S]*"connectorUrl": "http:\/\/localhost:4444"[\s\S]*"nextAction": "zk-agent workflow pay --wallet main --to <address> --amount <amount>"[\s\S]*"recommendedCommands": \{[\s\S]*"walletNext": "zk-agent wallet next --name main"[\s\S]*"walletStatus": "zk-agent wallet status --name main"[\s\S]*"discoverAssets": "zk-agent assets --wallet main"[\s\S]*"discoverOwnedTokens": "zk-agent tokens --wallet main --owned"[\s\S]*"discoverTokens": "zk-agent tokens --chain zksync-sepolia"[\s\S]*"inspectToken": "zk-agent resolve-token --chain zksync-sepolia --symbol <symbol>"[\s\S]*"discoverPaymasterTokens": "zk-agent tokens --chain zksync-sepolia --role paymaster-fee-token"[\s\S]*"inspectPaymasterToken": "zk-agent resolve-token --chain zksync-sepolia --symbol <symbol> --role paymaster-fee-token"[\s\S]*"workflowPay": "zk-agent workflow pay --wallet main --to <address> --amount <amount>"[\s\S]*"workflowAuto": "zk-agent workflow auto --wallet main --intent <intent> \[goal flags\] --create-checkpoint --execute-when-ready"/,
      'Operator JSON contract doc must describe the wallet-scope discovery recommendedCommands contract.'
    ],
    [
      /### `scope = "wallet"`[\s\S]*"tokenDiscoverySummary": \{\s*"\.\.\.": "wallet-scope token recovery summary"\s*\}[\s\S]*When the wallet scope exposes token\/discovery follow-ups[\s\S]*`walletName`[\s\S]*`chain`[\s\S]*`intent`[\s\S]*`nextAction`[\s\S]*`paymasterMode`[\s\S]*`tokenizedIntent`[\s\S]*`includesAssetDiscovery`[\s\S]*`includesOwnedTokenDiscovery`[\s\S]*`includesChainTokenDiscovery`[\s\S]*`includesDirectTokenInspection`[\s\S]*`includesPaymasterTokenDiscovery`[\s\S]*`includesPaymasterTokenInspection`/,
      'Operator JSON contract doc must describe the top-level wallet tokenDiscoverySummary contract.'
    ],
    [
      /### `scope = "workflow"`[\s\S]*"summary": \{[\s\S]*"status": "blocked"[\s\S]*"readyForGoal": false[\s\S]*"nextCommand": "zk-agent workflow resume --request-id wf123456"[\s\S]*"blockingActionIds": \["reapprove"\][\s\S]*"tokenDiscoverySummary": \{\s*"\.\.\.": "workflow-scope token recovery summary"\s*\}[\s\S]*Current stable `summary` fields on this surface:[\s\S]*`status`[\s\S]*`readyForGoal`[\s\S]*`nextCommand`[\s\S]*`blockingActionIds`[\s\S]*`fundingProgress`[\s\S]*When the restored workflow intent is tokenized[\s\S]*the same field set described for wallet scope/,
      'Operator JSON contract doc must describe the top-level workflow tokenDiscoverySummary contract.'
    ],
    [
      /## `zk-agent wallet status\|next`[\s\S]*Current stable top-level fields:[\s\S]*`ok`[\s\S]*`inspection`[\s\S]*`summary`[\s\S]*`tokenDiscoverySummary`[\s\S]*`recommendedCommands`[\s\S]*When the effective wallet paymaster mode is `approval-based`[\s\S]*`discoverPaymasterTokens`[\s\S]*`inspectPaymasterToken`[\s\S]*When wallet-scoped discovery follow-ups are present[\s\S]*`walletName`[\s\S]*`chain`[\s\S]*`intent`[\s\S]*`nextAction`[\s\S]*`paymasterMode`[\s\S]*`tokenizedIntent`[\s\S]*`includesAssetDiscovery`[\s\S]*`includesOwnedTokenDiscovery`[\s\S]*`includesChainTokenDiscovery`[\s\S]*`includesDirectTokenInspection`[\s\S]*`includesPaymasterTokenDiscovery`[\s\S]*`includesPaymasterTokenInspection`/,
      'Operator JSON contract doc must describe the wallet status/next tokenDiscoverySummary contract.'
    ],
    [
      /### `workflow status\|next\|run\|resume`[\s\S]*Tokenized workflow outputs should keep the same local-first recovery contract[\s\S]*visible:[\s\S]*`discoverAssets`[\s\S]*`discoverOwnedTokens`[\s\S]*`discoverTokens`[\s\S]*`inspectToken`[\s\S]*`discoverPaymasterTokens`[\s\S]*`inspectPaymasterToken`/,
      'Operator JSON contract doc must describe the tokenized workflow discovery follow-up contract.'
    ],
    [
      /### `workflow plan`[\s\S]*`inspection`[\s\S]*`plan`[\s\S]*`workflowEntrySummary`[\s\S]*`tokenDiscoverySummary`[\s\S]*`recommendedCommands`[\s\S]*When the current intent is tokenized[\s\S]*`walletName`[\s\S]*`chain`[\s\S]*`intent`[\s\S]*`nextAction`[\s\S]*`paymasterMode`[\s\S]*`tokenizedIntent`[\s\S]*`includesAssetDiscovery`[\s\S]*`includesOwnedTokenDiscovery`[\s\S]*`includesChainTokenDiscovery`[\s\S]*`includesDirectTokenInspection`[\s\S]*`includesPaymasterTokenDiscovery`[\s\S]*`includesPaymasterTokenInspection`/,
      'Operator JSON contract doc must describe the workflow plan tokenDiscoverySummary contract.'
    ],
    [
      /### `workflow auto`[\s\S]*`walletApproval`[\s\S]*`workflowEntrySummary`[\s\S]*`tokenDiscoverySummary`[\s\S]*`recommendedCommands`[\s\S]*### `workflow status\|next\|run\|resume`[\s\S]*`agentProfile`[\s\S]*`agentFollowup`[\s\S]*`workflowEntrySummary`[\s\S]*`tokenDiscoverySummary`[\s\S]*`recommendedCommands`[\s\S]*Current stable `tokenDiscoverySummary` fields on tokenized workflow surfaces:[\s\S]*`walletName`[\s\S]*`chain`[\s\S]*`intent`[\s\S]*`nextAction`[\s\S]*`paymasterMode`[\s\S]*`tokenizedIntent`[\s\S]*`includesAssetDiscovery`[\s\S]*`includesOwnedTokenDiscovery`[\s\S]*`includesChainTokenDiscovery`[\s\S]*`includesDirectTokenInspection`[\s\S]*`includesPaymasterTokenDiscovery`[\s\S]*`includesPaymasterTokenInspection`/,
      'Operator JSON contract doc must describe the workflow runtime tokenDiscoverySummary contract.'
    ],
    [
      /### `workflow auto`[\s\S]*`walletApprovalSummary`[\s\S]*### `workflow status\|next\|run\|resume`[\s\S]*`walletApprovalSummary`[\s\S]*Current stable `walletApprovalSummary` fields on workflow runtime surfaces when[\s\S]*`status`[\s\S]*`walletRequestId`[\s\S]*`reusedRequest`[\s\S]*`relayPublished`[\s\S]*`nextAction`[\s\S]*`afterApproval`[\s\S]*`afterApprovalStatus`/,
      'Operator JSON contract doc must describe the workflow walletApprovalSummary contract.'
    ],
    [
      /`workflowEntrySummary` now provides the entrypoint-level compatibility contract[\s\S]*Current stable `workflowEntrySummary` fields:[\s\S]*`entrypoint`[\s\S]*`command`[\s\S]*`source`[\s\S]*`workflowRequestId`[\s\S]*`walletName`[\s\S]*`intent`[\s\S]*`runtimeStatus`[\s\S]*`readyForGoal`[\s\S]*`walletApprovalStatus`[\s\S]*`checkpointPersisted`[\s\S]*`nextAction`[\s\S]*### `workflowEntrySummary` examples[\s\S]*"command": "plan"[\s\S]*"command": "next"[\s\S]*"walletApprovalStatus": "relay-pending"/,
      'Operator JSON contract doc must describe the shared workflowEntrySummary contract.'
    ],
    [
      /### `workflow auto`[\s\S]*`summary`[\s\S]*### `workflow status\|next\|run\|resume`[\s\S]*`summary`[\s\S]*Current stable `summary` fields on workflow runtime surfaces:[\s\S]*`status`[\s\S]*`readyForGoal`[\s\S]*`nextCommand`[\s\S]*`blockingActionIds`[\s\S]*`fundingProgress`[\s\S]*On `workflow auto\|run\|resume`, `summary\.status` mirrors `result\.stage`[\s\S]*workflow readiness status/,
      'Operator JSON contract doc must describe the workflow runtime summary contract.'
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
      /## `zk-agent relay serve`[\s\S]*Current stable top-level fields:[\s\S]*`ok`[\s\S]*`status`[\s\S]*`origin`[\s\S]*`publicOrigin`[\s\S]*`publicOriginSource`[\s\S]*`stateBackend`[\s\S]*`deploymentScope`[\s\S]*`sameHostRestartPersists`[\s\S]*`shareLinkBaseUrl`[\s\S]*`statusApiBaseUrl`[\s\S]*`publicOriginLooksLocal`[\s\S]*`approvalEndpointSummary`[\s\S]*`hostedReadinessSummary`[\s\S]*`deploymentSummary`[\s\S]*`healthUrl`[\s\S]*`publicHealthUrl`[\s\S]*`relayMode`[\s\S]*`connectorUiAvailable`[\s\S]*`hostedShareRedirectReady`[\s\S]*`capabilities`[\s\S]*`recommendedCommands`[\s\S]*`notes`[\s\S]*Current stable `hostedReadinessSummary` fields on this surface:[\s\S]*`status`[\s\S]*`compatible`[\s\S]*`hostedApprovalReady`[\s\S]*`publicOriginConfigured`[\s\S]*`publicOriginLooksLocal`[\s\S]*`connectorUiAvailable`[\s\S]*`singleHostFileState`[\s\S]*Current stable `approvalEndpointSummary` fields on this surface:[\s\S]*`status`[\s\S]*`publicOriginConfigured`[\s\S]*`publicOriginLooksLocal`[\s\S]*`relayUrlMatchesPublicOrigin`[\s\S]*`shareLinkBaseUrl`[\s\S]*`statusApiBaseUrl`[\s\S]*Current stable approval-endpoint `status` values on this surface:[\s\S]*`local-public-origin`[\s\S]*`hosted-public-origin`[\s\S]*Current stable hosted-readiness `status` values on this surface:[\s\S]*`ready`[\s\S]*`needs-public-origin`[\s\S]*`needs-connector-ui`[\s\S]*`needs-public-origin-and-ui`[\s\S]*`incompatible`[\s\S]*When present, `deploymentSummary` compresses the hosted deployment contract[\s\S]*into:[\s\S]*`origin`[\s\S]*`publicOrigin`[\s\S]*`publicOriginSource`[\s\S]*`shareLinkBaseUrl`[\s\S]*`statusApiBaseUrl`[\s\S]*`publicOriginConfigured`[\s\S]*`publicOriginLooksLocal`[\s\S]*`connectorUiAvailable`[\s\S]*`hostedShareRedirectReady`[\s\S]*`singleHostFileState`[\s\S]*Current stable `recommendedCommands` shape on this surface:[\s\S]*`inspectRelay`[\s\S]*`createWallet`[\s\S]*`reapproveWallet`[\s\S]*`restartWithPublicOrigin`/,
      'Operator JSON contract doc must describe the relay serve approval-endpoint and deployment-summary contracts.'
    ],
    [
      /## `zk-agent relay inspect`[\s\S]*Current stable top-level fields:[\s\S]*`ok`[\s\S]*`status`[\s\S]*`relayUrl`[\s\S]*`compatible`[\s\S]*`origin`[\s\S]*`publicOrigin`[\s\S]*`publicOriginSource`[\s\S]*`stateBackend`[\s\S]*`deploymentScope`[\s\S]*`sameHostRestartPersists`[\s\S]*`shareLinkBaseUrl`[\s\S]*`statusApiBaseUrl`[\s\S]*`relayUrlMatchesOrigin`[\s\S]*`relayUrlMatchesPublicOrigin`[\s\S]*`publicOriginLooksLocal`[\s\S]*`approvalEndpointSummary`[\s\S]*`hostedReadinessSummary`[\s\S]*`deploymentSummary`[\s\S]*`connectorUiAvailable`[\s\S]*`hostedShareRedirectReady`[\s\S]*`capabilities`[\s\S]*`recommendedCommands`[\s\S]*`notes`[\s\S]*Current stable `hostedReadinessSummary` fields on this surface:[\s\S]*`status`[\s\S]*`compatible`[\s\S]*`hostedApprovalReady`[\s\S]*`publicOriginConfigured`[\s\S]*`publicOriginLooksLocal`[\s\S]*`connectorUiAvailable`[\s\S]*`singleHostFileState`[\s\S]*Current stable `approvalEndpointSummary` fields on this surface:[\s\S]*`status`[\s\S]*`publicOriginConfigured`[\s\S]*`publicOriginLooksLocal`[\s\S]*`relayUrlMatchesPublicOrigin`[\s\S]*`shareLinkBaseUrl`[\s\S]*`statusApiBaseUrl`[\s\S]*Current stable approval-endpoint `status` values on this surface:[\s\S]*`local-public-origin`[\s\S]*`hosted-public-origin`[\s\S]*`hosted-public-origin-via-proxy`[\s\S]*Current stable hosted-readiness `status` values on this surface:[\s\S]*`ready`[\s\S]*`needs-public-origin`[\s\S]*`needs-connector-ui`[\s\S]*`needs-public-origin-and-ui`[\s\S]*`incompatible`[\s\S]*Current stable `deploymentSummary` fields on this surface:[\s\S]*`origin`[\s\S]*`publicOrigin`[\s\S]*`publicOriginSource`[\s\S]*`shareLinkBaseUrl`[\s\S]*`statusApiBaseUrl`[\s\S]*`publicOriginConfigured`[\s\S]*`publicOriginLooksLocal`[\s\S]*`connectorUiAvailable`[\s\S]*`hostedShareRedirectReady`[\s\S]*`singleHostFileState`[\s\S]*Current stable `recommendedCommands` shape on this surface:[\s\S]*`createWallet`[\s\S]*`reapproveWallet`[\s\S]*`restartWithPublicOrigin`/,
      'Operator JSON contract doc must describe the relay inspect approval-endpoint and deployment-summary contracts.'
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
      createdAt: '2099-08-04T00:00:00.000Z',
      expiresAt: '2099-08-10T00:00:00.000Z',
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

async function assertHostedShareLinkForExistingRequest(projectOrigin, publicOrigin, requestId) {
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

    const walletCreateHelpResult = runPackedCli(extractedPackageDir, homeDir, [
      'wallet',
      'create',
      '--help'
    ]);
    assertPackedCliStderr(
      walletCreateHelpResult.stderr,
      walletCreateHelpResult.stdout,
      'wallet create --help'
    );
    assert.match(walletCreateHelpResult.stdout, /Usage: zk-agent wallet create/);
    assertNoWorkspaceLeak(walletCreateHelpResult.stdout);
    assertWalletCreateHelpContract(walletCreateHelpResult.stdout);

    const walletReapproveHelpResult = runPackedCli(extractedPackageDir, homeDir, [
      'wallet',
      'reapprove',
      '--help'
    ]);
    assertPackedCliStderr(
      walletReapproveHelpResult.stderr,
      walletReapproveHelpResult.stdout,
      'wallet reapprove --help'
    );
    assert.match(walletReapproveHelpResult.stdout, /Usage: zk-agent wallet reapprove/);
    assertNoWorkspaceLeak(walletReapproveHelpResult.stdout);
    assertWalletReapproveHelpContract(walletReapproveHelpResult.stdout);

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

    const nextSetupOutput = runPackedCliJson(extractedPackageDir, homeDir, ['next', '--json']);
    assertNoWorkspaceLeak(nextSetupOutput);
    const nextSetupPayload = JSON.parse(nextSetupOutput);
    assertNextSetupPayload(nextSetupPayload);

    const doctorOutput = runPackedCliJson(extractedPackageDir, homeDir, ['doctor', '--json']);
    assertNoWorkspaceLeak(doctorOutput);
    const doctorPayload = JSON.parse(doctorOutput);
    assertDoctorSetupPayload(doctorPayload);

    const setupOutput = runPackedCliJson(extractedPackageDir, homeDir, ['setup', '--json']);
    assertNoWorkspaceLeak(setupOutput);
    const setupPayload = JSON.parse(setupOutput);
    assertSetupPayload(setupPayload);

    const nextWalletBootstrapOutput = runPackedCliJson(extractedPackageDir, homeDir, [
      'next',
      '--json'
    ]);
    assertNoWorkspaceLeak(nextWalletBootstrapOutput);
    const nextWalletBootstrapPayload = JSON.parse(nextWalletBootstrapOutput);
    assertNextWalletBootstrapPayload(nextWalletBootstrapPayload);

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
  const publicOrigin = 'https://relay.example.test';
  const requestId = 'release-check-share-link';
  let child = null;

  function spawnRelay(port) {
    const spawned = spawn(
      binaryPath,
      ['--json', 'relay', 'serve', '--port', String(port), '--public-origin', publicOrigin],
      {
        cwd: projectRoot,
        env: relayEnv,
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );

    const stderrChunks = [];
    spawned.stderr.setEncoding('utf8');
    spawned.stderr.on('data', (chunk) => {
      stderrChunks.push(chunk);
    });

    return {
      child: spawned,
      readStderr: () => stderrChunks.join('').trim()
    };
  }

  try {
    const firstRelay = spawnRelay(0);
    child = firstRelay.child;
    const payload = await waitForJsonOutput(child.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.status, 'relay-serving');
    assert.equal(payload.publicOrigin, publicOrigin);
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
    assert.equal(healthPayload.public_origin, publicOrigin);
    assert.equal(healthPayload.public_origin_source, 'configured');
    assert.equal(healthPayload.state_backend, 'local-filesystem');
    assert.equal(healthPayload.deployment_scope, 'single-host');
    assert.equal(healthPayload.same_host_restart_persists, true);

    const createResponse = await fetch(`${payload.origin}/api/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(buildRelayCreateRequest(requestId))
    });
    assert.equal(createResponse.status, 201);

    const firstStatusResponse = await fetch(`${payload.origin}/api/requests/${requestId}`);
    assert.equal(firstStatusResponse.status, 200);
    const firstStatusPayload = await firstStatusResponse.json();
    assert.equal(firstStatusPayload.request_id, requestId);
    assert.equal(firstStatusPayload.status, 'pending');
    assert.equal(firstStatusPayload.approval_ready, false);
    assert.equal(firstStatusPayload.share_url, `${publicOrigin}/r/${requestId}`);
    assert.equal(
      firstStatusPayload.status_url,
      `${publicOrigin}/api/requests/${requestId}`
    );
    assert.equal(firstStatusPayload.approval_url, `${publicOrigin}/r/${requestId}`);
    assert.equal(firstStatusPayload.expires_at, '2099-08-10T00:00:00.000Z');
    assert.equal(firstStatusPayload.request.expiresAt, '2099-08-10T00:00:00.000Z');

    await assertHostedShareLinkForExistingRequest(payload.origin, payload.publicOrigin, requestId);

    const relayPort = new URL(payload.origin).port;
    await stopChild(child, 10000);
    assert.equal(
      child.exitCode,
      0,
      firstRelay.readStderr() || `relay exited with code ${child.exitCode}`
    );
    child = null;

    const secondRelay = spawnRelay(relayPort);
    child = secondRelay.child;
    const restartedPayload = await waitForJsonOutput(child.stdout);
    assert.equal(restartedPayload.ok, true);
    assert.equal(restartedPayload.status, 'relay-serving');
    assert.equal(restartedPayload.origin, payload.origin);
    assert.equal(restartedPayload.publicOrigin, publicOrigin);
    assert.equal(restartedPayload.publicOriginLooksLocal, false);
    assert.equal(restartedPayload.stateBackend, 'local-filesystem');
    assert.equal(restartedPayload.deploymentScope, 'single-host');
    assert.equal(restartedPayload.sameHostRestartPersists, true);
    assert.equal(restartedPayload.connectorUiAvailable, true);
    assert.equal(restartedPayload.hostedShareRedirectReady, true);

    const restartedStatusResponse = await fetch(
      `${restartedPayload.origin}/api/requests/${requestId}`
    );
    assert.equal(restartedStatusResponse.status, 200);
    const restartedStatusPayload = await restartedStatusResponse.json();
    assert.equal(restartedStatusPayload.request_id, requestId);
    assert.equal(restartedStatusPayload.status, 'pending');
    assert.equal(restartedStatusPayload.approval_ready, false);
    assert.equal(restartedStatusPayload.share_url, `${publicOrigin}/r/${requestId}`);
    assert.equal(
      restartedStatusPayload.status_url,
      `${publicOrigin}/api/requests/${requestId}`
    );
    assert.equal(restartedStatusPayload.approval_url, `${publicOrigin}/r/${requestId}`);
    assert.equal(restartedStatusPayload.expires_at, '2099-08-10T00:00:00.000Z');
    assert.equal(restartedStatusPayload.request.expiresAt, '2099-08-10T00:00:00.000Z');
    assert.equal(restartedStatusPayload.request.requestId, requestId);

    const restartedHealthResponse = await fetch(restartedPayload.healthUrl);
    assert.equal(restartedHealthResponse.status, 200);
    const restartedHealthPayload = await restartedHealthResponse.json();
    assert.equal(restartedHealthPayload.public_origin, publicOrigin);
    assert.equal(restartedHealthPayload.state_backend, 'local-filesystem');
    assert.equal(restartedHealthPayload.deployment_scope, 'single-host');
    assert.equal(restartedHealthPayload.same_host_restart_persists, true);

    await assertHostedShareLinkForExistingRequest(
      restartedPayload.origin,
      restartedPayload.publicOrigin,
      requestId
    );

    const inspected = runInstalledCliJson(projectRoot, homeDir, [
      'relay',
      'inspect',
      '--relay-url',
      restartedPayload.origin
    ]);
    assertNoWorkspaceLeak(inspected);
    const inspectedPayload = JSON.parse(inspected);
    assert.equal(inspectedPayload.ok, true);
    assert.equal(inspectedPayload.compatible, true);
    assert.equal(inspectedPayload.publicOrigin, publicOrigin);
    assert.equal(inspectedPayload.relayUrlMatchesOrigin, true);
    assert.equal(inspectedPayload.relayUrlMatchesPublicOrigin, false);
    assert.equal(inspectedPayload.publicOriginLooksLocal, false);
    assert.equal(inspectedPayload.stateBackend, 'local-filesystem');
    assert.equal(inspectedPayload.deploymentScope, 'single-host');
    assert.equal(inspectedPayload.sameHostRestartPersists, true);
    assert.deepEqual(inspectedPayload.approvalEndpointSummary, {
      status: 'hosted-public-origin-via-proxy',
      publicOriginConfigured: true,
      publicOriginLooksLocal: false,
      relayUrlMatchesPublicOrigin: false,
      shareLinkBaseUrl: `${publicOrigin}/r`,
      statusApiBaseUrl: `${publicOrigin}/api/requests`
    });
    assert.equal(inspectedPayload.hostedReadinessSummary?.singleHostFileState, true);
    assert.equal(inspectedPayload.deploymentSummary?.origin, payload.origin);
    assert.equal(inspectedPayload.deploymentSummary?.publicOrigin, publicOrigin);
    assert.equal(inspectedPayload.deploymentSummary?.shareLinkBaseUrl, `${publicOrigin}/r`);
    assert.equal(
      inspectedPayload.deploymentSummary?.statusApiBaseUrl,
      `${publicOrigin}/api/requests`
    );
    assert.equal(inspectedPayload.deploymentSummary?.singleHostFileState, true);
    assert.equal(
      inspectedPayload.notes?.some((note) =>
        String(note).includes('Share links and wallet approval commands will use the public origin')
      ),
      true
    );

    await stopChild(child, 10000);
    assert.equal(
      child.exitCode,
      0,
      secondRelay.readStderr() || `relay exited with code ${child.exitCode}`
    );
    child = null;
  } finally {
    await stopChild(child, 10000);
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

    const walletCreateHelpResult = runInstalledCli(projectRoot, homeDir, [
      'wallet',
      'create',
      '--help'
    ]);
    assertPackedCliStderr(
      walletCreateHelpResult.stderr,
      walletCreateHelpResult.stdout,
      'installed zk-agent wallet create --help'
    );
    assert.match(walletCreateHelpResult.stdout, /Usage: zk-agent wallet create/);
    assertNoWorkspaceLeak(walletCreateHelpResult.stdout);
    assertWalletCreateHelpContract(walletCreateHelpResult.stdout);

    const walletReapproveHelpResult = runInstalledCli(projectRoot, homeDir, [
      'wallet',
      'reapprove',
      '--help'
    ]);
    assertPackedCliStderr(
      walletReapproveHelpResult.stderr,
      walletReapproveHelpResult.stdout,
      'installed zk-agent wallet reapprove --help'
    );
    assert.match(walletReapproveHelpResult.stdout, /Usage: zk-agent wallet reapprove/);
    assertNoWorkspaceLeak(walletReapproveHelpResult.stdout);
    assertWalletReapproveHelpContract(walletReapproveHelpResult.stdout);

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
  const changelog = readChangelog();
  const pluginManifest = readPluginManifest();
  const plans = readPlans();
  const projectState = readProjectState();
  const releaseGateDoc = readReleaseGateDoc();
  const operatorJsonContractDoc = readOperatorJsonContractDoc();
  const hostedBaselineDoc = readHostedApprovalBaselineDoc();
  const releaseNotes = readReleaseNotes(pkg.version);
  const quickstart = readSkillQuickstart();
  const skillGuide = readSkillGuide();
  assertVersionAlignment(workspacePkg, pkg);
  assertReleaseMetadata(pkg);
  assertPluginManifest(pluginManifest, pkg);
  assertPackageReadme(readme);
  assertRepositoryDocs(rootReadme, quickstart, skillGuide);
  assertReleaseStageDocs({
    packageReadme: readme,
    rootReadme,
    plans,
    projectState,
    releaseGateDoc,
    hostedBaselineDoc
  });
  assertReleaseArtifact(changelog, releaseNotes);
  assertOperatorJsonContract(operatorJsonContractDoc);
  assertCurrentVersionDocs({
    version: pkg.version,
    rootReadme,
    changelog,
    releaseNotes,
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
