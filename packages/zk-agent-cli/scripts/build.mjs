import * as esbuild from 'esbuild';

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

console.log('Build complete: dist/index.js');
