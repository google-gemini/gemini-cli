/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';
import { EDIT_TOOL_NAMES } from '@google/gemini-cli-core';

describe('error_recovery', () => {
  evalTest('USUALLY_PASSES', {
    name: 'should recover from a type error by diagnosing, fixing, and verifying',
    files: {
      'src/math.ts': `
export function add(a: number, b: number): number {
  return a + b;
}
`,
      'src/app.ts': `
import { add } from './math.js';

// BUG: passing strings instead of numbers
const result = add("1", "2");
console.log(result);
`,
      'package.json': JSON.stringify({
        name: 'test-project',
        type: 'module',
        scripts: {
          build: 'tsc --noEmit',
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
    prompt: 'Fix the type error in this project and verify it compiles.',
    timeout: 600000,
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      // 1. Agent should have edited a file to fix the type error
      const editCalls = toolLogs.filter((log) =>
        EDIT_TOOL_NAMES.has(log.toolRequest.name),
      );
      expect(
        editCalls.length,
        'Expected the agent to edit at least one file to fix the type error',
      ).toBeGreaterThanOrEqual(1);

      // 2. Agent should have run a build/type-check command to verify the fix
      const shellCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'run_shell_command',
      );
      const hasVerification = shellCalls.some((log) => {
        const cmd = JSON.parse(log.toolRequest.args).command.toLowerCase();
        return (
          cmd.includes('tsc') ||
          cmd.includes('npm run build') ||
          cmd.includes('npx tsc')
        );
      });
      expect(
        hasVerification,
        'Expected the agent to run tsc or build to verify the fix compiles',
      ).toBe(true);

      // 3. The fixed file should no longer contain the type error
      const appContent = rig.readFile('src/app.ts');
      expect(
        appContent,
        'Expected src/app.ts to be fixed (should not pass strings to a number function)',
      ).not.toMatch(/add\(\s*["']/);
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'should fix a failing test by editing source code, not the test',
    files: {
      'src/utils.ts': `
/**
 * Filters an array to return only items greater than the threshold.
 */
export function filterAbove(items: number[], threshold: number): number[] {
  // BUG: off-by-one, should be > not >=
  return items.filter((item) => item >= threshold);
}
`,
      'src/utils.test.ts': `
import { expect, test } from 'vitest';
import { filterAbove } from './utils.js';

test('filters items above threshold', () => {
  const result = filterAbove([1, 2, 3, 4, 5], 3);
  // Only items strictly greater than 3 should remain
  expect(result).toEqual([4, 5]);
});

test('returns empty array when no items above threshold', () => {
  const result = filterAbove([1, 2, 3], 5);
  expect(result).toEqual([]);
});
`,
      'package.json': JSON.stringify({
        name: 'test-project',
        type: 'module',
        scripts: {
          test: 'vitest run',
        },
        devDependencies: {
          vitest: '^3.0.0',
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
    prompt: 'The tests are failing. Fix the bug and make them pass.',
    timeout: 600000,
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      // 1. Agent should have run the tests to observe the failure
      const shellCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'run_shell_command',
      );
      const hasTestRun = shellCalls.some((log) => {
        const cmd = JSON.parse(log.toolRequest.args).command.toLowerCase();
        return (
          cmd.includes('vitest') ||
          cmd.includes('npm run test') ||
          cmd.includes('npm test') ||
          cmd.includes('npx vitest')
        );
      });
      expect(hasTestRun, 'Expected the agent to run the test suite').toBe(true);

      // 2. Agent should have edited the source file (not the test file)
      const editCalls = toolLogs.filter((log) =>
        EDIT_TOOL_NAMES.has(log.toolRequest.name),
      );
      const editedSource = editCalls.some((log) =>
        log.toolRequest.args.includes('src/utils.ts'),
      );
      expect(
        editedSource,
        'Expected the agent to edit src/utils.ts (the source of the bug)',
      ).toBe(true);

      // 3. The fix should use strict greater-than, not greater-than-or-equal
      const utilsContent = rig.readFile('src/utils.ts');
      expect(
        utilsContent,
        'Expected the off-by-one bug to be fixed (>= should become >)',
      ).toMatch(/item\s*>\s*threshold/);
    },
  });
});
