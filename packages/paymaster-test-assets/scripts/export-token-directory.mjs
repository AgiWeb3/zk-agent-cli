import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultDeploymentsDir = path.join(packageRoot, 'deployments');
const defaultOutDir = path.join(packageRoot, 'token-directory');

const CHAIN_IDS = new Map([
  ['zksync-era', 324],
  ['zksync-sepolia', 300]
]);

function printHelp() {
  console.log(`Usage: node ./scripts/export-token-directory.mjs [options]

Options:
  --deployments-dir <path>  Read deployment JSON files from this directory
  --out-dir <path>          Write token-directory output to this directory
  --help                    Show this help
`);
}

function parseArgs(argv) {
  const options = {
    deploymentsDir: defaultDeploymentsDir,
    outDir: defaultOutDir
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--') {
      continue;
    }

    if (arg === '--help') {
      printHelp();
      process.exit(0);
    }

    if (arg === '--deployments-dir') {
      const value = argv[index + 1];
      if (!value) throw new Error('--deployments-dir requires a value');
      options.deploymentsDir = path.resolve(value);
      index += 1;
      continue;
    }

    if (arg === '--out-dir') {
      const value = argv[index + 1];
      if (!value) throw new Error('--out-dir requires a value');
      options.outDir = path.resolve(value);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeAddress(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) return undefined;
  return trimmed.toLowerCase();
}

function normalizeSymbol(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.toUpperCase() : undefined;
}

function normalizeName(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeDecimals(value) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return undefined;
  }

  return value;
}

function createCandidate(network, rawToken, sourcePath, sourceKind) {
  if (!isRecord(rawToken)) return null;

  const address =
    normalizeAddress(rawToken.contractAddress) || normalizeAddress(rawToken.address);
  const symbol = normalizeSymbol(rawToken.symbol);
  const decimals = normalizeDecimals(rawToken.decimals);

  if (!network || !address || !symbol || decimals === undefined) {
    return null;
  }

  return {
    network,
    address,
    symbol,
    decimals,
    name: normalizeName(rawToken.name),
    sourcePath,
    sourceKind
  };
}

function mergeToken(existing, candidate) {
  const next = { ...existing };

  if (!next.name && candidate.name) {
    next.name = candidate.name;
  }

  if (next.sourceKind !== 'deployment' && candidate.sourceKind === 'deployment') {
    next.sourceKind = candidate.sourceKind;
    next.sourcePath = candidate.sourcePath;
  }

  return next;
}

async function collectTokens(deploymentsDir) {
  const entries = await fs.readdir(deploymentsDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort();

  const deduped = new Map();
  const warnings = [];

  for (const fileName of files) {
    const sourcePath = path.join(deploymentsDir, fileName);
    let raw;

    try {
      raw = JSON.parse(await fs.readFile(sourcePath, 'utf8'));
    } catch (error) {
      warnings.push(`Skipped unreadable JSON: ${sourcePath} (${error.message})`);
      continue;
    }

    if (!isRecord(raw)) continue;

    const network = typeof raw.network === 'string' ? raw.network.trim() : '';
    if (!network) continue;

    const candidates = [
      createCandidate(network, raw, sourcePath, 'deployment'),
      createCandidate(network, raw.tokenA, sourcePath, 'pool'),
      createCandidate(network, raw.tokenB, sourcePath, 'pool')
    ].filter(Boolean);

    for (const candidate of candidates) {
      const key = `${candidate.network}:${candidate.address}`;
      const existing = deduped.get(key);

      if (!existing) {
        deduped.set(key, candidate);
        continue;
      }

      if (existing.symbol !== candidate.symbol || existing.decimals !== candidate.decimals) {
        warnings.push(
          `Conflicting token metadata for ${candidate.address} in ${sourcePath}; kept ${existing.sourcePath}`
        );
        continue;
      }

      deduped.set(key, mergeToken(existing, candidate));
    }
  }

  return {
    tokens: Array.from(deduped.values()),
    warnings
  };
}

function buildDirectoryJson(tokens) {
  const index = {};
  const tokenListsByChain = new Map();

  for (const token of tokens) {
    const chainId = CHAIN_IDS.get(token.network);
    if (!chainId) continue;

    if (!tokenListsByChain.has(token.network)) {
      tokenListsByChain.set(token.network, []);
      index[token.network] = {
        chainId,
        tokenLists: {
          'erc20.json': 'erc20.json'
        }
      };
    }

    tokenListsByChain.get(token.network).push({
      chainId,
      address: token.address,
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals
    });
  }

  for (const list of tokenListsByChain.values()) {
    list.sort((left, right) => {
      const symbolCompare = left.symbol.localeCompare(right.symbol);
      if (symbolCompare !== 0) return symbolCompare;
      return left.address.localeCompare(right.address);
    });
  }

  return {
    index: {
      index,
      tokenListsByChain
    }
  };
}

async function writeDirectory(outDir, directoryJson) {
  await fs.mkdir(path.join(outDir, 'index'), { recursive: true });
  await fs.writeFile(
    path.join(outDir, 'index', 'index.json'),
    JSON.stringify({ index: directoryJson.index.index }, null, 2),
    'utf8'
  );

  for (const [network, tokens] of directoryJson.index.tokenListsByChain.entries()) {
    const chainDir = path.join(outDir, 'index', network);
    await fs.mkdir(chainDir, { recursive: true });
    await fs.writeFile(
      path.join(chainDir, 'erc20.json'),
      JSON.stringify({ tokens }, null, 2),
      'utf8'
    );
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { tokens, warnings } = await collectTokens(options.deploymentsDir);
  const knownChainTokens = tokens.filter((token) => CHAIN_IDS.has(token.network));
  const skippedNetworks = Array.from(
    new Set(tokens.map((token) => token.network).filter((network) => !CHAIN_IDS.has(network)))
  );

  const directoryJson = buildDirectoryJson(knownChainTokens);
  await writeDirectory(options.outDir, directoryJson);

  for (const warning of warnings) {
    console.warn(warning);
  }

  if (skippedNetworks.length > 0) {
    console.warn(`Skipped unsupported networks: ${skippedNetworks.join(', ')}`);
  }

  const chainSummary = Array.from(directoryJson.index.tokenListsByChain.entries()).map(
    ([network, chainTokens]) => ({
      network,
      chainId: CHAIN_IDS.get(network),
      tokenCount: chainTokens.length
    })
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        deploymentsDir: options.deploymentsDir,
        outDir: options.outDir,
        chainCount: chainSummary.length,
        tokenCount: knownChainTokens.length,
        chains: chainSummary
      },
      null,
      2
    )
  );
}

await main();
