/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('Output Verification', () => {
  /**
   * Verifies that the agent checks for "No tests found" in the output.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should identify an empty test run as incomplete',
    files: {
      'src/app.ts': 'export const x = 1;',
      'package.json': JSON.stringify({
        name: 'test-project',
        type: 'module',
        scripts: {
          test: 'echo "No tests found"', // Silently "passes" with code 0 but no work done
        },
      }),
    },
    prompt:
      'Run the tests for this project and verify they passed. If no tests are found, you must report it.',
    assert: async (rig, result) => {
      // The agent should realize no tests were run despite the success exit code
      expect(
        result.toLowerCase(),
        'Agent should have reported that no tests were found',
      ).toMatch(/no tests found|no tests executed|empty test suite/i);
    },
  });
});
