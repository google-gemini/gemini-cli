/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('Negative Verification', () => {
  /**
   * Verifies that the agent mandates negative verification (confirming test failure)
   * before applying a fix.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should confirm test failure before applying fix',
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
    prompt:
      'Fix the bug in src/math.ts. Ensure you verify the bug exists before fixing it.',
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      const editIndex = toolLogs.findIndex(
        (log) =>
          (log.toolRequest.name === 'replace' ||
            log.toolRequest.name === 'write_file') &&
          log.toolRequest.args.includes('src/math.ts'),
      );

      // We expect at least one test run BEFORE the edit
      const testRunsBefore = toolLogs
        .slice(0, editIndex)
        .filter(
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
        testRunsBefore.length,
        'Agent should have run tests at least once BEFORE the fix to confirm the bug',
      ).toBeGreaterThanOrEqual(1);

      // Verification of "confirm it fails" is harder to check automatically in eval rig
      // because we don't see the agent's internal thought "it failed as expected".
      // But running it before fixing is the necessary mechanical step.
    },
  });
});
