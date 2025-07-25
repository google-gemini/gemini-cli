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

esbuild
  .build({
    entryPoints: ['packages/cli/index.ts'],
    bundle: true,
    outfile: 'bundle/gemini.js',
    platform: 'node',
    format: 'esm',
    define: {
      'process.env.CLI_VERSION': JSON.stringify(pkg.version),
    },
    banner: {
      js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url); globalThis.__filename = require('url').fileURLToPath(import.meta.url); globalThis.__dirname = require('path').dirname(globalThis.__filename);`,
    },
    external: [
      'react',
      'ink',
      'react/jsx-runtime',
      'read-package-up',
      'strip-json-comments',
      'command-exists',
      'get-east-asian-width',
      'ansi-escapes',
      'update-notifier',
      'ink-gradient',
      'ink-spinner',
      '@iarna/toml',
      'has-flag',
      'lowlight',
      '@google/gemini-cli-core',
    ],
  })
  .catch(() => process.exit(1));
