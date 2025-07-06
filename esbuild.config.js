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
      js: `import { spawnSync } from 'child_process';
if (!process.env.GEMINI_CLI_RELAUNCHED && !process.execArgv.some(arg => arg.startsWith('--max-old-space-size'))) {
  const args = ['--max-old-space-size=8192', ...process.argv.slice(1)];
  const result = spawnSync(process.execPath, args, {
    stdio: 'inherit',
    env: { ...process.env, GEMINI_CLI_RELAUNCHED: 'true' }
  });
  process.exit(result.status === null ? 1 : result.status);
}
import { createRequire } from 'module'; const require = createRequire(import.meta.url); globalThis.__filename = require('url').fileURLToPath(import.meta.url); globalThis.__dirname = require('path').dirname(globalThis.__filename);`,
    },
  })
  .catch(() => process.exit(1));
