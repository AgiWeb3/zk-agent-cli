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
const releaseCheckStartMs = Date.now();
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

function assertOrderedIncludes(text, snippets, message) {
  const normalizedText = normalizeWhitespace(text);
  let cursor = 0;

  for (const snippet of snippets) {
    const normalizedSnippet = normalizeWhitespace(snippet);
    const index = normalizedText.indexOf(normalizedSnippet, cursor);
    assert.notEqual(index, -1, `${message} Missing snippet: ${snippet}`);
    cursor = index + normalizedSnippet.length;
  }
}

function assertOrderedSection(text, heading, snippets, message) {
  const start = text.indexOf(heading);
  assert.notEqual(start, -1, `${message} Missing heading: ${heading}`);
  assertOrderedIncludes(text.slice(start), [heading, ...snippets], message);
}

function logReleaseCheckStep(message) {
  const elapsedSeconds = ((Date.now() - releaseCheckStartMs) / 1000).toFixed(1);
  process.stdout.write(`[release-check +${elapsedSeconds}s] ${message}\n`);
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
      /`zk-agent start` is the public onboarding command that keeps the same output[\s\S]*contract as `zk-agent next`\./,
      'Package README must explain the public start command.'
    ],
    [
      /zk-agent setup[\s\S]*zk-agent next[\s\S]*zk-agent wallet create --await-local[\s\S]*zk-agent next[\s\S]*zk-agent pay --wallet main --to <address> --amount <amount>/,
      'Package README must document the shortest success path.'
    ],
    [
      /zk-agent relay baseline --relay-url <relay-url>[\s\S]*zk-agent wallet create --relay-url <relay-url> --wait-relay --prompt-code[\s\S]*zk-agent next/,
      'Package README must document the remote-browser wallet-create fallback on the shortest path.'
    ],
    [
      /If readiness is unclear before you choose a fix, use:[\s\S]*zk-agent doctor/,
      'Package README must document the local-only doctor entrypoint.'
    ],
    [
      /When `doctor` shows local readiness is clear and you want the broader[\s\S]*question-first packaged surface[\s\S]*zk-agent suite/,
      'Package README must document the doctor-to-suite handoff once local readiness is clear.'
    ],
    [
      /Inside `suite`, the smallest question-first entry layer is:[\s\S]*send now[\s\S]*track payments[\s\S]*inspect before token action[\s\S]*unstick write[\s\S]*recover remote approval/,
      'Package README must expose the smallest question-first suite entry layer.'
    ],
    [
      /The packaged default story is payment-first:[\s\S]*send native[\s\S]*value now[\s\S]*approval-based pay[\s\S]*recover[\s\S]*funding only when the workflow says the write path is[\s\S]*blocked\./,
      'Package README must keep the short payment-first product story visible.'
    ],
    [
      /## What Makes It Different[\s\S]*local-first by default[\s\S]*fallback path[\s\S]*zkSync-native[\s\S]*paymaster-aware[\s\S]*Agent Pay[\s\S]*same wallet runtime[\s\S]*separate product/,
      'Package README must keep the short product differentiation visible.'
    ],
    [
      /The three public proof paths today are:[\s\S]*flagship pay:[\s\S]*default ready-wallet zkSync-native send path[\s\S]*Agent Pay:[\s\S]*local request capture plus follow-up surfaces[\s\S]*hosted approval recovery:[\s\S]*remote-browser session recovery[\s\S]*single-host relay baseline/,
      'Package README must keep the three public proof paths visible.'
    ],
    [
      /Choose between the two Agent Pay-facing surfaces this way:/,
      'Package README must explain when to stay on payment versus suite.'
    ],
    [
      /The fastest flagship proof path after wallet readiness is:[\s\S]*zk-agent pay --wallet main --to <address> --amount <amount>[\s\S]*zk-agent workflow next --request-id <id>[\s\S]*zk-agent workflow status --request-id <id>/,
      'Package README must keep the flagship proof path visible.'
    ],
    [
      /If request capture is no longer enough and you need one current cross-request[\s\S]*zk-agent workspace[\s\S]*public shortcut to the Agent Pay workbench anchor above[\s\S]*dashboard, queue, report,[\s\S]*and feed\.[\s\S]*`zk-agent payment workspace`/,
      'Package README must keep the Agent Pay workbench anchor visible.'
    ],
    [
      /When the browser is remote, the fastest hosted approval proof path on the[\s\S]*zk-agent relay baseline --relay-url <relay-url>[\s\S]*zk-agent wallet reapprove --name main --relay-url <relay-url> --wait-relay --prompt-code[\s\S]*zk-agent wallet status --name main/,
      'Package README must keep the hosted approval proof path visible.'
    ],
    [
      /If the wallet does not exist yet, swap `wallet reapprove` for:[\s\S]*zk-agent wallet create --relay-url <relay-url> --wait-relay --prompt-code[\s\S]*zk-agent next/,
      'Package README must keep the hosted wallet-create fallback visible.'
    ],
    [
      /The shortest way to think about Agent Pay is:[\s\S]*`submit`:[\s\S]*capture one payment request[\s\S]*`workspace`:[\s\S]*review the cross-request operator surface[\s\S]*`handoff`:[\s\S]*export one stable integration bundle[\s\S]*`feed`:[\s\S]*export the stable cross-request batch view/,
      'Package README must keep the short Agent Pay public shell visible.'
    ],
    [
      /Why Agent Pay instead of only direct execution:[\s\S]*capture one request before or after the write path[\s\S]*keep a cross-request operator workspace around the same wallet runtime[\s\S]*export stable handoff and feed views for external agents, dashboards, or backends/,
      'Package README must keep the short Agent Pay value proposition visible.'
    ],
    [
      /The current local-first Agent Pay entry surface is:[\s\S]*zk-agent submit --wallet main --to <address> --amount <amount>[\s\S]*zk-agent workspace[\s\S]*zk-agent payment dashboard[\s\S]*zk-agent payment feed[\s\S]*zk-agent payment queue[\s\S]*zk-agent payment report[\s\S]*zk-agent payment approval --request-id <id>[\s\S]*The scoped equivalents remain `zk-agent payment submit` and[\s\S]*`zk-agent payment workspace`\./,
      'Package README must keep the current local-first Agent Pay entry surface visible.'
    ],
    [
      /Inside `suite`, the shortest way to think about Agent Pay is:[\s\S]*`submit`:[\s\S]*capture one payment request[\s\S]*`workspace`:[\s\S]*review the cross-request operator surface[\s\S]*`handoff`:[\s\S]*export one stable single-request bundle[\s\S]*`feed`:[\s\S]*export the stable cross-request batch view[\s\S]*The shortest tracked route inside `suite` remains:[\s\S]*`submit -> next -> approval -> workspace -> handoff -> feed`\./,
      'Package README must keep the short Agent Pay suite shell visible.'
    ],
    [
      /zk-agent suite[\s\S]*(post-flagship|packaged surface)/,
      'Package README must keep the operator-suite surface visible.'
    ],
    [
      /## Start here by question[\s\S]*zk-agent start[\s\S]*zk-agent next[\s\S]*zk-agent doctor[\s\S]*zk-agent wallet status --name <wallet>[\s\S]*zk-agent pay \.\.\.[\s\S]*zk-agent workflow \.\.\.[\s\S]*zk-agent payment \.\.\.[\s\S]*zk-agent workspace[\s\S]*zk-agent suite[\s\S]*zk-agent relay baseline --relay-url <relay-url>/,
      'Package README must route operators to the correct top-level surface.'
    ],
    [
      /## (Direct Discovery and Bypass Commands|Direct Paths|Leave the default path only on purpose)[\s\S]*zk-agent assets --wallet main[\s\S]*zk-agent tokens --wallet main --owned[\s\S]*zk-agent defaults[\s\S]*zk-agent resolve-token --chain zksync-sepolia --symbol <symbol>/,
      'Package README must document the discovery/defaults path and its command order.'
    ],
    [
      /zk-agent send-token --wallet main --symbol USDC[\s\S]*zk-agent workflow --help[\s\S]*zk-agent wallet --help[\s\S]*zk-agent relay --help/,
      'Package README must document the lower-level escape hatches once the packaged path is no longer the right fit.'
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
      /zk-agent relay baseline --relay-url <relay-url>[\s\S]*zk-agent wallet create --relay-url <relay-url> --wait-relay --prompt-code[\s\S]*zk-agent wallet reapprove --name main --relay-url <relay-url> --wait-relay --prompt-code/,
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
      /`zk-agent start` is the public onboarding command that keeps the same output[\s\S]*contract as `zk-agent next`\./,
      'Root README must explain the public start command.'
    ],
    [
      rootReadme,
      /## Fastest Path[\s\S]*zk-agent setup[\s\S]*zk-agent next[\s\S]*zk-agent wallet create --await-local[\s\S]*zk-agent next[\s\S]*zk-agent pay --wallet main --to <address> --amount <amount>/,
      'Root README must keep the canonical terminal path visible.'
    ],
    [
      rootReadme,
      /If readiness is still unclear, use `zk-agent doctor` first\.[\s\S]*broader question-first packaged[\s\S]*move to `zk-agent suite`\./,
      'Root README must keep the doctor-to-suite product routing visible.'
    ],
    [
      rootReadme,
      /The smallest question-first `suite` entry layer is:[\s\S]*send now[\s\S]*track payments[\s\S]*inspect before token action[\s\S]*unstick write[\s\S]*recover remote approval/,
      'Root README must expose the smallest question-first suite entry layer.'
    ],
    [
      rootReadme,
      /The public default story is payment-first:[\s\S]*get a ready wallet[\s\S]*send native[\s\S]*value now[\s\S]*approval-based pay path[\s\S]*recover[\s\S]*funding only when the workflow says the write path is[\s\S]*blocked\./,
      'Root README must keep the short payment-first public story visible.'
    ],
    [
      rootReadme,
      /## What Makes It Different[\s\S]*local-first by default[\s\S]*fallback path[\s\S]*zkSync-native[\s\S]*paymaster-aware[\s\S]*Agent Pay[\s\S]*same wallet runtime[\s\S]*separate product/,
      'Root README must keep the short product differentiation visible.'
    ],
    [
      rootReadme,
      /The three public proof paths today are:[\s\S]*flagship pay:[\s\S]*default ready-wallet zkSync-native send path[\s\S]*Agent Pay:[\s\S]*local request capture plus follow-up surfaces[\s\S]*hosted approval recovery:[\s\S]*remote-browser session recovery[\s\S]*single-host relay baseline/,
      'Root README must keep the three public proof paths visible.'
    ],
    [
      rootReadme,
      /The fastest flagship proof path after wallet readiness is:[\s\S]*zk-agent pay --wallet main --to <address> --amount <amount>[\s\S]*zk-agent workflow next --request-id <id>[\s\S]*zk-agent workflow status --request-id <id>/,
      'Root README must keep the flagship proof path visible.'
    ],
    [
      rootReadme,
      /The fastest Agent Pay proof path is:[\s\S]*zk-agent submit --wallet main --to <address> --amount <amount>[\s\S]*zk-agent payment next --request-id <id>[\s\S]*zk-agent payment approval --request-id <id>[\s\S]*zk-agent workspace[\s\S]*zk-agent payment handoff --request-id <id>[\s\S]*zk-agent payment feed/,
      'Root README must keep the Agent Pay proof path visible.'
    ],
    [
      rootReadme,
      /If request capture is no longer enough and you need one current cross-request[\s\S]*zk-agent workspace[\s\S]*public shortcut to the Agent Pay workbench anchor above[\s\S]*dashboard, queue, report,[\s\S]*and feed\.[\s\S]*`zk-agent payment workspace`/,
      'Root README must keep the Agent Pay workbench anchor visible.'
    ],
    [
      rootReadme,
      /When the browser is remote, the fastest hosted approval proof path on the[\s\S]*zk-agent relay baseline --relay-url <relay-url>[\s\S]*zk-agent wallet reapprove --name main --relay-url <relay-url> --wait-relay --prompt-code[\s\S]*zk-agent wallet status --name main/,
      'Root README must keep the hosted approval proof path visible.'
    ],
    [
      rootReadme,
      /If the wallet does not exist yet, swap `wallet reapprove` for:[\s\S]*zk-agent wallet create --relay-url <relay-url> --wait-relay --prompt-code[\s\S]*zk-agent next/,
      'Root README must keep the hosted wallet-create fallback visible.'
    ],
    [
      rootReadme,
      /Current public stage: `[^`]+`\./,
      'Root README must keep the current public-stage product baseline visible.'
    ],
    [
      rootReadme,
      /Focused product slices live under \[skills\/\]\(\.\/skills\/\):[\s\S]*`zk-aa`[\s\S]*`zk-agent-pay`[\s\S]*`zk-discovery`[\s\S]*`zk-funding`[\s\S]*`zk-paymaster`[\s\S]*`zk-relay`[\s\S]*`zk-defi`/,
      'Root README must keep the split product-skill surface visible, including the Agent Pay, discovery, funding, and paymaster slices.'
    ],
    [
      rootReadme,
      /(full|packaged) CLI manual:[\s\S]*packages\/zk-agent-cli\/README\.md/,
      'Root README must hand off the detailed CLI path to the package README.'
    ],
    [
      rootReadme,
      /## Read Next[\s\S]*packages\/zk-agent-cli\/README\.md[\s\S]*skills\/QUICKSTART\.md[\s\S]*docs\/16-hosted-approval-operated-baseline\.md[\s\S]*docs\/README\.md/,
      'Root README must keep the focused reference handoff visible.'
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
      /public first-touch command: `zk-agent start`[\s\S]*`zk-agent start` is the public onboarding command that keeps the same output[\s\S]*contract as `zk-agent next`\./,
      'Quickstart must explain the public start command.'
    ],
    [
      quickstart,
      /zk-agent setup[\s\S]*zk-agent next[\s\S]*zk-agent wallet create --await-local[\s\S]*zk-agent next[\s\S]*zk-agent pay --wallet main --to <address> --amount <amount>/,
      'Quickstart must keep the canonical terminal path visible.'
    ],
    [
      quickstart,
      /If readiness is unclear before you choose a fix, use:[\s\S]*zk-agent doctor/,
      'Quickstart must keep the local-only doctor diagnostic visible.'
    ],
    [
      quickstart,
      /When `doctor` says local readiness is clear and you want the broader[\s\S]*question-first packaged surface[\s\S]*zk-agent suite/,
      'Quickstart must keep the doctor-to-suite handoff visible.'
    ],
    [
      quickstart,
      /Its smallest question-first entry layer is:[\s\S]*send now[\s\S]*track payments[\s\S]*inspect before token action[\s\S]*unstick write[\s\S]*recover remote approval/,
      'Quickstart must expose the smallest question-first suite entry layer.'
    ],
    [
      quickstart,
      /## 5\. Use `suite` as the default post-flagship surface[\s\S]*zk-agent suite[\s\S]*zk-agent assets --wallet main[\s\S]*zk-agent defaults[\s\S]*zk-agent resolve-token --chain zksync-sepolia --symbol USDC[\s\S]*zk-agent tokens --chain zksync-sepolia --role paymaster-fee-token/,
      'Quickstart must keep the discovery/defaults contract visible.'
    ],
    [
      quickstart,
      /If request capture is no longer enough and you need one current cross-request[\s\S]*zk-agent workspace[\s\S]*current public shortcut to the Agent Pay workbench anchor above[\s\S]*`dashboard`, `queue`, `report`, and `feed`\.[\s\S]*`zk-agent payment workspace`/,
      'Quickstart must keep the Agent Pay workbench anchor visible.'
    ],
    [
      quickstart,
      /\[zk-agent-pay\/SKILL\.md\]\(\.\/zk-agent-pay\/SKILL\.md\)/,
      'Quickstart must keep the focused Agent Pay skill visible.'
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
      'Quickstart must keep the suite handoff visible.'
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
      /Public first-touch command:[\s\S]*zk-agent start[\s\S]*`start` is the public onboarding command that keeps the same output contract[\s\S]*as `zk-agent next`\./,
      'Primary skill guide must explain the public start command.'
    ],
    [
      skillGuide,
      /zk-agent setup[\s\S]*zk-agent next[\s\S]*zk-agent wallet create --await-local[\s\S]*zk-agent next[\s\S]*zk-agent pay --wallet main --to <address> --amount <amount>/,
      'Primary skill guide must keep the canonical default path visible.'
    ],
    [
      skillGuide,
      /Use `zk-agent doctor` before choosing a remediation path when readiness is[\s\S]*unclear\./,
      'Primary skill guide must keep the doctor diagnostic visible.'
    ],
    [
      skillGuide,
      /When `doctor` shows local readiness is clear and you want the broader[\s\S]*question-first packaged surface[\s\S]*zk-agent suite/,
      'Primary skill guide must keep the doctor-to-suite handoff visible.'
    ],
    [
      skillGuide,
      /Inside `suite`, the smallest question-first entry layer is:[\s\S]*send now[\s\S]*track payments[\s\S]*inspect before token action[\s\S]*unstick write[\s\S]*recover remote approval/,
      'Primary skill guide must expose the smallest question-first suite entry layer.'
    ],
    [
      skillGuide,
      /If request capture is no longer enough and you need one current cross-request[\s\S]*zk-agent workspace[\s\S]*current public shortcut to the Agent Pay workbench anchor above[\s\S]*`dashboard`, `queue`, `report`, and `feed`\.[\s\S]*`zk-agent payment workspace`/,
      'Primary skill guide must keep the Agent Pay workbench anchor visible.'
    ],
    [
      skillGuide,
      /\[zk-aa\/SKILL\.md\]\(\.\/zk-aa\/SKILL\.md\)[\s\S]*\[zk-agent-pay\/SKILL\.md\]\(\.\/zk-agent-pay\/SKILL\.md\)[\s\S]*\[zk-discovery\/SKILL\.md\]\(\.\/zk-discovery\/SKILL\.md\)[\s\S]*\[zk-funding\/SKILL\.md\]\(\.\/zk-funding\/SKILL\.md\)[\s\S]*\[zk-paymaster\/SKILL\.md\]\(\.\/zk-paymaster\/SKILL\.md\)[\s\S]*\[zk-relay\/SKILL\.md\]\(\.\/zk-relay\/SKILL\.md\)[\s\S]*\[zk-defi\/SKILL\.md\]\(\.\/zk-defi\/SKILL\.md\)/,
      'Primary skill guide must keep the split sub-skill surface visible, including the Agent Pay, funding, and paymaster guides.'
    ],
    [
      skillGuide,
      /## Readiness, suite, funding, and payment[\s\S]*zk-agent workflow fund --wallet main[\s\S]*zk-agent workflow fund --wallet main --amount <amount> --execute/,
      'Primary skill guide must keep the funding-readiness contract visible inside the broader payment-aware routing section.'
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
      /Compact product rule:[\s\S]*existing wallet on a remote browser path:[\s\S]*`relay baseline -> wallet reapprove -> wallet status`[\s\S]*no saved wallet yet on a remote browser path:[\s\S]*`relay baseline -> wallet create -> zk-agent next`/,
      'Hosted baseline doc must keep the compact product rule visible.'
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
      /## Request Lifecycle[\s\S]*create or reapprove emits a relay-backed request[\s\S]*relay status is `pending`[\s\S]*browser approver opens the share URL[\s\S]*terminal finalizes via:[\s\S]*zk-agent wallet request approve --request-id <id> --relay-url <url> --code <code> --wait[\s\S]*If relay status becomes `expired`:[\s\S]*treat that as a reissue state, not a polling state[\s\S]*inspect the relay again if deployment readiness is in doubt[\s\S]*reissue `wallet create --relay-url \.\.\.` or[\s\S]*`wallet reapprove --relay-url \.\.\.`[\s\S]*generated recovery command now preserves any CLI-expressible[\s\S]*session-policy flags from the expired request/,
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
      /## Landed baseline[\s\S]*`workspace`[\s\S]*public shortcut[\s\S]*Agent Pay[\s\S]*workbench anchor[\s\S]*`payment workspace`[\s\S]*scoped subcommand[\s\S]*`suite`[\s\S]*broader post-flagship shell/,
      'PLANS.md must keep the suite-versus-workbench split explicit.'
    ],
    [
      plans,
      /## Release gates[\s\S]*### Ready for the next RC refresh[\s\S]*validate:release[\s\S]*validate:rc[\s\S]*### Ready for `1\.0\.0`/,
      'PLANS.md must keep the release-stage gates explicit.'
    ],
    [
      projectState,
      /## Current public baseline[\s\S]*`workspace`[\s\S]*public shortcut[\s\S]*Agent Pay[\s\S]*workbench anchor[\s\S]*`payment workspace`[\s\S]*scoped subcommand[\s\S]*`suite`[\s\S]*broader post-flagship shell/,
      'PROJECT_STATE.md must keep the suite-versus-workbench split explicit.'
    ],
    [
      projectState,
      /## Snapshot[\s\S]*package stage: `[^`]+`[\s\S]*current focus: RC closeout, benchmark-gap assessment versus[\s\S]*Agent Pay platform planning/,
      'PROJECT_STATE.md must keep the release-stage assessment explicit.'
    ],
    [
      projectState,
      /## Current priorities[\s\S]*hosted approval operated baseline[\s\S]*post-flagship product surface centered on `suite`[\s\S]*polygon-agent-cli[\s\S]*Agent Pay[\s\S]*release validation and dist-tag behavior/,
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
    'Local-first zkSync-native CLI for wallet approval, flagship pay execution, Agent Pay request routing, and single-host hosted relay recovery',
    'Public entrypoints:',
    'Public first touch: zk-agent start',
    'Agent harness: npx skills add https://github.com/AgiWeb3/zk-agent-cli',
    'One-shot CLI: npx zk-agent-cli --help',
    'Global CLI: npm install -g zk-agent-cli',
    'What makes zk-agent-cli different: local-first by default, with hosted approval only as a fallback path one zkSync-native path from wallet readiness to paymaster-aware execution one Agent Pay layer that stays attached to the same wallet runtime instead of splitting into a separate product',
    'Why Agent Pay instead of only direct execution: capture one request before or after the write path keep a cross-request operator workspace around the same wallet runtime export stable handoff and feed views for external agents, dashboards, or backends current request ingress: zk-agent submit current workbench anchor: zk-agent workspace',
    'Start here first: zk-agent setup zk-agent next zk-agent wallet create --await-local zk-agent next zk-agent pay --wallet main --to <address> --amount <amount> Stop after the first successful workflow pay.',
    'Start here by question: start -> public first touch with the same output contract as next next -> the CLI still needs to choose bootstrap, recovery, or workflow continuation pay -> the wallet is ready and you want the flagship proof path now submit -> you want to capture one Agent Pay request now suite -> wallet readiness is clear and the question is broader than one immediate send workspace -> you already know you need the current Agent Pay workbench anchor payment -> execution is no longer the whole story and you need the Agent Pay request layer or workbench relay baseline -> the browser is remote and approval must move to the hosted fallback path',
    'Three public proof paths: flagship pay: zk-agent pay --wallet main --to <address> --amount <amount> zk-agent workflow next --request-id <id> zk-agent workflow status --request-id <id> Agent Pay requests: zk-agent submit --wallet main --to <address> --amount <amount> zk-agent payment next --request-id <id> zk-agent payment approval --request-id <id> zk-agent workspace zk-agent payment handoff --request-id <id> zk-agent payment feed hosted approval recovery: zk-agent relay baseline --relay-url <url> zk-agent wallet reapprove --name main --relay-url <url> --wait-relay --prompt-code zk-agent wallet status --name main',
    'Open these only when the default path is no longer the whole question: zk-agent suite zk-agent submit --wallet main --to <address> --amount <amount> zk-agent workspace zk-agent suite --include-onboarding zk-agent doctor zk-agent next --request-id <id> zk-agent wallet --help zk-agent workflow --help zk-agent relay baseline --relay-url <url> zk-agent wallet create|reapprove --relay-url <url> --wait-relay --prompt-code',
    'Validated first-run baseline: setup defaults to zksync-sepolia and the local connector at http://localhost:4444',
    'No custom .env is required for setup, next, or wallet create/reapprove request generation.',
    'Add RPC env vars later, before live reads or broadcasts.',
    'Use remote approval only when the browser is on another machine or cannot return to this terminal.'
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
    'Use `setup` once at the beginning:',
    'It writes the local default chain and connector URL for the default first-run path.',
    'Validated first-run baseline: Default chain: zksync-sepolia Connector URL: http://localhost:4444 Override --default-chain or --connector-url only when you intentionally deviate from that path.',
    'Then stay on the default local-first path: zk-agent next zk-agent wallet create --await-local zk-agent next zk-agent pay --wallet main --to <address> --amount <amount> Stop after the first successful workflow pay.',
    'Use the remote-browser variant only when the browser cannot return to this terminal: zk-agent relay baseline --relay-url <url> zk-agent wallet create --relay-url <url> --wait-relay --prompt-code zk-agent next',
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
    'Use `start` for public first touch. Keep `next` as the live routing contract.',
    'Default first-run path: zk-agent setup zk-agent next zk-agent wallet create --await-local zk-agent next zk-agent pay --wallet main --to <address> --amount <amount> Stop after the first successful workflow pay.',
    'Before that first success: Ignore suite, payment, and relay unless the CLI points you there or the browser is remote.',
    'If the product question is already obvious, start here instead: start -> first-touch onboarding with the same output contract as next pay -> wallet readiness is already clear and you want the flagship proof path now submit -> execution is no longer the whole story and you want one Agent Pay request now suite -> wallet readiness is clear and the question is broader than one immediate send workspace -> you already know you need the current Agent Pay workbench anchor payment -> execution is no longer the whole story and you need the Agent Pay request layer or workbench relay baseline -> the browser is remote and approval must move to the hosted fallback path',
    'What `next` routes right now: bootstrap: config or wallet bootstrap is still the blocker recover: wallet approval or local signer readiness still needs repair operate: wallet readiness is clear, so the flagship workflow path is next workflow: a stored checkpoint is already the active question suite: switch only when the question becomes broader than one immediate next step',
    'Remote-browser variant of the same path: zk-agent relay baseline --relay-url <url> zk-agent wallet create --relay-url <url> --wait-relay --prompt-code zk-agent next',
    'When to leave the default path: doctor: local state is unclear and the normal path stopped making sense wallet next/status: the blocker is already wallet-specific workflow next: the active question is already one stored checkpoint workspace: you already know the question is the current cross-request Agent Pay workbench suite: the wallet is ready and the question is broader than one immediate pay step',
    'If setup has not run yet, `next` sends you back to `zk-agent setup` first.',
    'Continue a stored workflow checkpoint: zk-agent next --request-id <id>',
    'Wallet-specific follow-up: zk-agent wallet next --name main zk-agent wallet status --name main',
    'Workflow-specific follow-up: zk-agent workflow next --request-id <id>',
    'Broader post-flagship surface: zk-agent suite zk-agent workspace',
    'Hosted remote-approval fallback: zk-agent relay baseline --relay-url <url> zk-agent wallet create|reapprove --relay-url <url> --wait-relay --prompt-code'
  ];

  for (const snippet of requiredSnippets) {
    assert.equal(
      help.includes(snippet),
      true,
      `Next help is missing required onboarding contract text: ${snippet}`
    );
  }
}

