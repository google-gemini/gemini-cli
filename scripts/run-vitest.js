/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { resolveVitestModes } from './vitest/modes.js';

const args = process.argv.slice(2);
const { verboseMode, auditMode, forwardedArgs } = resolveVitestModes(args);

const requireFromWorkspace = createRequire(
  path.join(process.cwd(), 'package.json'),
);
const vitestCliPath = requireFromWorkspace.resolve('vitest/vitest.mjs');

const env = { ...process.env };
if (verboseMode) {
  env['GEMINI_TEST_VERBOSE'] = 'true';
}
if (auditMode) {
  env['GEMINI_TEST_OUTPUT_AUDIT'] = 'true';
}

const result = spawnSync(process.execPath, [vitestCliPath, ...forwardedArgs], {
  stdio: 'inherit',
  env,
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
