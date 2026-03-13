/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';
import { EDIT_TOOL_NAMES } from '@google/gemini-cli-core';
import fs from 'node:fs';
import path from 'node:path';

describe('Error Recovery', () => {
  const getCommand = (call: any): string | undefined => {
    let args = call.toolRequest.args;
    if (typeof args === 'string') {
      try {
        args = JSON.parse(args);
      } catch {
        // Ignore parse errors
      }
    }
    return typeof args === 'string' ? args : (args as any)['command'];
  };

  evalTest('USUALLY_PASSES', {
    name: 'should recover from failing tests by diagnosing and fixing the bug',
    files: {
      'src/filter.ts': `
/**
 * Returns all items from the array where the value exceeds the given threshold.
 */
export function filterAboveThreshold(items: number[], threshold: number): number[] {
  return items.filter((item) => item >= threshold);
}
`,
      'src/filter.test.ts': `
import { expect, test } from 'vitest';
import { filterAboveThreshold } from './filter.js';

test('returns only items strictly above the threshold', () => {
  const result = filterAboveThreshold([1, 2, 3, 4, 5], 3);
  expect(result).toEqual([4, 5]);
});

test('returns empty array when no items exceed threshold', () => {
  const result = filterAboveThreshold([1, 2, 3], 5);
  expect(result).toEqual([]);
});

test('handles empty array', () => {
  const result = filterAboveThreshold([], 3);
  expect(result).toEqual([]);
});
`,
      'package.json': JSON.stringify({
        name: 'test-project',
        type: 'module',
        scripts: {
          test: 'vitest run',
        },
      }),
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          target: 'ESNext',
          module: 'ESNext',
          moduleResolution: 'node',
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true,
        },
      }),
    },
    prompt:
      'The tests in this project are failing. Please diagnose the issue, fix the bug, and make sure all tests pass.',
    timeout: 600000,
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const shellCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'run_shell_command',
      );

      // 1. Agent should have run the tests at least once to observe the failure
      const testRuns = shellCalls.filter((log) => {
        const cmd = getCommand(log);
        return (
          cmd &&
          (cmd.includes('vitest') ||
            cmd.includes('npm test') ||
            cmd.includes('npm run test'))
        );
      });

      expect(
        testRuns.length,
        'Expected the agent to run the test suite at least once to observe the failure',
      ).toBeGreaterThanOrEqual(1);

      // 2. Agent should have edited the source file to fix the bug
      const editCalls = toolLogs.filter((log) =>
        EDIT_TOOL_NAMES.has(log.toolRequest.name),
      );

      const editedFilterFile = editCalls.some((log) => {
        const args =
          typeof log.toolRequest.args === 'string'
            ? JSON.parse(log.toolRequest.args)
            : log.toolRequest.args;
        const filePath: string =
          args.file_path || args.path || args.target_file || '';
        return filePath.includes('filter.ts') && !filePath.includes('.test.');
      });

      expect(
        editedFilterFile,
        'Expected the agent to edit src/filter.ts to fix the bug',
      ).toBe(true);

      // 3. Agent should have re-run the tests after making the fix
      expect(
        testRuns.length,
        'Expected the agent to re-run the tests after fixing the bug to verify the fix',
      ).toBeGreaterThanOrEqual(2);

      // 4. The fix should be correct: >= should become >
      const fixedContent = fs.readFileSync(
        path.join(rig.testDir!, 'src/filter.ts'),
        'utf-8',
      );

      const usesStrictGreaterThan =
        fixedContent.includes('item > threshold') ||
        fixedContent.includes('item>threshold');
      const stillUsesGte =
        fixedContent.includes('item >= threshold') ||
        fixedContent.includes('item>=threshold');

      expect(
        usesStrictGreaterThan && !stillUsesGte,
        `Expected the fix to change >= to > for strict comparison. Current content: ${fixedContent}`,
      ).toBe(true);
    },
  });
});
