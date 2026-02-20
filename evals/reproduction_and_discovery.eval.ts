/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('Reproduction and Discovery', () => {
  /**
   * Verifies that the agent mandates empirical reproduction before fixing a bug
   * and performs script discovery.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should reproduce the bug and discover scripts before fixing',
    files: {
      'src/math.ts':
        'export const add = (a: number, b: number) => a - b; // BUG',
      'src/math.test.ts': `
import { expect, test } from 'vitest';
import { add } from './math';
test('add adds two numbers', () => {
  expect(add(2, 3)).toBe(5);
});
`,
      'package.json': JSON.stringify({
        name: 'test-project',
        type: 'module',
        scripts: {
          test: 'vitest run',
        },
        devDependencies: {
          vitest: '^1.0.0',
        },
      }),
    },
    prompt: 'Fix the bug in src/math.ts.',
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      // 1. Script Discovery: Check if it read package.json
      const readPackageJson = toolLogs.some(
        (log) =>
          log.toolRequest.name === 'read_file' &&
          log.toolRequest.args.includes('package.json'),
      );
      expect(
        readPackageJson,
        'Agent should have read package.json to discover scripts',
      ).toBe(true);

      // 2. Mandatory Reproduction: Check if it ran the test BEFORE the fix
      const editIndex = toolLogs.findIndex(
        (log) =>
          (log.toolRequest.name === 'replace' ||
            log.toolRequest.name === 'write_file') &&
          log.toolRequest.args.includes('src/math.ts'),
      );

      const ranTestBeforeFix = toolLogs
        .slice(0, editIndex)
        .some(
          (log) =>
            log.toolRequest.name === 'run_shell_command' &&
            (log.toolRequest.args.includes('vitest') ||
              log.toolRequest.args.includes('npm test') ||
              log.toolRequest.args.includes('npm run test')),
        );

      expect(editIndex, 'Agent should have edited src/math.ts').toBeGreaterThan(
        -1,
      );
      expect(
        ranTestBeforeFix,
        'Agent should have run the test to reproduce the bug BEFORE applying the fix',
      ).toBe(true);
    },
  });
});
