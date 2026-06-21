import * as esbuild from 'esbuild';
import { rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = join(packageDir, 'dist');

async function main() {
  await rm(distDir, { recursive: true, force: true });

  execFileSync('tsc', ['-p', 'tsconfig.json'], {
    cwd: packageDir,
    stdio: 'inherit'
  });

  await esbuild.build({
    entryPoints: {
      'run-tool': 'src/run-tool.ts',
      'smoke-readonly': 'src/smoke-readonly.ts',
      'smoke-lifecycle': 'src/smoke-lifecycle.ts',
      'smoke-policy': 'src/smoke-policy.ts',
      'smoke-broadcast': 'src/smoke-broadcast.ts'
    },
    absWorkingDir: packageDir,
    outdir: distDir,
    bundle: true,
    platform: 'node',
    target: 'es2023',
    format: 'esm',
    sourcemap: true,
    banner: {
      js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);"
    }
  });

  process.stdout.write('Build complete: dist/*.js\n');
}

await main();
