/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';
import { EDIT_TOOL_NAMES } from '@google/gemini-cli-core';

describe('Multi-file Debugging', () => {
  const getCommand = (call: any): string | undefined => {
    let args = call.toolRequest.args;

    if (typeof args === 'string') {
      try {
        args = JSON.parse(args);
      } catch {
        // ignore parse errors
      }
    }

    return typeof args === 'string' ? args : (args as any)['command'];
  };

  evalTest('USUALLY_PASSES', {
    name: 'should diagnose and fix a bug located in a dependency module',

    files: {
      'src/math.ts': `
export function add(a: number, b: number): number {
  return a - b; // bug
}
`,

      'src/calculator.ts': `
import { add } from './math.js';

export function calculateTotal(a: number, b: number): number {
  return add(a, b);
}
`,

      'src/calculator.test.ts': `
import { expect, test } from 'vitest';
import { calculateTotal } from './calculator.js';

test('correctly adds two numbers', () => {
  expect(calculateTotal(2, 3)).toBe(5);
});

test('handles negative numbers', () => {
  expect(calculateTotal(-2, -3)).toBe(-5);
});
`,

      'package.json': JSON.stringify({
        name: 'multi-file-debug-test',
        type: 'module',
        scripts: { test: 'vitest run' },
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
      'The tests in this project are failing. Diagnose the issue, fix the bug, and ensure all tests pass.',

    timeout: 600000,

    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      const shellCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'run_shell_command',
      );

      // 1. Agent should run tests
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
        'Expected the agent to run tests to observe the failure',
      ).toBeGreaterThanOrEqual(1);

      // 2. Agent should edit math.ts (successfully)
      const editCalls = toolLogs.filter(
        (log) =>
          EDIT_TOOL_NAMES.has(log.toolRequest.name) && log.toolRequest.success,
      );

      const editedMathFile = editCalls.some((log) => {
        let args = log.toolRequest.args;

        if (typeof args === 'string') {
          try {
            args = JSON.parse(args);
          } catch {
            return false;
          }
        }

        const filePath: string =
          args.file_path || args.path || args.target_file || '';

        return filePath.includes('math.ts');
      });

      expect(
        editedMathFile,
        'Expected the agent to edit src/math.ts to fix the bug',
      ).toBe(true);

      // 3. Agent should rerun tests after fixing
      expect(
        testRuns.length,
        'Expected the agent to rerun tests after fixing the bug',
      ).toBeGreaterThanOrEqual(2);

      // 4. Validate the fix
      const fixedContent = rig.readFile('src/math.ts');

      const usesAddition =
        fixedContent.includes('a + b') || fixedContent.includes('a+b');

      expect(
        usesAddition,
        `Expected add() to return a + b. Current content: ${fixedContent}`,
      ).toBe(true);

      // 5. Agent should not cheat by editing the test file
      const editedTestFile = editCalls.some((log) => {
        let args = log.toolRequest.args;

        if (typeof args === 'string') {
          try {
            args = JSON.parse(args);
          } catch {
            return false;
          }
        }

        const filePath: string =
          (args as any).file_path ||
          (args as any).path ||
          (args as any).target_file ||
          '';

        return filePath.includes('.test.');
      });

      expect(
        editedTestFile,
        'Agent should not modify test files to force them to pass',
      ).toBe(false);
    },
  });
});
