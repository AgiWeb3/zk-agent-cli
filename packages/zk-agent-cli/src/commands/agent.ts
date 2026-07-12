import { Command } from 'commander';

import { loadWalletSession } from '@zk-agent/agent-core';
import {
  buildAgentIdentityExportRecord,
  deleteAgentIdentity,
  importAgentIdentityExportRecord,
  identityPluginStatus,
  loadAgentIdentity,
  requireAgentIdentity,
  resolveAgentIdentityExportRecord,
  saveAgentIdentity,
  type AgentIdentityRecord,
  type AgentIdentityLinkedWallet
} from '@zk-agent/plugin-identity';

import { parseJsonInput, printResult } from '../lib/io.js';

interface AgentStatusArgs {
  wallet?: string;
}

interface AgentSetArgs {
  id?: string;
  name?: string;
  description?: string;
  uri?: string;
  wallet?: string;
  unlinkWallet?: boolean;
  tag: string[];
  capability: string[];
  metadata: string[];
  replaceTags?: boolean;
  replaceCapabilities?: boolean;
  replaceMetadata?: boolean;
}

interface AgentImportArgs {
  payload: string;
  wallet?: string;
  unlinkWallet?: boolean;
  overwrite?: boolean;
}

function collectRepeatedString(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function parseMetadataEntries(entries: string[]): Record<string, string> | undefined {
  if (entries.length === 0) return undefined;

  const metadata: Record<string, string> = {};
  for (const entry of entries) {
    const separatorIndex = entry.indexOf('=');
    if (separatorIndex <= 0 || separatorIndex === entry.length - 1) {
      throw new Error(`Invalid metadata entry: ${entry}. Use key=value.`);
    }

    const key = entry.slice(0, separatorIndex).trim();
    const value = entry.slice(separatorIndex + 1).trim();
    if (!key || !value) {
      throw new Error(`Invalid metadata entry: ${entry}. Use key=value.`);
    }

    metadata[key] = value;
  }

  return metadata;
}

async function resolveLinkedWallet(walletName: string | undefined): Promise<{
  linkedWallet?: AgentIdentityLinkedWallet;
  walletRecord: Awaited<ReturnType<typeof loadWalletSession>>;
}> {
  if (!walletName) {
    return {
      linkedWallet: undefined,
      walletRecord: null
    };
  }

  const walletRecord = await loadWalletSession(walletName);
  if (!walletRecord) {
    throw new Error(`Wallet not found: ${walletName}`);
  }

  return {
    linkedWallet: {
      walletName: walletRecord.walletName,
      walletAddress: walletRecord.walletAddress,
      chain: walletRecord.chain,
      chainId: walletRecord.chainId,
      smartAccountProfileId: walletRecord.smartAccountProfileId
    },
    walletRecord
  };
}

function buildAgentRecommendedCommands(profile: AgentIdentityRecord | null, walletName?: string) {
  return {
    status: 'zk-agent agent status',
    show: 'zk-agent agent show',
    export: 'zk-agent agent export',
    import: 'zk-agent agent import --payload @agent-profile.json',
    set: profile
      ? 'zk-agent agent set --name <name>'
      : 'zk-agent agent set --name <name> --wallet main',
    walletStatus: walletName ? `zk-agent wallet status --name ${walletName}` : undefined
  };
}

function buildAgentSummaryLines(options: {
  profile: AgentIdentityRecord | null;
  inspectedWalletName?: string;
  inspectedWalletExists?: boolean;
}): Array<[string, string]> {
  const { profile, inspectedWalletName, inspectedWalletExists } = options;
  const lines: Array<[string, string]> = [
    ['plugin', `${identityPluginStatus.status} (milestone ${identityPluginStatus.milestone})`],
    ['note', identityPluginStatus.note]
  ];

  if (!profile) {
    lines.unshift(['status', 'No local agent profile saved']);
    if (inspectedWalletName) {
      lines.push(['inspected wallet', inspectedWalletName]);
      lines.push(['wallet exists', inspectedWalletExists ? 'yes' : 'no']);
    }
    return lines;
  }

  lines.unshift(['status', 'Local agent profile saved']);
  lines.push(['agent id', profile.agentId]);
  lines.push(['name', profile.name || 'not set']);
  lines.push(['wallet', profile.linkedWallet?.walletName || 'not linked']);
  lines.push(['uri', profile.uri || 'not set']);
  lines.push(['tags', profile.tags.length > 0 ? profile.tags.join(', ') : 'none']);
  lines.push([
    'capabilities',
    profile.capabilities.length > 0 ? profile.capabilities.join(', ') : 'none'
  ]);
  lines.push(['metadata keys', String(Object.keys(profile.metadata).length)]);

  if (inspectedWalletName) {
    lines.push(['inspected wallet', inspectedWalletName]);
    lines.push(['wallet exists', inspectedWalletExists ? 'yes' : 'no']);
  }

  return lines;
}

export function createAgentCommand(): Command {
  const agent = new Command('agent').description(
    'Manage local agent identity metadata without assuming a zkSync-native onchain reputation standard'
  );

  agent.addHelpText(
    'after',
    [
      '',
      'Examples:',
      '  zk-agent agent status',
      '  zk-agent agent set --name "SED Operator" --wallet main',
      '  zk-agent agent set --tag defi --capability swap --metadata role=operator',
      '  zk-agent agent show',
      '  zk-agent agent export',
      '  zk-agent agent import --payload @agent-profile.json --overwrite'
    ].join('\n')
  );

  agent
    .command('status')
    .description('Show whether a local agent profile exists and whether its linked wallet is still present locally')
    .option('--wallet <name>', 'Optional wallet name to inspect alongside the saved profile')
    .action(async (options: AgentStatusArgs) => {
      const profile = await loadAgentIdentity();
      const walletName = options.wallet || profile?.linkedWallet?.walletName;
      const walletRecord = walletName ? await loadWalletSession(walletName) : null;
      const recommendedCommands = buildAgentRecommendedCommands(profile, walletName);

      printResult(
        buildAgentSummaryLines({
          profile,
          inspectedWalletName: walletName,
          inspectedWalletExists: walletName ? walletRecord !== null : undefined
        }),
        {
          ok: true,
          plugin: identityPluginStatus,
          profileExists: profile !== null,
          profile,
          inspectedWallet: walletName
            ? {
                walletName,
                exists: walletRecord !== null
              }
            : null,
          recommendedCommands
        }
      );
    });

  agent
    .command('show')
    .description('Show the full saved local agent profile')
    .action(async () => {
      const profile = await loadAgentIdentity();
      const recommendedCommands = buildAgentRecommendedCommands(
        profile,
        profile?.linkedWallet?.walletName
      );

      printResult(
        buildAgentSummaryLines({
          profile
        }),
        {
          ok: true,
          plugin: identityPluginStatus,
          profileExists: profile !== null,
          profile,
          recommendedCommands
        }
      );
    });

  agent
    .command('export')
    .description('Export the saved local agent profile as a portable bundle')
    .action(async () => {
      const profile = await requireAgentIdentity();
      const bundle = buildAgentIdentityExportRecord(profile);
      const recommendedCommands = {
        import: 'zk-agent agent import --payload @agent-profile.json --overwrite',
        status: 'zk-agent agent status'
      };

      printResult(
        [
          ['status', 'Local agent profile exported'],
          ['agent id', profile.agentId],
          ['name', profile.name || 'not set'],
          ['wallet', profile.linkedWallet?.walletName || 'not linked'],
          ['exported at', bundle.exportedAt]
        ],
        {
          ok: true,
          export: bundle,
          recommendedCommands
        }
      );
    });

  agent
    .command('set')
    .description('Create or update the local agent profile and optionally bind it to one stored wallet')
    .option('--id <id>', 'Stable local agent profile identifier')
    .option('--name <name>', 'Display name for the local agent profile')
    .option('--description <text>', 'Short human-readable description')
    .option('--uri <uri>', 'Optional external metadata URI')
    .option('--wallet <name>', 'Bind the profile to one stored wallet')
    .option('--unlink-wallet', 'Remove any saved wallet link', false)
    .option('--tag <tag>', 'Repeatable profile tag', collectRepeatedString, [])
    .option('--capability <capability>', 'Repeatable declared capability', collectRepeatedString, [])
    .option('--metadata <key=value>', 'Repeatable metadata entry', collectRepeatedString, [])
    .option('--replace-tags', 'Replace saved tags with the provided --tag values', false)
    .option(
      '--replace-capabilities',
      'Replace saved capabilities with the provided --capability values',
      false
    )
    .option(
      '--replace-metadata',
      'Replace saved metadata with the provided --metadata entries',
      false
    )
    .action(async (options: AgentSetArgs) => {
      const { linkedWallet, walletRecord } = await resolveLinkedWallet(options.wallet);
      const profile = await saveAgentIdentity({
        agentId: options.id,
        name: options.name,
        description: options.description,
        uri: options.uri,
        tags: options.tag,
        capabilities: options.capability,
        metadata: parseMetadataEntries(options.metadata),
        linkedWallet,
        replaceTags: options.replaceTags,
        replaceCapabilities: options.replaceCapabilities,
        replaceMetadata: options.replaceMetadata,
        clearWalletLink: options.unlinkWallet
      });
      const recommendedCommands = buildAgentRecommendedCommands(
        profile,
        profile.linkedWallet?.walletName
      );

      printResult(
        buildAgentSummaryLines({
          profile,
          inspectedWalletName: walletRecord?.walletName,
          inspectedWalletExists: walletRecord ? true : undefined
        }),
        {
          ok: true,
          plugin: identityPluginStatus,
          profile,
          recommendedCommands
        }
      );
    });

  agent
    .command('import')
    .description('Restore the local agent profile from a bundle previously created by agent export')
    .requiredOption('--payload <payload>', 'Agent export JSON or @file path')
    .option('--wallet <name>', 'Override the imported wallet link with one stored local wallet')
    .option('--unlink-wallet', 'Drop any wallet link from the imported profile', false)
    .option('--overwrite', 'Replace an existing local agent profile', false)
    .action(async (options: AgentImportArgs) => {
      const raw = parseJsonInput<unknown>(options.payload);
      const parsedBundle = resolveAgentIdentityExportRecord(raw);
      const { linkedWallet, walletRecord } = await resolveLinkedWallet(options.wallet);
      const result = await importAgentIdentityExportRecord({
        exportRecord: parsedBundle,
        linkedWallet,
        clearWalletLink: options.unlinkWallet,
        overwrite: options.overwrite
      });
      const recommendedCommands = buildAgentRecommendedCommands(
        result.profile,
        result.profile.linkedWallet?.walletName
      );

      printResult(
        [
          ['status', 'Local agent profile imported'],
          ['agent id', result.profile.agentId],
          ['name', result.profile.name || 'not set'],
          ['wallet', result.profile.linkedWallet?.walletName || 'not linked'],
          ['exported at', result.importedFrom.exportedAt],
          ['original agent id', result.importedFrom.originalAgentId]
        ],
        {
          ok: true,
          profile: result.profile,
          importedFrom: result.importedFrom,
          inspectedWallet: walletRecord
            ? {
                walletName: walletRecord.walletName,
                exists: true
              }
            : null,
          recommendedCommands
        }
      );
    });

  agent
    .command('clear')
    .description('Remove the saved local agent profile')
    .action(async () => {
      const removed = await deleteAgentIdentity();
      const recommendedCommands = buildAgentRecommendedCommands(null);

      printResult(
        [
          ['status', removed ? 'Local agent profile removed' : 'No local agent profile was saved'],
          ['plugin', `${identityPluginStatus.status} (milestone ${identityPluginStatus.milestone})`]
        ],
        {
          ok: true,
          removed,
          plugin: identityPluginStatus,
          recommendedCommands
        }
      );
    });

  return agent;
}
