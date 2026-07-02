import { Command } from 'commander';

import { humanLine, jsonOut, shouldJsonOutput } from '../lib/io.js';
import { startRelayServer } from '../lib/relay.js';

function buildRelayServeRecommendedCommands(relayUrl: string): {
  createWallet: string;
  reapproveWallet: string;
} {
  return {
    createWallet: `zk-agent wallet create --relay-url ${relayUrl}`,
    reapproveWallet: `zk-agent wallet reapprove --name main --relay-url ${relayUrl}`
  };
}

export function createRelayCommand(): Command {
  const relay = new Command('relay').description('Run the local connector relay prototype server');

  relay
    .command('serve')
    .description('Serve the local relay API and, when available, the built connector UI')
    .option('--host <host>', 'Host to bind', '127.0.0.1')
    .option('--port <port>', 'Port to bind (0 = choose a free port)', '4445')
    .action(async (options: { host?: string; port?: string }) => {
      const host = options.host?.trim() || '127.0.0.1';
      const parsedPort = Number.parseInt(options.port || '4445', 10);
      if (!Number.isInteger(parsedPort) || parsedPort < 0 || parsedPort > 65535) {
        throw new Error(`Invalid relay port: ${options.port}`);
      }

      const server = await startRelayServer({
        host,
        port: parsedPort
      });
      const recommendedCommands = buildRelayServeRecommendedCommands(server.origin);

      const payload = {
        ok: true,
        status: 'relay-serving',
        origin: server.origin,
        port: server.port,
        healthUrl: `${server.origin}/health`,
        recommendedCommands
      };

      if (shouldJsonOutput()) {
        jsonOut(payload);
      } else {
        humanLine('status', 'relay-serving');
        humanLine('origin', server.origin);
        humanLine('health', `${server.origin}/health`);
        humanLine('create wallet', recommendedCommands.createWallet);
        humanLine('reapprove wallet', recommendedCommands.reapproveWallet);
      }

      const shutdown = async () => {
        process.off('SIGINT', handleSignal);
        process.off('SIGTERM', handleSignal);
        await server.close();
        process.exit(0);
      };
      const handleSignal = () => {
        void shutdown();
      };

      process.on('SIGINT', handleSignal);
      process.on('SIGTERM', handleSignal);
      await new Promise(() => {});
    });

  return relay;
}
