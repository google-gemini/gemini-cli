/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('Error recovery', () => {
  /**
   * Tests that the agent can recover from a failing test by diagnosing the
   * bug, fixing the source file, and re-running the tests to verify the fix.
   * This validates the "observe → diagnose → fix → verify" loop.
   */
  evalTest('USUALLY_PASSES', {
    name: 'detects a failing test, fixes the source bug, and re-runs tests to verify',
    files: {
      'package.json': JSON.stringify(
        {
          name: 'error-recovery-project',
          version: '1.0.0',
          type: 'module',
          scripts: {
            test: 'vitest run',
          },
          devDependencies: {
            vitest: '^2.0.0',
          },
        },
        null,
        2,
      ),
      'src/math.ts': `
export function add(a: number, b: number): number {
  // Intentional bug: subtraction instead of addition
  return a - b;
}
`,
      'src/math.test.ts': `
import { expect, test } from 'vitest';
import { add } from './math.js';

test('add returns the correct sum', () => {
  expect(add(2, 3)).toBe(5);
});
`,
    },
    prompt:
      'Run the tests in this project. If any tests fail, diagnose the issue, fix the bug in the source code, and re-run the tests to verify the fix.',
    timeout: 300000,
    assert: async (rig, result) => {
      const toolLogs = rig.readToolLogs();
      const shellCalls = toolLogs.filter(
        (log) => log.toolRequest?.name === 'run_shell_command',
      );

      // The agent should have run the test suite at least once.
      expect(
        shellCalls.length,
        'Agent should have called run_shell_command at least once',
      ).toBeGreaterThan(0);

      // The agent should have run the tests more than once (initial failing run + re-verification).
      const testRuns = shellCalls.filter((call) => {
        const args =
          typeof call.toolRequest.args === 'string'
            ? JSON.parse(call.toolRequest.args)
            : call.toolRequest.args;
        const cmd: string = (args.command ?? '').toLowerCase();
        return (
          cmd.includes('vitest') ||
          cmd.includes('npm test') ||
          cmd.includes('npm run test')
        );
      });

      expect(
        testRuns.length,
        'Agent should have run the test suite more than once (initial run + re-verification after fix)',
      ).toBeGreaterThan(1);

      // The agent should have edited the source file to fix the bug.
      const editCalls = toolLogs.filter(
        (log) =>
          log.toolRequest?.name === 'write_file' ||
          log.toolRequest?.name === 'replace_file_content' ||
          log.toolRequest?.name === 'multi_replace_file_content' ||
          log.toolRequest?.name === 'str_replace_editor',
      );

      const fixedSourceFile = editCalls.some((call) => {
        const args =
          typeof call.toolRequest.args === 'string'
            ? JSON.parse(call.toolRequest.args)
            : call.toolRequest.args;
        const targetFile: string = (
          args.path ??
          args.target_file ??
          args.TargetFile ??
          ''
        ).toLowerCase();
        return targetFile.includes('math');
      });

      expect(
        fixedSourceFile,
        'Agent should have edited the src/math.ts file to fix the bug',
      ).toBe(true);

      // The final output should indicate success / passing tests.
      expect(
        result.toLowerCase().includes('pass') ||
          result.toLowerCase().includes('fix') ||
          result.toLowerCase().includes('success'),
        'Agent output should indicate the tests were fixed and are now passing',
      ).toBe(true);
    },
  });
});
