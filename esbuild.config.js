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
    external: [
      'react',
      'ink',
      'react/jsx-runtime',
      'strip-json-comments',
      'mime-types',
      'string-width',
      'command-exists',
      'read-package-up',
      'ink-gradient',
      'ink-spinner',
      'ink-select-input',
      'chalk',
      'lowlight',
      'ansi-escapes',
      'update-notifier',
    ],
    platform: 'node',
    format: 'esm',
    define: {
      'process.env.CLI_VERSION': JSON.stringify(pkg.version),
    },
    banner: {
      js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url); globalThis.__filename = require('url').fileURLToPath(import.meta.url); globalThis.__dirname = require('path').dirname(globalThis.__filename);`,
    },
    minify: true,
    sourcemap: true,
  })
  .catch(() => process.exit(1));

esbuild
  .build({
    entryPoints: ['packages/core/index.ts'],
    bundle: true,
    outfile: 'bundle/gemini-core.js',
    external: [
      'react',
      'ink',
      'react/jsx-runtime',
      'strip-json-comments',
      'mime-types',
      'string-width',
      'command-exists',
      'read-package-up',
      'ink-gradient',
      'ink-spinner',
      'ink-select-input',
      'chalk',
      'lowlight',
      'ansi-escapes',
      'update-notifier',
    ],
    platform: 'node',
    format: 'esm',
    minify: true,
    sourcemap: true,
  })
  .catch(() => process.exit(1));
