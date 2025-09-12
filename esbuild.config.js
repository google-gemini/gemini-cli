/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

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

const cliConfig = {
  entryPoints: ['packages/cli/index.ts'],
  bundle: true,
  outfile: 'bundle/gemini.js',
  platform: 'node',
  format: 'esm',
  external,
  alias: {
    'is-in-ci': path.resolve(__dirname, 'packages/cli/src/patches/is-in-ci.ts'),
  },
  define: {
    'process.env.CLI_VERSION': JSON.stringify(pkg.version),
  },
  banner: {
    js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url); globalThis.__filename = require('url').fileURLToPath(import.meta.url); globalThis.__dirname = require('path').dirname(globalThis.__filename);`,
  },
  loader: { '.node': 'file' },
  metafile: true,
  write: true,
};

const a2aServerConfig = {
  entryPoints: ['packages/a2a-server/src/http/server.ts'],
  bundle: true,
  outfile: 'bundle/a2a-server.js',
  platform: 'node',
  format: 'esm',
  external,
  define: {
    'process.env.CLI_VERSION': JSON.stringify(pkg.version),
  },
  banner: {
    js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url); globalThis.__filename = require('url').fileURLToPath(import.meta.url); globalThis.__dirname = require('path').dirname(globalThis.__filename);`,
  },
  loader: { '.node': 'file' },
  write: true,
};

Promise.all([
  esbuild.build(cliConfig).then(({ metafile }) => {
    if (process.env.DEV === 'true') {
      writeFileSync('./bundle/esbuild.json', JSON.stringify(metafile, null, 2));
    }
  }),
  esbuild.build(a2aServerConfig),
]).catch(() => process.exit(1));
