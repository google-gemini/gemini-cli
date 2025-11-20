/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const bundleDir = join(repoRoot, 'bundle');
const bundlePath = join(bundleDir, 'gemini.js');
const outputPath = join(bundleDir, 'gemini-bun');

if (!existsSync(bundlePath)) {
  console.error(
    'bundle/gemini.js is missing. Run `npm run bundle` before compiling with Bun.',
  );
  process.exit(1);
}

const bunBinary =
  process.env.BUN_BIN || process.env.BUN_PATH || process.env.BUN || 'bun';

console.log(`Using Bun binary: ${bunBinary}`);
const result = spawnSync(
  bunBinary,
  [
    'build',
    '--compile',
    bundlePath,
    '--outfile',
    outputPath,
    '--embed=./bundle/sandbox-*.sb',
  ],
  {
    cwd: repoRoot,
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: 'inherit',
  },
);

if (result.error?.code === 'ENOENT') {
  console.error(
    'Bun runtime not found in PATH. Install Bun (https://bun.sh) or set BUN_BIN to the Bun executable.',
  );
  process.exit(1);
}

if ((result.status ?? 1) !== 0) {
  console.error('Bun compilation failed.');
  process.exit(result.status ?? 1);
}

console.log(`Bun single binary created at ${outputPath}`);
