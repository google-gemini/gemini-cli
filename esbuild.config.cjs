const path = require('path');

const esbuild = require('esbuild');

const config = {
  entryPoints: ['packages/cli/src/gemini.tsx'], // Adjust if entry point is different
  bundle: true,
  outfile: 'bundle/gemini.js', // Adjust output path as needed
  platform: 'node',
  target: 'node18', // Adjust based on your Node.js version
  format: 'esm',
  sourcemap: true,
  resolveExtensions: ['.ts', '.tsx', '.js', '.jsx'], // Ensure .ts is included
  loader: {
    '.ts': 'ts',
    '.tsx': 'tsx',
  },
  alias: {
    '@google/gemini-cli-core': path.resolve(__dirname, 'packages/core/src'),
  },
  external: [
    '@oclif/core',
    'colorama',
    'spdx-license-ids',
    'spdx-license-ids/deprecated',
    'spdx-exceptions',
  ],
};

esbuild.build(config).catch(() => process.exit(1));
