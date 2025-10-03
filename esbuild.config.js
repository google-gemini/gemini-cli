/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

let esbuild;
try {
  esbuild = (await import('esbuild')).default;
} catch (_error) {
  console.warn('esbuild not available, skipping bundle step');
  process.exit(0);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const pkg = require(path.resolve(__dirname, 'package.json'));

const external = [
  '@lydell/node-pty',
  'node-pty',
  '@lydell/node-pty-darwin-arm64',
  '@lydell/node-pty-darwin-x64',
  '@lydell/node-pty-linux-x64',
  '@lydell/node-pty-win32-arm64',
  '@lydell/node-pty-win32-x64',
];
const baseConfig = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  external,
  banner: {
    js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url); globalThis.__filename = require('url').fileURLToPath(import.meta.url); globalThis.__dirname = require('path').dirname(globalThis.__filename);`,
  },
  loader: { '.node': 'file' },
  write: true,
};

const cliConfig = {
  ...baseConfig,
  entryPoints: ['packages/cli/index.ts'],
  outfile: 'bundle/gemini.js',
  define: {
    'process.env.CLI_VERSION': JSON.stringify(pkg.version),
  },
  alias: {
    'is-in-ci': path.resolve(__dirname, 'packages/cli/src/patches/is-in-ci.ts'),
  },
  metafile: true,
};

const a2aServerConfig = {
  ...baseConfig,
  entryPoints: ['packages/a2a-server/src/http/server.ts'],
  outfile: 'bundle/a2a-server.mjs',
  define: {
    'process.env.CLI_VERSION': JSON.stringify(pkg.version),
  },
};

Promise.allSettled([
  esbuild.build(cliConfig).then(({ metafile }) => {
    if (process.env.DEV === 'true') {
      writeFileSync('./bundle/esbuild.json', JSON.stringify(metafile, null, 2));
    }
  }),
  esbuild.build(a2aServerConfig),
]).then((results) => {
  const [cliResult, a2aResult] = results;
  if (cliResult.status === 'rejected') {
    console.error('gemini.js build failed:', cliResult.reason);
    process.exit(1);
  }
  // error in a2a-server bundling will not stop gemini.js bundling process
  if (a2aResult.status === 'rejected') {
    console.warn('a2a-server build failed:', a2aResult.reason);
  }
});
