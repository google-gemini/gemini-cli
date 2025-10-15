/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-env node */
/* global console, process */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

let esbuild;
try {
  esbuild = (await import('esbuild')).default;
} catch (error) {
  console.warn('esbuild not available, skipping bundle step', error);
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
  loader: { '.node': 'file' },
  write: true,
};

const a2aServerConfig = {
  ...baseConfig,
  banner: {
    js: `const require = (await import('module')).createRequire(import.meta.url); globalThis.__filename = require('url').fileURLToPath(import.meta.url); globalThis.__dirname = require('path').dirname(globalThis.__filename);`,
  },
  entryPoints: ['src/http/server.ts'],
  outfile: 'bundle/a2a-server.mjs',
  define: {
    'process.env.CLI_VERSION': JSON.stringify(pkg.version),
  },
};

esbuild.build(a2aServerConfig).catch((reason) => {
  console.error('a2a-server build failed:', reason);
  process.exit(1);
});
