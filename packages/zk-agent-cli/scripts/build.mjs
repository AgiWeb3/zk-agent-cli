import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundledProfilesRoot = join(packageDir, 'dist', 'builtin-account-profiles');
const sourceProfilesRoot = resolve(packageDir, '../account-profiles');

await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'es2023',
  format: 'esm',
  outfile: 'dist/index.js',
  plugins: [
    {
      name: 'external-node-modules',
      setup(build) {
        build.onResolve({ filter: /^[^./]/ }, (args) => {
          if (args.path.startsWith('@zk-agent/')) return null;
          return { external: true };
        });
      }
    }
  ]
});

rmSync(bundledProfilesRoot, { recursive: true, force: true });
mkdirSync(bundledProfilesRoot, { recursive: true });
cpSync(join(sourceProfilesRoot, 'artifacts'), join(bundledProfilesRoot, 'artifacts'), {
  recursive: true
});
cpSync(join(sourceProfilesRoot, 'contracts'), join(bundledProfilesRoot, 'contracts'), {
  recursive: true
});
writeFileSync(
  join(bundledProfilesRoot, 'package.json'),
  JSON.stringify(
    {
      name: '@zk-agent/account-profiles',
      private: true,
      type: 'module'
    },
    null,
    2
  ) + '\n'
);

console.log('Build complete: dist/index.js');
