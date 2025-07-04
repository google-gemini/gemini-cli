/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const pkg = require(path.resolve(__dirname, 'package.json'));

const plugins = [];

const loaders = {
  '.ts': 'ts',
  '.tsx': 'tsx',
  '.js': 'js',
  '.jsx': 'jsx',
  '.json': 'json',
};

esbuild
  .build({
    entryPoints: ['packages/cli/index.ts'],
    bundle: true,
    outfile: 'bundle/gemini.js',
    platform: 'node',
    format: 'esm',
    plugins,
    loader: loaders,
    define: {
      'process.env.CLI_VERSION': JSON.stringify(pkg.version),
    },
    external: [
      'escalade/sync',
      'yoga-layout',
      'diff',
      'selderee',
      'ecdsa-sig-formatter',
      './cjs/react-is.production.min.js',
      './route',
      './lib/source-map-generator',
      './lib/source-map-consumer',
      './lib/source-node',
    ],
    banner: {
      js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url); globalThis.__filename = require('url').fileURLToPath(import.meta.url); globalThis.__dirname = require('path').dirname(globalThis.__filename);`,
    },
  })
  .catch(() => process.exit(1));
