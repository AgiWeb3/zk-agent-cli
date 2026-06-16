import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(packageRoot, 'dist');

fs.rmSync(distDir, { recursive: true, force: true });

const result = spawnSync('tsc', ['-p', 'tsconfig.json'], {
  cwd: packageRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
