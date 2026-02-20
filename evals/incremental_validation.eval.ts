/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('Incremental Validation', () => {
  /**
   * This evaluation verifies that the agent adheres to the "Incremental Validation" mandate
   * by performing build or test checks between distinct, significant file changes.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should perform incremental validation between distinct file changes',
    files: {
      'src/a.ts': 'export const valA = 1 - 2; // BUG: should be 1 + 2',
      'src/b.ts': 'export const valB = 0;',
      'package.json': JSON.stringify({
        name: 'test-project',
        type: 'module',
        scripts: {
          test: 'echo "running tests..."',
          build: 'echo "building..."',
        },
      }),
    },
    prompt:
      '1. Fix the bug in src/a.ts (change - to +). 2. After that is done, update src/b.ts to export valB = 42. Ensure the project is buildable and tested at each step.',
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      // Find indices of edits to a.ts and b.ts
      const editAIndex = toolLogs.findIndex(
        (log) =>
          (log.toolRequest.name === 'replace' ||
            log.toolRequest.name === 'write_file') &&
          log.toolRequest.args.includes('src/a.ts'),
      );

      const editBIndex = toolLogs.findIndex(
        (log) =>
          (log.toolRequest.name === 'replace' ||
            log.toolRequest.name === 'write_file') &&
          log.toolRequest.args.includes('src/b.ts'),
      );

      expect(editAIndex, 'Agent should have edited src/a.ts').toBeGreaterThan(
        -1,
      );
      expect(editBIndex, 'Agent should have edited src/b.ts').toBeGreaterThan(
        editAIndex,
      );

      const isValidationCommand = (log: any) => {
        if (log.toolRequest.name !== 'run_shell_command') return false;
        const cmd = log.toolRequest.args.toLowerCase();
        return (
          cmd.includes('build') ||
          cmd.includes('test') ||
          cmd.includes('npm run') ||
          cmd.includes('tsc')
        );
      };

      // Check for validation between editA and editB
      const validationBetween = toolLogs
        .slice(editAIndex + 1, editBIndex)
        .some(isValidationCommand);

      expect(
        validationBetween,
        'Expected a build/test command between two distinct file edits to ensure incremental stability',
      ).toBe(true);

      // Also check for validation after editB to confirm final state
      const validationAfter = toolLogs
        .slice(editBIndex + 1)
        .some(isValidationCommand);

      expect(
        validationAfter,
        'Expected a build/test command after the final file edit',
      ).toBe(true);
    },
  });
});
