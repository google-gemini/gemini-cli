/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('Self-Diff Review', () => {
  /**
   * Verifies that the agent performs a self-review immediately after an edit.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should review changes immediately after an edit',
    files: {
      'src/app.ts': 'export const hello = () => "world";',
    },
    prompt: 'Update src/app.ts to say "hello world" instead of "world".',
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      const editIndex = toolLogs.findIndex(
        (log) =>
          (log.toolRequest.name === 'replace' ||
            log.toolRequest.name === 'write_file') &&
          log.toolRequest.args.includes('src/app.ts'),
      );

      expect(editIndex, 'Agent should have edited src/app.ts').toBeGreaterThan(
        -1,
      );

      // Check for git diff or read_file immediately after the edit
      const reviewCall = toolLogs[editIndex + 1];
      expect(
        reviewCall,
        'Agent should have made a call after the edit',
      ).toBeDefined();

      const isReview =
        (reviewCall.toolRequest.name === 'run_shell_command' &&
          reviewCall.toolRequest.args.includes('git diff')) ||
        (reviewCall.toolRequest.name === 'read_file' &&
          reviewCall.toolRequest.args.includes('src/app.ts'));

      expect(
        isReview,
        'Agent should have run git diff or read_file immediately after the edit to review its work',
      ).toBe(true);
    },
  });
});
