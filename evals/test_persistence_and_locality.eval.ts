/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('Test Persistence and Locality', () => {
  /**
   * Verifies that the agent integration-tests a bug by amending an existing test file.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should reproduce a bug and amend existing test file instead of creating a new one',
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
      }),
    },
    prompt:
      'Fix the bug in src/math.ts. Make sure to keep the test case for future regressions.',
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      // Check if it created ANY new .test.ts file
      const createdNewTestFile = toolLogs.some(
        (log) =>
          log.toolRequest.name === 'write_file' &&
          log.toolRequest.args.includes('.test.ts') &&
          !log.toolRequest.args.includes('src/math.test.ts'),
      );

      expect(
        createdNewTestFile,
        'Agent should NOT have created a new test file',
      ).toBe(false);

      // Check if it amended the existing math.test.ts
      const amendedExistingTest = toolLogs.some(
        (log) =>
          (log.toolRequest.name === 'replace' ||
            log.toolRequest.name === 'write_file') &&
          log.toolRequest.args.includes('src/math.test.ts'),
      );

      expect(
        amendedExistingTest,
        'Agent should have amended the existing src/math.test.ts',
      ).toBe(true);
    },
  });
});
