const path = require('path');

const esbuild = require('esbuild');

const config = {
  entryPoints: ['packages/cli/src/index.ts'], // Adjust if entry point is different
  bundle: true,
  outfile: 'dist/cli.js', // Adjust output path as needed
  platform: 'node',
  target: 'node18', // Adjust based on your Node.js version
  format: 'esm',
  sourcemap: true,
  resolveExtensions: ['.ts', '.tsx', '.js', '.jsx'], // Ensure .ts is included
  loader: {
    '.ts': 'ts',
    '.tsx': 'tsx',
  },
  banner: {
    js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url); globalThis.__filename = require('url').fileURLToPath(import.meta.url); globalThis.__dirname = require('path').dirname(globalThis.__filename);`,
  },
};

esbuild.build(config).catch(() => process.exit(1));
