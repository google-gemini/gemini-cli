/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('Error Grounding and Scope Isolation', () => {
  /**
   * Verifies that the agent reads the error log when validation fails.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should read the full error message when validation fails',
    files: {
      'src/app.ts': 'export const x: number = "string"; // Error',
      'package.json': JSON.stringify({
        name: 'test-project',
        type: 'module',
        scripts: {
          typecheck: 'tsc --noEmit > error.log 2>&1',
        },
      }),
      'tsconfig.json': JSON.stringify({
        compilerOptions: { strict: true, module: 'ESNext', target: 'ESNext' },
      }),
    },
    prompt:
      'Run typecheck and fix the error in src/app.ts. Use redirection to a file if needed.',
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      // Check if it read the error log after running the command
      const ranTypecheck = toolLogs.some(
        (log) =>
          log.toolRequest.name === 'run_shell_command' &&
          log.toolRequest.args.includes('typecheck'),
      );

      const readErrorLog = toolLogs.some(
        (log) =>
          log.toolRequest.name === 'read_file' &&
          (log.toolRequest.args.includes('error.log') ||
            log.toolRequest.args.includes('app.ts')),
      );

      expect(ranTypecheck, 'Agent should have run the typecheck command').toBe(
        true,
      );
      expect(
        readErrorLog,
        'Agent should have read the error log or the file to understand the error grounding',
      ).toBe(true);
    },
  });

  /**
   * Verifies that the agent ignores pre-existing technical debt.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should ignore unrelated pre-existing technical debt during validation',
    files: {
      'src/legacy.ts':
        'export const legacy: any = 1; // Unrelated technical debt',
      'src/new.ts': 'export const current = 42;',
      'package.json': JSON.stringify({
        name: 'test-project',
        type: 'module',
        scripts: {
          lint: 'eslint .',
        },
      }),
      'eslint.config.js':
        'export default [{ rules: { "no-explicit-any": "error" } }];',
    },
    prompt:
      'Rename "current" to "updated" in src/new.ts. Ignore pre-existing lint errors in other files.',
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      const editedLegacy = toolLogs.some((log) =>
        log.toolRequest.args.includes('src/legacy.ts'),
      );

      expect(
        editedLegacy,
        'Agent should NOT have edited src/legacy.ts to fix unrelated pre-existing debt',
      ).toBe(false);

      const editedNew = toolLogs.some(
        (log) =>
          log.toolRequest.args.includes('src/new.ts') &&
          log.toolRequest.args.includes('updated'),
      );
      expect(
        editedNew,
        'Agent should have successfully refactored src/new.ts',
      ).toBe(true);
    },
  });
});