function assertStartHelpContract(helpOutput) {
  const help = normalizeWhitespace(helpOutput);
  const requiredSnippets = [
    '`start` is the shortest public first-touch command.',
    'Use it when you want one obvious entrypoint but still want the same output contract and runtime behavior as `zk-agent next`.',
    'Shortest first proof: zk-agent setup zk-agent next zk-agent wallet create --await-local zk-agent next zk-agent pay --wallet main --to <address> --amount <amount> Stop after the first successful workflow pay.',
    'What not to learn first: Ignore suite, payment, and relay until that baseline path works once, unless the CLI points you there or the browser is remote.',
    'If the product question is already obvious, skip `start` and go directly to: pay -> wallet readiness is already clear and you want the flagship proof path now submit -> execution is no longer the whole story and you want one Agent Pay request now suite -> wallet readiness is clear and the question is broader than one immediate send workspace -> you already know you need the current Agent Pay workbench anchor relay baseline -> the browser is remote and approval must move to the hosted fallback path',
    'When not to use `start`: next -> you still want the live routing contract in scripts or operator loops doctor -> local state is unclear and you need diagnosis before choosing a fix wallet next/status -> the blocker is already clearly wallet-specific workflow next -> a stored checkpoint is already the active question',
    'Remote-browser fallback for the same first proof: zk-agent relay baseline --relay-url <url> zk-agent wallet create --relay-url <url> --wait-relay --prompt-code zk-agent next',
    'Use `start` first, then let the CLI narrow the question. Keep `next` as the canonical operator/runtime contract in JSON examples and automation.'
  ];

  for (const snippet of requiredSnippets) {
    assert.equal(
      help.includes(snippet),
      true,
      `Start help is missing required public-entry contract text: ${snippet}`
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
    'Start with `zk-agent next` when you are just beginning.',
    'Use `doctor` only when the normal path stops making sense or local state is unclear.',
    'Start here by question: next -> you are just beginning and still want live routing on the default path doctor -> local state is unclear and you need diagnosis before choosing a fix wallet -> the blocker is already clearly approval, signer, or session recovery suite -> diagnosis says readiness is clear and the question is broader than recovery',
    'What `doctor` answers right now: bootstrap: local config or wallet bootstrap is still missing recover: local approval or signer state still needs repair operate: local readiness is clear, so return to `zk-agent next` for the live path suite: once readiness is clear, the broader packaged post-flagship surface is available too',
    'Default behavior: Inspects saved config, local wallet approval metadata, local signer state, and the shortest next command without requiring live RPC reads.',
    'It is a local-only diagnosis surface, not the normal first-run happy path.',
    'Run this before guessing whether the blocker is setup, wallet approval, or local signer state.',
    'When doctor shows local readiness is clear and you want the broader question-first packaged surface: zk-agent suite',
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
    'Wallet surface:',
    'Use this layer when the blocker is specifically wallet approval, signer state, or session recovery. If the CLI still needs to decide whether the problem is setup, wallet readiness, or workflow continuation, start with `zk-agent next` or `zk-agent doctor`.',
    'Start here by question: create -> first local-first bootstrap when no wallet session exists yet reapprove -> the wallet exists but approval/session access must be refreshed signer attach -> approval still exists but local write readiness is missing status / next -> the blocker is clearly wallet-scoped but the exact repair step is still unclear suite -> wallet readiness is already clear and the question is broader than wallet recovery',
    'First local-first bootstrap: zk-agent wallet create --await-local zk-agent next',
    'Repair an existing wallet session: zk-agent wallet reapprove --name main --await-local zk-agent next',
    'Repair signer-only local execution state: zk-agent wallet signer attach --name main --private-key <hex> zk-agent next',
    'Hosted remote approval only when the browser is remote: zk-agent relay inspect --relay-url <url> zk-agent wallet create --relay-url <url> --wait-relay --prompt-code zk-agent wallet reapprove --name main --relay-url <url> --wait-relay --prompt-code zk-agent next Use this only when the browser is not colocated with the terminal.'
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
    'Workflow surface:',
    'Use this layer when the question is already an explicit workflow, checkpoint, or execution state. If the CLI still needs to choose across setup, wallet readiness, or recovery, go back to `zk-agent next` or `zk-agent doctor`.',
    'Public shortcut for the flagship send path: `zk-agent pay`.',
    'Start here by question: workflow pay -> wallet readiness is already clear and you want the flagship proof path now workflow auto -> the goal is broader than one send and you want guided multi-intent execution workflow status -> a stored checkpoint already exists and you want current state first workflow next -> a stored checkpoint exists and you want the shortest next step suite -> the question is broader than one explicit workflow and needs the packaged catalog',
    'Fastest flagship pay path: zk-agent workflow pay --wallet main --to <address> --amount <amount>',
    'Multi-intent guided path: zk-agent workflow auto --wallet main --intent <intent> [goal flags] --create-checkpoint --execute-when-ready',
    'Checkpoint lifecycle when you want explicit control: zk-agent workflow start --wallet main --intent <intent> [goal flags] zk-agent workflow status --request-id <id> zk-agent workflow next --request-id <id> zk-agent workflow resume --request-id <id> [--broadcast]',
    'Funding-only recovery when execution is blocked on gas: zk-agent workflow fund --wallet main --amount <amount> --execute',
    'Discovery / token recovery before the workflow can continue: zk-agent assets --wallet main zk-agent tokens --wallet main --owned zk-agent tokens --chain zksync-sepolia zk-agent resolve-token --chain zksync-sepolia --symbol USDC',
    'Approval-based paymaster fee-token recovery: zk-agent tokens --chain zksync-sepolia --role paymaster-fee-token zk-agent resolve-token --chain zksync-sepolia --symbol <symbol> --role paymaster-fee-token zk-agent defaults',
    'When the question becomes broader than one explicit workflow: zk-agent suite',
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

function assertPaymentHelpContract(helpOutput) {
  const help = normalizeWhitespace(helpOutput);
  const requiredSnippets = [
    'Agent Pay public shell: `submit`: capture one request through the compact local-first ingress surface. `workspace`: review the cross-request operator view. `handoff`: export one stable single-request integration bundle. `feed`: export the stable cross-request batch view. If you only remember one route: submit -> next -> approval -> workspace -> handoff -> feed.',
    'Payment request surface:',
    'Use this layer when execution is not the whole story and you need request capture, follow-up, sharing, reporting, or approval repair around the write path.',
    'Use `pay` when the wallet is ready and the goal is "send value now".',
    'Use `payment` when you need a durable local request and follow-up surface before or after execution.',
    'Use `suite` when wallet readiness is already clear but the question is still broader than one request surface.',
    '`pay` is the public shortcut; `workflow pay` remains the scoped workflow form.',
    '`payment` does not replace the write path; it surrounds `pay`, `workflow pay`, and `send-token` with request state, exports, and repair guidance.',
    '`submit` is the compact ingress write surface; `create` remains the lower-level local record primitive.',
    '`workspace` is the product-style cross-request workspace that packages dashboard, queue, report, and feed into one public surface.',
    '`dashboard` is the cross-request dashboard summary above the local report and queue primitives.',
    '`feed` is the integration-ready cross-request batch feed for external dashboards, agents, or backend ingestion.',
    '`handoff` is the integration-ready single-request bundle for external dashboards, agents, or backend ingestion.',
    '`parties` is the stable request parties model with separate local and share-safe payer views.',
    '`share` is the payee-facing, share-safe request view that hides local wallet linkage and execution preferences.',
    '`pay`, `workflow pay`, and `send-token` still execute the transfer; `payment` stores the request record and status lifecycle around them.',
    'Fastest proof path: zk-agent submit --wallet main --to <address> --amount <amount> zk-agent payment next --request-id <id> zk-agent payment approval --request-id <id> zk-agent workspace zk-agent payment handoff --request-id <id> zk-agent payment feed This proves compact ingress -> wallet-aware follow-up -> approval readiness -> cross-request workspace -> integration-ready export.',
    'Public start here: zk-agent submit --wallet main --to <address> --amount <amount> zk-agent workspace zk-agent payment feed zk-agent payment approval --request-id <id> zk-agent payment next --request-id <id> zk-agent payment handoff --request-id <id>',
    'Operator views when the request layer gets broader: zk-agent payment dashboard zk-agent payment queue zk-agent payment report zk-agent payment sync-approval --request-id <id> zk-agent payment inspect --request-id <id> zk-agent payment parties --request-id <id>',
    'Choose by question: `submit`: I need to capture one payment request now. `next` / `approval`: what is blocking this one request right now? `workspace`: what is the current cross-request operator workspace? `dashboard`: what is the current dashboard summary across requests? `handoff`: what is the stable single-request integration bundle? `feed`: what is the stable cross-request integration feed? `suite`: I still need the packaged catalog across requests, discovery, funding, paymaster, and remote recovery.',
    'Deeper per-request reads and writes: zk-agent payment create --wallet main --to <address> --amount <amount> zk-agent payment show --request-id <id> zk-agent payment intent --request-id <id> zk-agent payment handoff --request-id <id> zk-agent payment parties --request-id <id> zk-agent payment describe --request-id <id> zk-agent payment share --request-id <id> zk-agent payment execution --request-id <id> zk-agent payment quote --request-id <id> zk-agent payment refresh-quote --request-id <id> zk-agent payment settlement --request-id <id> zk-agent payment reconcile --request-id <id> --status <status> zk-agent payment history --request-id <id> zk-agent payment set-status --request-id <id> --status approval_pending zk-agent payment set-status --request-id <id> --status ready --tx-hash <tx-hash> zk-agent payment set-status --request-id <id> --status paid --tx-hash <tx-hash> zk-agent payment set-status --request-id <id> --status failed --note <reason>',
    'ERC-20 request path: zk-agent payment create --wallet main --to <address> --amount <amount> --symbol USDC',
    'Stored request management: zk-agent workspace zk-agent payment dashboard zk-agent payment feed zk-agent payment queue zk-agent payment report zk-agent payment approval --request-id <id> zk-agent payment sync-approval --request-id <id> zk-agent payment list zk-agent payment history --request-id <id> zk-agent payment remove --request-id <id>'
  ];

  for (const snippet of requiredSnippets) {
    assert.equal(
      help.includes(snippet),
      true,
      `Payment help is missing required Agent Pay contract text: ${snippet}`
    );
  }
}

function assertWorkspaceHelpContract(helpOutput) {
  const help = normalizeWhitespace(helpOutput);
  const requiredSnippets = [
    'Public workspace shortcut:',
    'Use this when you already know the current question is the cross-request Agent Pay workbench.',
    'This is the top-level shortcut for `zk-agent payment workspace`.',
    'Stay on `suite` when the question is broader than the Agent Pay workbench.',
    'Stay on `payment next`, `payment approval`, or `payment handoff` when the question is still one request lifecycle.',
    'Common commands: zk-agent workspace zk-agent submit --wallet main --to <address> --amount <amount> zk-agent payment next --request-id <id> zk-agent payment approval --request-id <id> zk-agent payment handoff --request-id <id> zk-agent payment feed'
  ];

  for (const snippet of requiredSnippets) {
    assert.equal(
      help.includes(snippet),
      true,
      `Workspace help is missing required public-shortcut contract text: ${snippet}`
    );
  }
}

function assertSubmitHelpContract(helpOutput) {
  const help = normalizeWhitespace(helpOutput);
  const requiredSnippets = [
    'Public submit shortcut:',
    'Use this when execution is no longer the whole story and you want the shortest Agent Pay ingress path.',
    'This is the top-level shortcut for `zk-agent payment submit`.',
    'Stay on `pay` when the question is simply "send value now".',
    'Stay on `workspace` when the current question is already the cross-request Agent Pay workbench.',
    'Common commands: zk-agent submit --wallet main --to <address> --amount <amount> zk-agent payment next --request-id <id> zk-agent payment approval --request-id <id> zk-agent workspace zk-agent payment handoff --request-id <id> zk-agent payment feed'
  ];

  for (const snippet of requiredSnippets) {
    assert.equal(
      help.includes(snippet),
      true,
      `Submit help is missing required public-shortcut contract text: ${snippet}`
    );
  }
}

function assertPayHelpContract(helpOutput) {
  const help = normalizeWhitespace(helpOutput);
  const requiredSnippets = [
    'Public shortcut for the flagship zkSync-native pay path',
    'Public flagship pay shortcut:',
    'Use this when wallet readiness is already clear and you want the shortest flagship native-send path.',
    'This is the top-level shortcut for `zk-agent workflow pay`.',
    'Follow-up stays on workflow checkpoints: zk-agent workflow next --request-id <id> zk-agent workflow status --request-id <id>',
    'Use `zk-agent workflow --help` when the question is broader than one pay step or you need checkpoint lifecycle control.'
  ];

  for (const snippet of requiredSnippets) {
    assert.equal(
      help.includes(snippet),
      true,
      `Top-level pay help is missing required public-shortcut contract text: ${snippet}`
    );
  }
}

function assertSuiteHelpContract(helpOutput) {
  const help = normalizeWhitespace(helpOutput);
  const requiredSnippets = [
    'Use `suite` after wallet readiness when you want one packaged surface for flagship pay plus the current post-flagship slices, including Agent Pay.',
    'Use `pay` when the route is already clear and you want to execute now.',
    'Stay on `payment` once the packaged question has already narrowed to one request lifecycle or request-centric workspace.',
    'What `suite` answers right now: operate: send native value through the flagship workflow path request: capture, follow up, share, export, and repair Agent Pay requests discover: inspect owned assets and defaults before tokenized actions pay: stay on the approval-based paymaster path with exact fee-token follow-up fund: recover from gas/funding blockers without guessing the route recover: switch to hosted relay approval when the browser is remote',
    'Start here by question inside suite: I want to send native value now: send now I need to capture, track, share, or repair payments: track payments I need assets/defaults/token metadata before acting: inspect before token action The write path is blocked and I need recovery: unstick write The browser is remote and approval must move to relay: recover remote approval',
    'Most common product journeys: send value now: go straight to the flagship pay path capture and track payments: follow submit -> next -> approval -> workspace -> handoff -> feed inspect before acting: open assets/defaults/token inspection first unstick a write: recover paymaster/funding readiness on the workflow path recover remote approval: move approval to the hosted relay path proof path: zk-agent relay baseline --relay-url <url> -> zk-agent wallet reapprove --name main --relay-url <url> --wait-relay --prompt-code -> zk-agent wallet status --name main',
    'Agent Pay public shell inside suite: `submit`: capture one payment request `workspace`: review the cross-request operator surface `handoff`: export one stable single-request bundle `feed`: export the stable cross-request batch view shortest tracked route: submit -> next -> approval -> workspace -> handoff -> feed',
    'If you only need one default starting point inside suite: send value now proof path: zk-agent pay --wallet main --to <address> --amount <amount> -> zk-agent workflow next --request-id <id> -> zk-agent workflow status --request-id <id>',
    'Where `suite` hands you off next: workflow: flagship pay, approval-based pay, and funding recovery payment: request capture, follow-up, sharing, export, and approval repair discovery: assets, defaults, and token inspection relay: hosted approval recovery and relay readiness',
    'For the full first-run to post-flagship map: zk-agent suite --include-onboarding',
    'Recommended order inside the suite: zk-agent pay --wallet main --to <address> --amount <amount> zk-agent submit --wallet main --to <address> --amount <amount> zk-agent payment next --request-id <id> zk-agent payment approval --request-id <id> zk-agent workspace zk-agent payment dashboard zk-agent payment handoff --request-id <id> zk-agent payment feed zk-agent assets --wallet main zk-agent pay --wallet main --to <address> --amount <amount> --paymaster-mode approval-based zk-agent workflow fund --wallet main zk-agent relay baseline --relay-url <url>',
    'Pass `--wallet` or `--chain` to retarget the entire suite contract. Pass `--include-onboarding` when you want setup, doctor, and wallet bootstrap guidance in the same packaged readout.',
    'In JSON mode, `summary.catalogView`, `summary.entryModes`, `summary.startHereJourneyId`, `summary.journeyOrder`, `summary.surfaceOrder`, top-level `recommendedJourney`, top-level `proofPaths[]`, top-level `questions[]`, top-level `journeys[]`, top-level `surfaces[]`, `summary.categoryOrder`, `summary.recommendedOrder`, optional `preflight`, and each entry `category` + `surface` + `surfaceCommand` + `useWhen` field explain which slice to choose and which deeper surface owns it next. `questions[]` is the smallest question-first routing layer above `journeys[]` when a caller wants a compact decision list. `proofPaths[]` is the compact compare surface for the three public proof routes: flagship pay, Agent Pay, and hosted approval recovery. Stable machine command fields remain scoped; optional additive public-read fields may also appear as `publicStartCommand`, `publicProofPath`, `publicFlagship`, `publicPayment`, and `publicWorkspace` when the same payload wants a shorter product-facing command layer without breaking the scoped contract. `proofPath` appears selectively on entries and on the top-level `recommendedJourney` when one bounded public demo route exists. `recommendedCommands.workflowSurface|paymentSurface|discoverySurface|relaySurface` expose the direct deeper-surface entry commands while the optional `recommendedCommands.publicFlagship|publicPayment|publicWorkspace` fields expose the shorter public shell.'
  ];

  for (const snippet of requiredSnippets) {
    assert.equal(
      help.includes(snippet),
      true,
      `Suite help is missing required product-surface contract text: ${snippet}`
    );
  }
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
    'Relay surface:',
    'Open this layer only when the browser is remote and cannot return to this terminal.',
    'Keep `wallet create|reapprove --await-local` as the default baseline when the browser and terminal are colocated.',
    'Use `relay baseline` for the product-style hosted approval summary; use `relay inspect` when you need the lower-level readiness contract fields directly.',
    'Fastest hosted recovery proof path: zk-agent relay baseline --relay-url <url> zk-agent wallet reapprove --name main --relay-url <url> --wait-relay --prompt-code zk-agent wallet status --name main',
    'If the wallet does not exist yet: zk-agent relay baseline --relay-url <url> zk-agent wallet create --relay-url <url> --wait-relay --prompt-code zk-agent next',
    'If you operate the relay yourself first: zk-agent relay serve --public-origin https://relay.example.com',
    'Use `relay baseline` before sending users to a hosted share link when you want the packaged public summary and proof paths first.',
    'Use `relay inspect` when the public origin, connector UI, and hosted-readiness contract need direct lower-level inspection.'
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
    'Agent profile surface:',
    'Use this layer only when you want explicit local identity metadata on top of the wallet path.',
    'Wallet approval and workflow execution still work without a saved local agent profile.',
    'Basic local identity path: zk-agent agent status zk-agent agent set --name "Main Agent" --wallet main zk-agent agent show',
    'Portable local profile management: zk-agent agent export zk-agent agent import --payload @agent-profile.json --overwrite',
    'Clear the saved local profile: zk-agent agent clear'
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
      'No local config was found, so setup is still the first required step.',
      'This recommendation is based on local state only.'
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
      'Use remote approval only when the browser is not colocated with this terminal.'
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
      'Local config is missing, so start with setup.',
      'Doctor stays local-only and does not require live RPC reads.'
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

function assertDoctorReadyPayload(payload) {
  assert.equal(payload.ok, true);
  assert.equal(payload.scope, 'wallet-ready');
  assert.equal(payload.walletName, 'main');
  assert.equal(payload.config?.exists, true);
  assert.equal(payload.config?.defaultChain, 'zksync-sepolia');
  assert.equal(payload.config?.connectorUrl, 'http://localhost:4444');
  assert.equal(payload.wallet?.exists, true);
  assert.equal(payload.wallet?.walletName, 'main');
  assert.equal(payload.wallet?.walletAddress, '0x1111111111111111111111111111111111111111');
  assert.equal(payload.wallet?.chain, 'zksync-sepolia');
  assert.equal(payload.wallet?.chainId, 300);
  assert.equal(payload.wallet?.accountKind, 'smart-account');
  assert.equal(payload.wallet?.approvalReady, true);
  assert.equal(payload.wallet?.localExecutionKeyStored, true);
  assert.deepEqual(payload.productEntrySummary, {
    view: 'product-entry',
    currentSurface: 'doctor',
    stage: 'wallet-ready',
    category: 'operate',
    recommendedMode: 'local-first',
    nextSurface: 'next',
    nextAction: 'zk-agent next',
    suiteAvailable: true,
    note:
      'Local readiness is clear. Return to zk-agent next for the live path.'
  });
  assert.deepEqual(payload.onboardingSummary, {
    stage: 'wallet-ready',
    baseline: 'local-first',
    localOnly: true,
    configExists: true,
    walletExists: true,
    approvalReady: true,
    localExecutionKeyStored: true,
    defaultChain: 'zksync-sepolia',
    connectorUrl: 'http://localhost:4444',
    relayUrl: null,
    nextAction: 'zk-agent next',
    notes: [
      'Local config, approval metadata, and a local execution signer are all present.',
      'Run zk-agent next for the live path; doctor does not confirm RPC reachability, deployment state, or funding.'
    ]
  });
  assert.equal(payload.summary?.stage, 'wallet-ready');
  assert.equal(payload.summary?.configExists, true);
  assert.equal(payload.summary?.walletExists, true);
  assert.equal(payload.summary?.approvalReady, true);
  assert.equal(payload.summary?.localExecutionKeyStored, true);
  assert.equal(payload.summary?.relayUrl, null);
  assert.equal(payload.summary?.nextAction, 'zk-agent next');
  assert.equal(payload.summary?.localOnly, true);
  assert.equal(payload.nextAction, 'zk-agent next');
  assert.deepEqual(payload.suiteHandoffSummary, {
    currentSurface: 'doctor',
    recommendedNow: true,
    command: 'zk-agent suite',
    useWhen:
      'Use suite once wallet approval and local signer readiness are no longer the blocker and you want one packaged, question-first surface for flagship pay plus the current post-flagship Agent Pay, discovery, paymaster, funding, and hosted recovery slices.',
    paymentCommand: 'zk-agent payment submit --wallet main --to <address> --amount <amount>',
    publicPaymentCommand: 'zk-agent submit --wallet main --to <address> --amount <amount>',
    paymentUseWhen:
      'Use payment when the write path is not the whole question and you need a durable local request plus follow-up, sharing, reporting, export, or approval repair around the same wallet.',
    stayOnCurrentSurfaceWhen:
      'Stay on doctor when local config, approval metadata, or local signer state is still unclear and you need a local check before choosing the live path.',
    note:
      'Local readiness is clear. Return to zk-agent next for the live path, or start with the suggested suite question when the task is broader than one immediate pay step.',
    recommendedQuestion: {
      id: 'send-now',
      title: 'Send Now',
      question: 'I want to send native value now.',
      journeyId: 'send-value-now',
      command: 'zk-agent workflow pay --wallet main --to <address> --amount <amount>',
      publicCommand: 'zk-agent pay --wallet main --to <address> --amount <amount>'
    },
    recommendedJourney: {
      id: 'send-value-now',
      title: 'Send Value Now',
      command: 'zk-agent workflow pay --wallet main --to <address> --amount <amount>',
      publicCommand: 'zk-agent pay --wallet main --to <address> --amount <amount>',
      proofPath: [
        'zk-agent workflow pay --wallet main --to <address> --amount <amount>',
        'zk-agent workflow next --request-id <request-id>',
        'zk-agent workflow status --request-id <request-id>'
      ],
      publicProofPath: [
        'zk-agent pay --wallet main --to <address> --amount <amount>',
        'zk-agent workflow next --request-id <request-id>',
        'zk-agent workflow status --request-id <request-id>'
      ]
    }
  });
  assert.deepEqual(payload.recommendedCommands, {
    next: 'zk-agent next',
    suite: 'zk-agent suite',
    walletStatus: 'zk-agent wallet status --name main',
    walletNext: 'zk-agent wallet next --name main',
    workflowPay: 'zk-agent workflow pay --wallet main --to <address> --amount <amount>',
    inspectDefaults: 'zk-agent defaults'
  });
}

function assertOperatorJsonContract(doc) {
  assertOrderedSection(
    doc,
    '## Compatibility Boundary',
    [
      'source of truth for the frozen machine-readable',
      'operator contract on the default product path',
      'At the current `rc` stage, the intentionally frozen compatibility boundary is:',
      '`onboardingSummary`',
      '`workflowEntrySummary`',
      '`walletApprovalSummary`',
      '`recommendedCommands`',
      '`nextAction`',
      '`afterApproval`',
      '`afterApprovalStatus`',
      'Fields and command surfaces that are not documented here as current',
      'stable contract are not frozen by default',
      '### Change policy',
      'Removing, renaming, or repurposing',
      'Changing the meaning or command shape',
      'New fields may be added only when they are optional',
      'breaking change is still required during `rc`'
    ],
    'Operator JSON contract doc must declare the frozen compatibility boundary and change policy for rc work.'
  );

  assertOrderedSection(
    doc,
    '## `zk-agent doctor`',
    [
      'local-only onboarding and wallet-recovery diagnostic',
      'Current stable top-level fields:',
      '`ok`',
      '`scope`',
      '`walletName`',
      '`config`',
      '`wallet`',
      '`onboardingSummary`',
      '`summary`',
      '`suiteHandoffSummary`',
      '`agentProfile`',
      '`agentFollowup`',
      '`nextAction`',
      '`recommendedCommands`',
      'Current stable `scope` values:',
      '`setup`',
      '`wallet-bootstrap`',
      '`wallet-recovery`',
      '`wallet-ready`',
      'Current stable `config` fields:',
      '`exists`',
      '`defaultChain`',
      '`connectorUrl`',
      '`provider`',
      'Current stable `wallet` fields when present:',
      '`exists`',
      '`walletName`',
      '`walletAddress`',
      '`chain`',
      '`chainId`',
      '`accountKind`',
      '`smartAccountProfileId`',
      '`syncedAt`',
      '`approvalReady`',
      '`localExecutionKeyStored`',
      '`legacySessionKeyStored`',
      '`signerType`',
      '`signerAddress`',
      '`signerSource`',
      'Current stable `summary` fields:',
      '`stage`',
      '`configExists`',
      '`walletExists`',
      '`approvalReady`',
      '`localExecutionKeyStored`',
      '`relayUrl`',
      '`nextAction`',
      '`localOnly`',
      '`notes`'
    ],
    'Operator JSON contract doc must describe the doctor top-level contract.'
  );

  assertOrderedSection(
    doc,
    '## `zk-agent setup`',
    [
      'Current stable top-level fields:',
      '`ok`',
      '`config`',
      '`onboardingSummary`',
      '`recommendedCommands`',
      'Current stable baseline defaults on the validated first-run path:',
      '`defaultChain = "zksync-sepolia"`',
      '`connectorUrl = "http://localhost:4444"`'
    ],
    'Operator JSON contract doc must describe the setup onboarding contract.'
  );

  assertOrderedSection(
    doc,
    '### `scope = "wallet-ready"`',
    [
      '"scope": "wallet-ready"',
      '"productEntrySummary": {',
      '"stage": "wallet-ready"',
      '"nextAction": "zk-agent next"',
      '"suiteAvailable": true',
      '"approvalReady": true',
      '"localExecutionKeyStored": true',
      '"suiteHandoffSummary": {',
      '"currentSurface": "doctor"',
      '"recommendedNow": true',
      '"command": "zk-agent suite"',
      '"recommendedQuestion": {',
      '"id": "send-now"',
      '"title": "Send Now"',
      '"question": "I want to send native value now."',
      '"journeyId": "send-value-now"',
      '"command": "zk-agent workflow pay --wallet main --to <address> --amount <amount>"',
      '"recommendedJourney": {',
      '"id": "send-value-now"',
      '"title": "Send Value Now"',
      '"command": "zk-agent workflow pay --wallet main --to <address> --amount <amount>"',
      '"nextAction": "zk-agent next"',
      '"recommendedCommands": {',
      '"next": "zk-agent next"',
      '"suite": "zk-agent suite"',
      '"walletStatus": "zk-agent wallet status --name main"',
      '"walletNext": "zk-agent wallet next --name main"',
      '"workflowPay": "zk-agent workflow pay --wallet main --to <address> --amount <amount>"',
      '"inspectDefaults": "zk-agent defaults"',
      'Current stable `suiteHandoffSummary` fields on this surface use the same field',
      'described later for top-level `zk-agent next` wallet scope.'
    ],
    'Operator JSON contract doc must describe the doctor wallet-ready contract.'
  );

  assertOrderedSection(
    doc,
    '## `zk-agent assets`',
    [
      'Current stable top-level fields:',
      '`ok`',
      '`discoverySummary`',
      '`recommendedCommands`',
      '`walletName`',
      '`walletAddress`',
      '`chain`',
      '`chainId`',
      '`balances`',
      '`ownedTokenRegistry`',
      '"inspectDefaults": "zk-agent defaults"',
      '"discoverOwnedTokens": "zk-agent tokens --wallet main --owned"',
      '"discoverTokens": "zk-agent tokens --chain zksync-sepolia"',
      '"inspectToken": "zk-agent resolve-token --chain zksync-sepolia --symbol <symbol>"',
      'Current stable fields:',
      '`walletName`',
      '`chain`',
      '`chainId`',
      '`assetCount`',
      '`nativeAssetSymbol`',
      '`nativeAssetBalance`',
      '`ownedTokenCount`',
      '`primaryOwnedTokenSymbol`',
      '`ownedTokenSymbols`',
      '`ownedTokenSourceCounts`',
      '`ownedBridgeMappingCounts`',
      '`ownedRegistryRoleCounts`'
    ],
    'Operator JSON contract doc must describe the assets discoverySummary contract.'
  );

  assertOrderedSection(
    doc,
    '## `zk-agent balances --owned-tokens`',
    [
      'Current stable top-level fields on that path:',
      '`ok`',
      '`discoverySummary`',
      '`recommendedCommands`',
      '`walletName`',
      '`walletAddress`',
      '`chain`',
      '`chainId`',
      '`balances`',
      '`ownedTokenRegistry`',
      'Same compressed single-chain owned-token summary contract as `zk-agent assets`.',
      'Same local-first discovery follow-up contract as `zk-agent assets`.'
    ],
    'Operator JSON contract doc must describe the balances --owned-tokens discovery contract.'
  );

  assertOrderedSection(
    doc,
    '## `zk-agent wallet status|next`',
    [
      'Current stable top-level fields:',
      '`ok`',
      '`inspection`',
      '`summary`',
      '`tokenDiscoverySummary`',
      '`suiteHandoffSummary`',
      '`recommendedCommands`',
      'Current stable `suiteHandoffSummary` fields on this surface:',
      '`currentSurface`',
      '`recommendedNow`',
      '`command`',
      '`recommendedQuestion`',
      '`recommendedJourney`',
      '`useWhen`',
      '`stayOnCurrentSurfaceWhen`',
      '`note`',
      'When the effective wallet paymaster mode is `approval-based`',
      '`discoverPaymasterTokens`',
      '`inspectPaymasterToken`',
      'When wallet-scoped discovery follow-ups are present',
      '`walletName`',
      '`chain`',
      '`intent`',
      '`nextAction`',
      '`paymasterMode`',
      '`tokenizedIntent`',
      '`includesAssetDiscovery`',
      '`includesOwnedTokenDiscovery`',
      '`includesChainTokenDiscovery`',
      '`includesDirectTokenInspection`',
      '`includesPaymasterTokenDiscovery`',
      '`includesPaymasterTokenInspection`'
    ],
    'Operator JSON contract doc must describe the wallet status/next suiteHandoffSummary and tokenDiscoverySummary contract.'
  );

  assertOrderedSection(
    doc,
    '## `zk-agent defaults`',
    [
      'Current stable top-level fields:',
      '`ok`',
      '`summary`',
      '`recommendedCommands`',
      '`defaults`',
      '`localTokenRegistry`',
      '`tokenRegistrySources`',
      '`tokenDirectoryChains`',
      '"inspectDefaults": "zk-agent defaults"',
      '"discoverTokens": "zk-agent tokens --chain zksync-sepolia"',
      '"inspectToken": "zk-agent resolve-token --chain zksync-sepolia --symbol ZKAT"',
      '"discoverPaymasterTokens": "zk-agent tokens --chain zksync-sepolia --role paymaster-fee-token"',
      '"inspectPaymasterToken": "zk-agent resolve-token --chain zksync-sepolia --symbol ZKAT --role paymaster-fee-token"',
      'The current stable `summary` fields are:',
      '`primaryDiscoveryChain`',
      '`exampleTokenSymbol`',
      '`paymasterFeeTokenSymbol`',
      '`localTokenCount`',
      '`tokenDirectoryChainCount`',
      '`tokenRegistrySources`',
      '`resolvedDefaults`'
    ],
    'Operator JSON contract doc must describe the defaults discovery contract.'
  );

  assertOrderedSection(
    doc,
    '## `zk-agent relay serve`',
    [
      'Current stable top-level fields:',
      '`ok`',
      '`status`',
      '`origin`',
      '`publicOrigin`',
      '`publicOriginSource`',
      '`stateBackend`',
      '`deploymentScope`',
      '`sameHostRestartPersists`',
      '`shareLinkBaseUrl`',
      '`statusApiBaseUrl`',
      '`publicOriginLooksLocal`',
      '`approvalEndpointSummary`',
      '`hostedReadinessSummary`',
      '`deploymentSummary`',
      '`healthUrl`',
      '`publicHealthUrl`',
      '`relayMode`',
      '`connectorUiAvailable`',
      '`hostedShareRedirectReady`',
      '`capabilities`',
      '`recommendedCommands`',
      '`notes`',
      'Current stable `hostedReadinessSummary` fields on this surface:',
      '`status`',
      '`compatible`',
      '`hostedApprovalReady`',
      '`publicOriginConfigured`',
      '`publicOriginLooksLocal`',
      '`connectorUiAvailable`',
      '`singleHostFileState`',
      'Current stable `approvalEndpointSummary` fields on this surface:',
      '`status`',
      '`publicOriginConfigured`',
      '`publicOriginLooksLocal`',
      '`relayUrlMatchesPublicOrigin`',
      '`shareLinkBaseUrl`',
      '`statusApiBaseUrl`',
      'Current stable approval-endpoint `status` values on this surface:',
      '`local-public-origin`',
      '`hosted-public-origin`',
      'Current stable hosted-readiness `status` values on this surface:',
      '`ready`',
      '`needs-public-origin`',
      '`needs-connector-ui`',
      '`needs-public-origin-and-ui`',
      '`incompatible`',
      'When present, `deploymentSummary` compresses the hosted deployment contract',
      'into:',
      '`origin`',
      '`publicOrigin`',
      '`publicOriginSource`',
      '`shareLinkBaseUrl`',
      '`statusApiBaseUrl`',
      '`publicOriginConfigured`',
      '`publicOriginLooksLocal`',
      '`connectorUiAvailable`',
      '`hostedShareRedirectReady`',
      '`singleHostFileState`',
      'Current stable `recommendedCommands` shape on this surface:',
      '`baseline`',
      '`inspectRelay`',
      '`createWallet`',
      '`reapproveWallet`',
      '`restartWithPublicOrigin`'
    ],
    'Operator JSON contract doc must describe the relay serve approval-endpoint and deployment-summary contracts.'
  );

  assertOrderedSection(
    doc,
    '## `zk-agent wallet create --relay-url <url>`',
    [
      'Current stable top-level fields:',
      '`ok`',
      '`walletName`',
      '`requestId`',
      '`walletRequestId`',
      '`approvalUrl`',
      '`relay`',
      '`relayRecoverySummary`',
      '`expiresAt`',
      '`chain`',
      '`chainId`',
      '`accountKind`',
      '`paymasterMode`',
      '`capabilities`',
      '`sessionScope`',
      '`nextAction`',
      '`recommendedCommands`',
      'Current stable `recommendedCommands` shape on this surface:',
      '`awaitLocal`',
      '`relayStatus`',
      '`relayApprove`',
      '`approve`',
      '`afterApproval`',
      '`afterApprovalStatus`',
      'Current stable `relayRecoverySummary` fields on this surface:',
      '`requestId`',
      '`walletName`',
      '`relayUrl`',
      '`relayStatus`',
      '`approvalReady`',
      '`nextAction`',
      '`shareLinkBaseUrl`',
      '`statusApiBaseUrl`',
      '`recoveryMode`',
      '`includesStatusPoll`',
      '`includesApprove`',
      '`includesRelayInspect`',
      '`includesRemoteReissue`',
      'Defaults to `zk-agent wallet request relay-status --request-id <id> --relay-url <url>`'
    ],
    'Operator JSON contract doc must describe the wallet create --relay-url recovery summary contract.'
  );

  assertOrderedSection(
    doc,
    '## `zk-agent wallet reapprove --name <name> --relay-url <url>`',
    [
      'Current stable top-level fields:',
      '`ok`',
      '`walletRequestId`',
      '`wallet`',
      '`request`',
      '`relay`',
      '`relayRecoverySummary`',
      '`nextAction`',
      '`recommendedCommands`',
      'Current stable `recommendedCommands` shape on this surface:',
      '`awaitLocal`',
      '`relayStatus`',
      '`relayApprove`',
      '`approve`',
      '`afterApproval`',
      '`afterApprovalStatus`',
      'Current stable `relayRecoverySummary` fields on this surface:',
      '`requestId`',
      '`walletName`',
      '`relayUrl`',
      '`relayStatus`',
      '`approvalReady`',
      '`nextAction`',
      '`shareLinkBaseUrl`',
      '`statusApiBaseUrl`',
      '`recoveryMode`',
      '`includesStatusPoll`',
      '`includesApprove`',
      '`includesRelayInspect`',
      '`includesRemoteReissue`',
      'Defaults to `zk-agent wallet request relay-status --request-id <id> --relay-url <url>`'
    ],
    'Operator JSON contract doc must describe the wallet reapprove --relay-url recovery summary contract.'
  );

  assertOrderedSection(
    doc,
    '### `scope = "setup"`',
    [
      '"scope": "setup"',
      '"config": {',
      '"exists": false',
      '"summary": {',
      '"stage": "setup"',
      '"nextAction": "zk-agent setup"',
      '"localOnly": true',
      '"recommendedCommands": {',
      '"setup": "zk-agent setup"',
      '"next": "zk-agent next"',
      '"inspectDefaults": "zk-agent defaults"'
    ],
    'Operator JSON contract doc must describe the doctor setup contract.'
  );

  assertOrderedSection(
    doc,
    '### `scope = "wallet"`',
    [
      '"tokenDiscoverySummary": { "...": "wallet-scope token recovery summary" }',
      'When the wallet scope exposes token/discovery follow-ups',
      '`walletName`',
      '`chain`',
      '`intent`',
      '`nextAction`',
      '`paymasterMode`',
      '`tokenizedIntent`',
      '`includesAssetDiscovery`',
      '`includesOwnedTokenDiscovery`',
      '`includesChainTokenDiscovery`',
      '`includesDirectTokenInspection`',
      '`includesPaymasterTokenDiscovery`',
      '`includesPaymasterTokenInspection`'
    ],
    'Operator JSON contract doc must describe the top-level wallet tokenDiscoverySummary contract.'
  );

  assertOrderedSection(
    doc,
    '### `workflow plan`',
    [
      '`inspection`',
      '`plan`',
      '`workflowEntrySummary`',
      '`tokenDiscoverySummary`',
      '`recommendedCommands`',
      'When the current intent is tokenized',
      '`walletName`',
      '`chain`',
      '`intent`',
      '`nextAction`',
      '`paymasterMode`',
      '`tokenizedIntent`',
      '`includesAssetDiscovery`',
      '`includesOwnedTokenDiscovery`',
      '`includesChainTokenDiscovery`',
      '`includesDirectTokenInspection`',
      '`includesPaymasterTokenDiscovery`',
      '`includesPaymasterTokenInspection`'
    ],
    'Operator JSON contract doc must describe the workflow plan tokenDiscoverySummary contract.'
  );

  assertOrderedSection(
    doc,
    '### `workflow auto`',
    [
      '`walletApproval`',
      '`workflowEntrySummary`',
      '`tokenDiscoverySummary`',
      '`recommendedCommands`',
      '### `workflow status|next|run|resume`',
      '`agentProfile`',
      '`agentFollowup`',
      '`workflowEntrySummary`',
      '`tokenDiscoverySummary`',
      '`recommendedCommands`',
      'Current stable `tokenDiscoverySummary` fields on tokenized workflow surfaces:',
      '`walletName`',
      '`chain`',
      '`intent`',
      '`nextAction`',
      '`paymasterMode`',
      '`tokenizedIntent`',
      '`includesAssetDiscovery`',
      '`includesOwnedTokenDiscovery`',
      '`includesChainTokenDiscovery`',
      '`includesDirectTokenInspection`',
      '`includesPaymasterTokenDiscovery`',
      '`includesPaymasterTokenInspection`'
    ],
    'Operator JSON contract doc must describe the workflow runtime tokenDiscoverySummary contract.'
  );

  assertOrderedSection(
    doc,
    '## `zk-agent suite`',
    [
      'Current stable top-level fields:',
      '`ok`',
      '`summary`',
      '`preflight`',
      '`recommendedJourney`',
      '`proofPaths`',
      '`questions`',
      '`journeys`',
      '`surfaces`',
      '`flagship`',
      '`slices`',
      '`recommendedCommands`',
      'Current stable `summary` fields:',
      '`suiteId`',
      '`catalogView`',
      '`walletName`',
      '`chain`',
      '`stage`',
      '`useWhen`',
      '`entryModes`',
      '`startHereJourneyId`',
      '`journeyOrder`',
      '`surfaceOrder`',
      '`categoryOrder`',
      '`flagshipId`',
      '`postFlagshipSliceIds`',
      '`recommendedOrder`',
      '`nextAction`',
      'Current stable `flagship` / `slices[]` fields:',
      '`category`',
      '`surface`',
      '`id`',
      '`title`',
      '`goal`',
      '`useWhen`',
      '`primaryCommand`',
      '`surfaceCommand`',
      '`supportingCommands`',
      '`proofPath`',
      '`skillPath`',
      'Current stable `surfaceOrder` values on this surface are:',
      '`workflow`',
      '`payment`',
      '`discovery`',
      '`relay`',
      'Current stable `surfaces[]` fields:',
      '`surface`',
      '`title`',
      '`useWhen`',
      '`command`',
      '`categoryIds`',
      '`entryIds`',
      'Current stable `questions[]` fields:',
      '`id`',
      '`title`',
      '`question`',
      '`journeyId`',
      '`surface`',
      '`startCommand`',
      '`useWhen`',
      'Current stable `journeys[]` fields:',
      '`id`',
      '`title`',
      '`operatorQuestion`',
      '`useWhen`',
      '`startCommand`',
      '`surface`',
      '`categoryIds`',
      '`entryIds`',
      'Current stable `recommendedJourney` fields:',
      '`id`',
      '`title`',
      '`startCommand`',
      '`surface`',
      '`useWhen`',
      '`proofPath`',
      'Current stable `proofPaths[]` fields:',
      '`id`',
      '`title`',
      '`journeyId`',
      '`surface`',
      '`useWhen`',
      '`startCommand`',
      '`proofPath`',
      'Current stable `journeyOrder` values on this surface are:',
      '`send-value-now`',
      '`capture-and-track-payments`',
      '`inspect-before-acting`',
      '`unstick-a-write`',
      '`recover-remote-approval`',
      'Current stable `startHereJourneyId` value on this surface is:',
      '`send-value-now`',
      'Current stable `recommendedCommands` shape on this surface:',
      '`suite`',
      '`flagship`',
      '`workflowSurface`',
      '`paymentSurface`',
      '`discoverySurface`',
      '`relaySurface`',
      '`payment`',
      '`discovery`',
      '`paymaster`',
      '`funding`',
      '`hostedApproval`',
      '`inspectDefaults`'
    ],
    'Operator JSON contract doc must describe the suite catalog, journey layer, deeper-surface handoff, and direct surface command contract.'
  );

  assertOrderedSection(
    doc,
    '## `zk-agent relay inspect`',
    [
      'Current stable top-level fields:',
      '`ok`',
      '`status`',
      '`relayUrl`',
      '`compatible`',
      '`origin`',
      '`publicOrigin`',
      '`publicOriginSource`',
      '`stateBackend`',
      '`deploymentScope`',
      '`sameHostRestartPersists`',
      '`shareLinkBaseUrl`',
      '`statusApiBaseUrl`',
      '`relayUrlMatchesOrigin`',
      '`relayUrlMatchesPublicOrigin`',
      '`publicOriginLooksLocal`',
      '`approvalEndpointSummary`',
      '`hostedReadinessSummary`',
      '`deploymentSummary`',
      '`connectorUiAvailable`',
      '`hostedShareRedirectReady`',
      '`capabilities`',
      '`recommendedCommands`',
      '`notes`',
      'Current stable `hostedReadinessSummary` fields on this surface:',
      '`status`',
      '`compatible`',
      '`hostedApprovalReady`',
      '`publicOriginConfigured`',
      '`publicOriginLooksLocal`',
      '`connectorUiAvailable`',
      '`singleHostFileState`',
      'Current stable `approvalEndpointSummary` fields on this surface:',
      '`status`',
      '`publicOriginConfigured`',
      '`publicOriginLooksLocal`',
      '`relayUrlMatchesPublicOrigin`',
      '`shareLinkBaseUrl`',
      '`statusApiBaseUrl`',
      'Current stable approval-endpoint `status` values on this surface:',
      '`local-public-origin`',
      '`hosted-public-origin`',
      '`hosted-public-origin-via-proxy`',
      'Current stable hosted-readiness `status` values on this surface:',
      '`ready`',
      '`needs-public-origin`',
      '`needs-connector-ui`',
      '`needs-public-origin-and-ui`',
      '`incompatible`',
      'Current stable `deploymentSummary` fields on this surface:',
      '`origin`',
      '`publicOrigin`',
      '`publicOriginSource`',
      '`shareLinkBaseUrl`',
      '`statusApiBaseUrl`',
      '`publicOriginConfigured`',
      '`publicOriginLooksLocal`',
      '`connectorUiAvailable`',
      '`hostedShareRedirectReady`',
      '`singleHostFileState`',
      'Current stable `recommendedCommands` shape on this surface:',
      '`baseline`',
      '`createWallet`',
      '`reapproveWallet`',
      '`restartWithPublicOrigin`'
    ],
    'Operator JSON contract doc must describe the relay inspect approval-endpoint and deployment-summary contracts.'
  );

  assertOrderedSection(
    doc,
    '## `zk-agent relay baseline`',
    [
      'Current stable top-level fields:',
      '`ok`',
      '`status`',
      '`relayUrl`',
      '`walletName`',
      '`baseline`',
      '`recommendedCommands`',
      'Current stable `baseline` fields on this surface:',
      '`format`',
      '`version`',
      '`generatedAt`',
      '`relayUrl`',
      '`walletName`',
      '`mode`',
      '`supportLevel`',
      '`claim`',
      '`createWalletPath`',
      '`reapproveWalletPath`',
      '`createWalletProofPath`',
      '`reapproveWalletProofPath`',
      '`rehearsal`',
      '`inspection`',
      '`notes`',
      'Current stable `claim` fields on this surface:',
      '`externallyReachablePublicOrigin`',
      '`sameOriginApprovalUi`',
      '`sameHostFileState`',
      '`hostedApprovalReady`',
      '`approvalEndpointStatus`',
      '`hostedReadinessStatus`',
      'Current stable `supportLevel` values on this surface:',
      '`supported`',
      '`needs-fix`',
      '`incompatible`',
      'Current stable `recommendedCommands` shape on this surface:',
      '`baseline`',
      '`inspect`',
      '`createWallet`',
      '`reapproveWallet`',
      '`walletStatus`',
      '`rehearsalPlan`',
      '`rehearsalSingleRun`',
      '`rehearsalRepeatedRun`'
    ],
    'Operator JSON contract doc must describe the packaged relay baseline surface.'
  );

  assertOrderedSection(
    doc,
    '## `zk-agent wallet request relay-publish`',
    [
      'Current stable top-level fields:',
      '`ok`',
      '`walletRequestId`',
      '`relay`',
      '`relayRecoverySummary`',
      '`request`',
      '`recommendedCommands`',
      '`nextAction`',
      'Current stable `relayRecoverySummary` fields on this surface:',
      '`requestId`',
      '`walletName`',
      '`relayUrl`',
      '`relayStatus`',
      '`approvalReady`',
      '`nextAction`',
      '`shareLinkBaseUrl`',
      '`statusApiBaseUrl`',
      '`recoveryMode`',
      '`includesStatusPoll`',
      '`includesApprove`',
      '`includesRelayInspect`',
      '`includesRemoteReissue`'
    ],
    'Operator JSON contract doc must describe the wallet request relay-publish recovery summary contract.'
  );

  assertOrderedSection(
    doc,
    '## `zk-agent wallet request relay-status`',
    [
      'Current stable top-level fields:',
      '`ok`',
      '`walletRequestId`',
      '`relay`',
      '`relayRecoverySummary`',
      '`recommendedCommands`',
      '`nextAction`',
      'Current stable `relay` fields:',
      '`request_id`',
      '`status`',
      '`approval_ready`',
      '`share_url`',
      '`status_url`',
      '`approval_url`',
      '`expires_at`',
      'Current stable `relayRecoverySummary` fields on this surface:',
      '`requestId`',
      '`walletName`',
      '`relayUrl`',
      '`relayStatus`',
      '`approvalReady`',
      '`nextAction`',
      '`shareLinkBaseUrl`',
      '`statusApiBaseUrl`',
      '`recoveryMode`',
      '`includesStatusPoll`',
      '`includesApprove`',
      '`includesRelayInspect`',
      '`includesRemoteReissue`',
      '"relayInspect": "zk-agent relay inspect --relay-url https://relay.example.com"',
      '"reissueRemoteApproval": "zk-agent wallet reapprove --name main --relay-url https://relay.example.com --wait-relay --prompt-code"',
      'The same `relayRecoverySummary` field set now also appears in:',
      '`wallet create --relay-url <url>`',
      '`wallet reapprove --name <name> --relay-url <url>`',
      '`wallet request relay-publish`',
      '`RELAY_APPROVAL_TIMEOUT` error details',
      '`RELAY_APPROVAL_EXPIRED` error details'
    ],
    'Operator JSON contract doc must describe the wallet request relay-status recovery summary contract.'
  );

  const requiredChecks = [
    [
      /### `onboardingSummary`[\s\S]*Current stable fields:[\s\S]*`stage`[\s\S]*`baseline`[\s\S]*`localOnly`[\s\S]*`configExists`[\s\S]*`walletExists`[\s\S]*`approvalReady`[\s\S]*`localExecutionKeyStored`[\s\S]*`defaultChain`[\s\S]*`connectorUrl`[\s\S]*`relayUrl`[\s\S]*`nextAction`[\s\S]*`notes`/,
      'Operator JSON contract doc must describe the shared onboardingSummary contract.'
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
      /"scope": "wallet"[\s\S]*"suiteHandoffSummary": \{[\s\S]*"currentSurface": "next"[\s\S]*"recommendedNow": true[\s\S]*"command": "zk-agent suite"[\s\S]*"recommendedQuestion": \{[\s\S]*"id": "send-now"[\s\S]*"title": "Send Now"[\s\S]*"question": "I want to send native value now\."[\s\S]*"journeyId": "send-value-now"[\s\S]*"command": "zk-agent workflow pay --wallet main --to <address> --amount <amount>"[\s\S]*\}[\s\S]*"recommendedJourney": \{[\s\S]*"id": "send-value-now"[\s\S]*"title": "Send Value Now"[\s\S]*"command": "zk-agent workflow pay --wallet main --to <address> --amount <amount>"[\s\S]*\}[\s\S]*"onboardingSummary": \{[\s\S]*"stage": "wallet-ready"[\s\S]*"baseline": "local-first"[\s\S]*"localOnly": false[\s\S]*"defaultChain": "zksync-sepolia"[\s\S]*"connectorUrl": "http:\/\/localhost:4444"[\s\S]*"nextAction": "zk-agent workflow pay --wallet main --to <address> --amount <amount>"[\s\S]*"recommendedCommands": \{[\s\S]*"walletNext": "zk-agent wallet next --name main"[\s\S]*"walletStatus": "zk-agent wallet status --name main"[\s\S]*"discoverAssets": "zk-agent assets --wallet main"[\s\S]*"discoverOwnedTokens": "zk-agent tokens --wallet main --owned"[\s\S]*"discoverTokens": "zk-agent tokens --chain zksync-sepolia"[\s\S]*"inspectToken": "zk-agent resolve-token --chain zksync-sepolia --symbol <symbol>"[\s\S]*"discoverPaymasterTokens": "zk-agent tokens --chain zksync-sepolia --role paymaster-fee-token"[\s\S]*"inspectPaymasterToken": "zk-agent resolve-token --chain zksync-sepolia --symbol <symbol> --role paymaster-fee-token"[\s\S]*"workflowPay": "zk-agent workflow pay --wallet main --to <address> --amount <amount>"[\s\S]*"workflowAuto": "zk-agent workflow auto --wallet main --intent <intent> \[goal flags\] --create-checkpoint --execute-when-ready"/,
      'Operator JSON contract doc must describe the wallet-scope suite handoff and discovery recommendedCommands contract.'
    ],
    [
      /### `scope = "workflow"`[\s\S]*"summary": \{[\s\S]*"status": "blocked"[\s\S]*"readyForGoal": false[\s\S]*"nextCommand": "zk-agent workflow resume --request-id wf123456"[\s\S]*"blockingActionIds": \["reapprove"\][\s\S]*"tokenDiscoverySummary": \{\s*"\.\.\.": "workflow-scope token recovery summary"\s*\}[\s\S]*Current stable `summary` fields on this surface:[\s\S]*`status`[\s\S]*`readyForGoal`[\s\S]*`nextCommand`[\s\S]*`blockingActionIds`[\s\S]*`fundingProgress`[\s\S]*When the restored workflow intent is tokenized[\s\S]*the same field set described for wallet scope/,
      'Operator JSON contract doc must describe the top-level workflow tokenDiscoverySummary contract.'
    ],
    [
      /### `scope = "workflow"`[\s\S]*"recommendedQuestion": null[\s\S]*"recommendedJourney": null[\s\S]*Current stable `suiteHandoffSummary` fields on this surface use the same field[\s\S]*described above for wallet scope\./,
      'Operator JSON contract doc must describe the top-level workflow suiteHandoffSummary contract.'
    ],
    [
      /Optional additive public-read fields may also appear on this handoff layer[\s\S]*`publicPaymentCommand`[\s\S]*`recommendedQuestion\.publicCommand`[\s\S]*`recommendedJourney\.publicCommand`[\s\S]*`recommendedJourney\.publicProofPath`/,
      'Operator JSON contract doc must describe the additive public-read handoff fields.'
    ],
    [
      /### `workflow status\|next\|run\|resume`[\s\S]*Tokenized workflow outputs should keep the same local-first recovery contract[\s\S]*visible:[\s\S]*`discoverAssets`[\s\S]*`discoverOwnedTokens`[\s\S]*`discoverTokens`[\s\S]*`inspectToken`[\s\S]*`discoverPaymasterTokens`[\s\S]*`inspectPaymasterToken`/,
      'Operator JSON contract doc must describe the tokenized workflow discovery follow-up contract.'
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
      /Optional additive public-read fields may also appear on this surface[\s\S]*`questions\[\]\.publicStartCommand`[\s\S]*`journeys\[\]\.publicStartCommand`[\s\S]*`recommendedJourney\.publicStartCommand`[\s\S]*`recommendedJourney\.publicProofPath`[\s\S]*`proofPaths\[\]\.publicStartCommand`[\s\S]*`proofPaths\[\]\.publicProofPath`[\s\S]*`recommendedCommands\.publicFlagship`[\s\S]*`recommendedCommands\.publicPayment`[\s\S]*`recommendedCommands\.publicWorkspace`/,
      'Operator JSON contract doc must describe the additive public-read suite fields.'
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
  logReleaseCheckStep('Packing published tarball.');
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
  logReleaseCheckStep('Installing tarball into a clean-machine project.');

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
    sessionExpiresAt: '2030-01-01T00:00:00.000Z',
    paymaster: {
      mode: 'none',
      address: null
    },
    sessionPublicKey: '0x' + '11'.repeat(32),
    sessionPrivateKey:
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    permissions: {
      expiresAt: '2030-01-01T00:00:00.000Z'
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
  logReleaseCheckStep('Running standalone tarball smoke against the extracted package.');
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

    const startHelpResult = runPackedCli(extractedPackageDir, homeDir, ['start', '--help']);
    assertPackedCliStderr(startHelpResult.stderr, startHelpResult.stdout, 'start --help');
    assert.match(startHelpResult.stdout, /Usage: zk-agent start/);
    assertNoWorkspaceLeak(startHelpResult.stdout);
    assertStartHelpContract(startHelpResult.stdout);

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

    const payHelpResult = runPackedCli(extractedPackageDir, homeDir, ['pay', '--help']);
    assertPackedCliStderr(payHelpResult.stderr, payHelpResult.stdout, 'pay --help');
    assert.match(payHelpResult.stdout, /Usage: zk-agent pay/);
    assertNoWorkspaceLeak(payHelpResult.stdout);
    assertPayHelpContract(payHelpResult.stdout);

    const submitHelpResult = runPackedCli(extractedPackageDir, homeDir, ['submit', '--help']);
    assertPackedCliStderr(submitHelpResult.stderr, submitHelpResult.stdout, 'submit --help');
    assert.match(submitHelpResult.stdout, /Usage: zk-agent submit/);
    assertNoWorkspaceLeak(submitHelpResult.stdout);
    assertSubmitHelpContract(submitHelpResult.stdout);

    const paymentHelpResult = runPackedCli(extractedPackageDir, homeDir, ['payment', '--help']);
    assertPackedCliStderr(paymentHelpResult.stderr, paymentHelpResult.stdout, 'payment --help');
    assert.match(paymentHelpResult.stdout, /Usage: zk-agent payment/);
    assertNoWorkspaceLeak(paymentHelpResult.stdout);
    assertPaymentHelpContract(paymentHelpResult.stdout);

    const workspaceHelpResult = runPackedCli(extractedPackageDir, homeDir, ['workspace', '--help']);
    assertPackedCliStderr(
      workspaceHelpResult.stderr,
      workspaceHelpResult.stdout,
      'workspace --help'
    );
    assert.match(workspaceHelpResult.stdout, /Usage: zk-agent workspace/);
    assertNoWorkspaceLeak(workspaceHelpResult.stdout);
    assertWorkspaceHelpContract(workspaceHelpResult.stdout);

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

    const doctorReadyOutput = runPackedCliJson(extractedPackageDir, homeDir, ['doctor', '--json']);
    assertNoWorkspaceLeak(doctorReadyOutput);
    const doctorReadyPayload = JSON.parse(doctorReadyOutput);
    assertDoctorReadyPayload(doctorReadyPayload);

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
  logReleaseCheckStep('Running installed relay serve smoke.');
  const installedEntry = join(projectRoot, 'node_modules', 'zk-agent-cli', 'dist', 'index.js');
  assert.equal(
    existsSync(installedEntry),
    true,
    `Expected installed CLI entry not found: ${installedEntry}`
  );
  const relayEnv = createStandaloneEnv(homeDir);
  const publicOrigin = 'https://relay.example.test';
  const requestId = 'release-check-share-link';
  let child = null;

  function spawnRelay(port) {
    const spawned = spawn(
      process.execPath,
      [
        installedEntry,
        '--json',
        'relay',
        'serve',
        '--port',
        String(port),
        '--public-origin',
        publicOrigin
      ],
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
    logReleaseCheckStep('Starting installed relay and validating hosted share-link readiness.');
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

    logReleaseCheckStep('Restarting installed relay to confirm same-host request persistence.');
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
  logReleaseCheckStep('Running clean-machine packaged install smoke.');
  const projectRoot = createCleanMachineInstallRoot();
  const homeDir = mkdtempSync(join(tmpdir(), 'zk-agent-cli-release-check-install-home-'));

  try {
    installTarballInCleanMachineProject(projectRoot, tarballPath);
    assert.equal(
      existsSync(join(projectRoot, 'node_modules', 'zk-agent-cli', 'dist', 'connector-ui', 'index.html')),
      true,
      'Installed package must include the bundled connector UI build.'
    );

    logReleaseCheckStep('Checking installed help contracts and packaged command surfaces.');
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

    const startHelpResult = runInstalledCli(projectRoot, homeDir, ['start', '--help']);
    assertPackedCliStderr(
      startHelpResult.stderr,
      startHelpResult.stdout,
      'installed zk-agent start --help'
    );
    assert.match(startHelpResult.stdout, /Usage: zk-agent start/);
    assertNoWorkspaceLeak(startHelpResult.stdout);
    assertStartHelpContract(startHelpResult.stdout);

    const payHelpResult = runInstalledCli(projectRoot, homeDir, ['pay', '--help']);
    assertPackedCliStderr(
      payHelpResult.stderr,
      payHelpResult.stdout,
      'installed zk-agent pay --help'
    );
    assert.match(payHelpResult.stdout, /Usage: zk-agent pay/);
    assertNoWorkspaceLeak(payHelpResult.stdout);
    assertPayHelpContract(payHelpResult.stdout);

    const submitHelpResult = runInstalledCli(projectRoot, homeDir, ['submit', '--help']);
    assertPackedCliStderr(
      submitHelpResult.stderr,
      submitHelpResult.stdout,
      'installed zk-agent submit --help'
    );
    assert.match(submitHelpResult.stdout, /Usage: zk-agent submit/);
    assertNoWorkspaceLeak(submitHelpResult.stdout);
    assertSubmitHelpContract(submitHelpResult.stdout);

    const doctorHelpResult = runInstalledCli(projectRoot, homeDir, ['doctor', '--help']);
    assertPackedCliStderr(
      doctorHelpResult.stderr,
      doctorHelpResult.stdout,
      'installed zk-agent doctor --help'
    );
    assert.match(doctorHelpResult.stdout, /Usage: zk-agent doctor/);
    assertNoWorkspaceLeak(doctorHelpResult.stdout);
    assertDoctorHelpContract(doctorHelpResult.stdout);

    const paymentHelpResult = runInstalledCli(projectRoot, homeDir, ['payment', '--help']);
    assertPackedCliStderr(
      paymentHelpResult.stderr,
      paymentHelpResult.stdout,
      'installed zk-agent payment --help'
    );
    assert.match(paymentHelpResult.stdout, /Usage: zk-agent payment/);
    assertNoWorkspaceLeak(paymentHelpResult.stdout);
    assertPaymentHelpContract(paymentHelpResult.stdout);

    const workspaceHelpResult = runInstalledCli(projectRoot, homeDir, ['workspace', '--help']);
    assertPackedCliStderr(
      workspaceHelpResult.stderr,
      workspaceHelpResult.stdout,
      'installed zk-agent workspace --help'
    );
    assert.match(workspaceHelpResult.stdout, /Usage: zk-agent workspace/);
    assertNoWorkspaceLeak(workspaceHelpResult.stdout);
    assertWorkspaceHelpContract(workspaceHelpResult.stdout);

    const suiteHelpResult = runInstalledCli(projectRoot, homeDir, ['suite', '--help']);
    assertPackedCliStderr(
      suiteHelpResult.stderr,
      suiteHelpResult.stdout,
      'installed zk-agent suite --help'
    );
    assert.match(suiteHelpResult.stdout, /Usage: zk-agent suite/);
    assertNoWorkspaceLeak(suiteHelpResult.stdout);
    assertSuiteHelpContract(suiteHelpResult.stdout);

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

    logReleaseCheckStep('Checking installed JSON contracts and packaged read surfaces.');
    const defaultsOutput = runInstalledCliJson(projectRoot, homeDir, ['defaults', '--json']);
    assertNoWorkspaceLeak(defaultsOutput);
    const defaultsPayload = JSON.parse(defaultsOutput);
    assert.equal(defaultsPayload.ok, true);
    assert.equal(Array.isArray(defaultsPayload.defaults?.builtinChains), true);
    assert.equal(Array.isArray(defaultsPayload.localTokenRegistry), true);

    const suiteOutput = runInstalledCliJson(projectRoot, homeDir, ['suite', '--json']);
    assertNoWorkspaceLeak(suiteOutput);
    const suitePayload = JSON.parse(suiteOutput);
    assert.equal(suitePayload.ok, true);
    assert.equal(suitePayload.summary?.suiteId, 'zk-agent-operator-suite');
    assert.equal(suitePayload.summary?.catalogView, 'operator-catalog');
    assert.equal(suitePayload.summary?.startHereJourneyId, 'send-value-now');
    assert.deepEqual(suitePayload.summary?.journeyOrder, [
      'send-value-now',
      'capture-and-track-payments',
      'inspect-before-acting',
      'unstick-a-write',
      'recover-remote-approval'
    ]);
    assert.deepEqual(suitePayload.summary?.surfaceOrder, [
      'workflow',
      'payment',
      'discovery',
      'relay'
    ]);
    assert.equal(suitePayload.recommendedJourney?.id, 'send-value-now');
    assert.equal(suitePayload.recommendedJourney?.title, 'Send Value Now');
    assert.equal(
      suitePayload.recommendedJourney?.startCommand,
      'zk-agent workflow pay --wallet main --to <address> --amount <amount>'
    );
    assert.equal(
      suitePayload.recommendedJourney?.publicStartCommand,
      'zk-agent pay --wallet main --to <address> --amount <amount>'
    );
    assert.equal(suitePayload.recommendedJourney?.surface, 'workflow');
    assert.deepEqual(suitePayload.recommendedJourney?.proofPath, [
      'zk-agent workflow pay --wallet main --to <address> --amount <amount>',
      'zk-agent workflow next --request-id <request-id>',
      'zk-agent workflow status --request-id <request-id>'
    ]);
    assert.deepEqual(suitePayload.recommendedJourney?.publicProofPath, [
      'zk-agent pay --wallet main --to <address> --amount <amount>',
      'zk-agent workflow next --request-id <request-id>',
      'zk-agent workflow status --request-id <request-id>'
    ]);
    assert.equal(Array.isArray(suitePayload.proofPaths), true);
    assert.deepEqual(suitePayload.proofPaths, [
      {
        id: 'flagship-pay',
        title: 'Flagship Pay',
        journeyId: 'send-value-now',
        surface: 'workflow',
        useWhen:
          'Use this when the wallet is already ready and you want the flagship zkSync-native pay path first.',
        startCommand: 'zk-agent workflow pay --wallet main --to <address> --amount <amount>',
        publicStartCommand: 'zk-agent pay --wallet main --to <address> --amount <amount>',
        proofPath: [
          'zk-agent workflow pay --wallet main --to <address> --amount <amount>',
          'zk-agent workflow next --request-id <request-id>',
          'zk-agent workflow status --request-id <request-id>'
        ],
        publicProofPath: [
          'zk-agent pay --wallet main --to <address> --amount <amount>',
          'zk-agent workflow next --request-id <request-id>',
          'zk-agent workflow status --request-id <request-id>'
        ]
      },
      {
        id: 'agent-pay-requests',
        title: 'Agent Pay Requests',
        journeyId: 'capture-and-track-payments',
        surface: 'payment',
        useWhen:
          'Use this when the packaged question has already narrowed to a durable Agent Pay request, follow-up, sharing, approval repair, or integration-ready export.',
        startCommand: 'zk-agent payment submit --wallet main --to <address> --amount <amount>',
        publicStartCommand: 'zk-agent submit --wallet main --to <address> --amount <amount>',
        proofPath: [
          'zk-agent payment submit --wallet main --to <address> --amount <amount>',
          'zk-agent payment next --request-id <request-id>',
          'zk-agent payment approval --request-id <request-id>',
          'zk-agent payment workspace',
          'zk-agent payment handoff --request-id <request-id>',
          'zk-agent payment feed'
        ],
        publicProofPath: [
          'zk-agent submit --wallet main --to <address> --amount <amount>',
          'zk-agent payment next --request-id <request-id>',
          'zk-agent payment approval --request-id <request-id>',
          'zk-agent workspace',
          'zk-agent payment handoff --request-id <request-id>',
          'zk-agent payment feed'
        ]
      },
      {
        id: 'hosted-approval-recovery',
        title: 'Hosted Approval Recovery',
        journeyId: 'recover-remote-approval',
        surface: 'relay',
        useWhen:
          'Use this when a writable session must be recovered through the single-host hosted relay baseline.',
        startCommand: 'zk-agent relay baseline --relay-url <url>',
        proofPath: [
          'zk-agent relay baseline --relay-url <url>',
          'zk-agent wallet reapprove --name main --relay-url <url> --wait-relay --prompt-code',
          'zk-agent wallet status --name main'
        ]
      }
    ]);
    assert.equal(Array.isArray(suitePayload.questions), true);
    assert.deepEqual(suitePayload.questions, [
      {
        id: 'send-now',
        title: 'Send Now',
        question: 'I want to send native value now.',
        journeyId: 'send-value-now',
        surface: 'workflow',
        startCommand: 'zk-agent workflow pay --wallet main --to <address> --amount <amount>',
        publicStartCommand: 'zk-agent pay --wallet main --to <address> --amount <amount>',
        useWhen:
          'Use this when the wallet is already ready and you want the flagship zkSync-native pay path first.'
      },
      {
        id: 'track-payments',
        title: 'Track Payments',
        question: 'I need to capture, track, share, or repair payments.',
        journeyId: 'capture-and-track-payments',
        surface: 'payment',
        startCommand: 'zk-agent payment submit --wallet main --to <address> --amount <amount>',
        publicStartCommand: 'zk-agent submit --wallet main --to <address> --amount <amount>',
        useWhen:
          'Use this when the packaged question has already narrowed to a durable Agent Pay request, follow-up, sharing, approval repair, or integration-ready export.'
      },
      {
        id: 'inspect-before-token-action',
        title: 'Inspect Before Token Action',
        question: 'I need assets, defaults, or token metadata before I act.',
        journeyId: 'inspect-before-acting',
        surface: 'discovery',
        startCommand: 'zk-agent assets --wallet main',
        useWhen:
          'Use this when asset visibility, defaults, or symbol-first token inspection is still the real blocker.'
      },
      {
        id: 'unstick-write',
        title: 'Unstick Write',
        question: 'The write path is blocked and I need the shortest recovery route.',
        journeyId: 'unstick-a-write',
        surface: 'workflow',
        startCommand:
          'zk-agent workflow pay --wallet main --to <address> --amount <amount> --paymaster-mode approval-based',
        useWhen:
          'Use this when approval-based pay or a workflow write is blocked and the CLI needs to recover paymaster or funding readiness.'
      },
      {
        id: 'recover-remote-approval',
        title: 'Recover Remote Approval',
        question: 'The browser is remote, so approval must move to the relay path.',
        journeyId: 'recover-remote-approval',
        surface: 'relay',
        startCommand: 'zk-agent relay baseline --relay-url <url>',
        useWhen:
          'Use this when a writable session must be recovered through the single-host hosted relay baseline.'
      }
    ]);
    assert.equal(Array.isArray(suitePayload.journeys), true);
    assert.deepEqual(
      suitePayload.journeys?.map((entry) => entry.id),
      [
        'send-value-now',
        'capture-and-track-payments',
        'inspect-before-acting',
        'unstick-a-write',
        'recover-remote-approval'
      ]
    );
    assert.equal(suitePayload.journeys?.[0]?.surface, 'workflow');
    assert.equal(
      suitePayload.journeys?.[0]?.startCommand,
      'zk-agent workflow pay --wallet main --to <address> --amount <amount>'
    );
    assert.equal(
      suitePayload.journeys?.[0]?.publicStartCommand,
      'zk-agent pay --wallet main --to <address> --amount <amount>'
    );
    assert.equal(suitePayload.journeys?.[1]?.surface, 'payment');
    assert.equal(
      suitePayload.journeys?.[1]?.startCommand,
      'zk-agent payment submit --wallet main --to <address> --amount <amount>'
    );
    assert.equal(
      suitePayload.journeys?.[1]?.publicStartCommand,
      'zk-agent submit --wallet main --to <address> --amount <amount>'
    );
    assert.equal(suitePayload.journeys?.[2]?.surface, 'discovery');
    assert.equal(suitePayload.journeys?.[2]?.startCommand, 'zk-agent assets --wallet main');
    assert.equal(suitePayload.journeys?.[3]?.surface, 'workflow');
    assert.equal(
      suitePayload.journeys?.[3]?.startCommand,
      'zk-agent workflow pay --wallet main --to <address> --amount <amount> --paymaster-mode approval-based'
    );
    assert.equal(suitePayload.journeys?.[4]?.surface, 'relay');
    assert.equal(
      suitePayload.journeys?.[4]?.startCommand,
      'zk-agent relay baseline --relay-url <url>'
    );
    assert.equal(Array.isArray(suitePayload.surfaces), true);
    assert.deepEqual(
      suitePayload.surfaces?.map((entry) => entry.surface),
      ['workflow', 'payment', 'discovery', 'relay']
    );
    assert.equal(suitePayload.recommendedCommands?.workflowSurface, 'zk-agent workflow --help');
    assert.equal(suitePayload.recommendedCommands?.paymentSurface, 'zk-agent payment --help');
    assert.equal(suitePayload.recommendedCommands?.discoverySurface, 'zk-agent defaults');
    assert.equal(suitePayload.recommendedCommands?.relaySurface, 'zk-agent relay --help');
    assert.equal(
      suitePayload.recommendedCommands?.publicFlagship,
      'zk-agent pay --wallet main --to <address> --amount <amount>'
    );
    assert.equal(
      suitePayload.recommendedCommands?.publicPayment,
      'zk-agent submit --wallet main --to <address> --amount <amount>'
    );
    assert.equal(suitePayload.recommendedCommands?.publicWorkspace, 'zk-agent workspace');
    assert.equal(suitePayload.surfaces?.[0]?.command, 'zk-agent workflow --help');
    assert.equal(suitePayload.surfaces?.[1]?.command, 'zk-agent payment --help');
    assert.equal(suitePayload.surfaces?.[2]?.command, 'zk-agent defaults');
    assert.equal(suitePayload.surfaces?.[3]?.command, 'zk-agent relay --help');
    assert.equal(suitePayload.flagship?.surface, 'workflow');
    assert.equal(suitePayload.flagship?.surfaceCommand, 'zk-agent workflow --help');
    assert.equal(Array.isArray(suitePayload.slices), true);
    assert.equal(suitePayload.slices?.[0]?.surface, 'payment');
    assert.equal(suitePayload.slices?.[0]?.surfaceCommand, 'zk-agent payment --help');
    assert.deepEqual(suitePayload.slices?.[0]?.proofPath, [
      'zk-agent payment submit --wallet main --to <address> --amount <amount>',
      'zk-agent payment next --request-id <request-id>',
      'zk-agent payment approval --request-id <request-id>',
      'zk-agent payment workspace',
      'zk-agent payment handoff --request-id <request-id>',
      'zk-agent payment feed'
    ]);
    assert.equal(suitePayload.slices?.[1]?.surface, 'discovery');
    assert.equal(suitePayload.slices?.[1]?.surfaceCommand, 'zk-agent defaults');
    assert.equal(suitePayload.slices?.[2]?.surface, 'workflow');
    assert.equal(suitePayload.slices?.[3]?.surface, 'workflow');
    assert.equal(suitePayload.slices?.[4]?.surface, 'relay');
    assert.equal(suitePayload.slices?.[4]?.surfaceCommand, 'zk-agent relay --help');
    assert.deepEqual(suitePayload.slices?.[4]?.proofPath, [
      'zk-agent relay baseline --relay-url <url>',
      'zk-agent wallet reapprove --name main --relay-url <url> --wait-relay --prompt-code',
      'zk-agent wallet status --name main'
    ]);

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

    const setupOutput = runInstalledCliJson(projectRoot, homeDir, ['setup', '--json']);
    assertNoWorkspaceLeak(setupOutput);
    const setupPayload = JSON.parse(setupOutput);
    assertSetupPayload(setupPayload);

    const importOutput = runInstalledCliJson(projectRoot, homeDir, [
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

    const doctorReadyOutput = runInstalledCliJson(projectRoot, homeDir, ['doctor', '--json']);
    assertNoWorkspaceLeak(doctorReadyOutput);
    const doctorReadyPayload = JSON.parse(doctorReadyOutput);
    assertDoctorReadyPayload(doctorReadyPayload);

    await assertInstalledRelayServe(projectRoot, homeDir);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
  }
}

async function main() {
  logReleaseCheckStep('Loading package metadata, docs, and release artifacts.');
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

  logReleaseCheckStep('Checking package metadata and plugin manifest alignment.');
  assertVersionAlignment(workspacePkg, pkg);
  assertReleaseMetadata(pkg);
  assertPluginManifest(pluginManifest, pkg);

  logReleaseCheckStep('Checking package README and repository front-door docs.');
  assertPackageReadme(readme);
  assertRepositoryDocs(rootReadme, quickstart, skillGuide);

  logReleaseCheckStep('Checking release-stage and hosted-baseline contracts.');
  assertReleaseStageDocs({
    packageReadme: readme,
    rootReadme,
    plans,
    projectState,
    releaseGateDoc,
    hostedBaselineDoc
  });

  logReleaseCheckStep('Checking changelog and current release artifact structure.');
  assertReleaseArtifact(changelog, releaseNotes);

  logReleaseCheckStep('Checking operator JSON contract and current-version alignment.');
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
    logReleaseCheckStep('Extracting tarball and verifying standalone package contents.');
    const extractedPackageDir = extractTarball(tarballPath, standaloneInstallRoot);
    linkRuntimeNodeModules(extractedPackageDir);
    assertStandaloneSmoke(extractedPackageDir);
  } finally {
    rmSync(standaloneInstallRoot, { recursive: true, force: true });
  }

  await assertCleanMachineInstallSmoke(tarballPath);

  rmSync(packDir, { recursive: true, force: true });
  logReleaseCheckStep('Release check completed successfully.');
  process.stdout.write(`Release check passed: ${tarballName}\n`);
}

await main();
