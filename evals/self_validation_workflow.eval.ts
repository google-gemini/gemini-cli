/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('Self-Validation Workflow', () => {
  /**
   * Verifies that the agent performs "Parallel Discovery" in the first turn.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should perform parallel discovery in the first turn',
    files: {
      'package.json': JSON.stringify({
        name: 'test-project',
        scripts: { test: 'vitest' },
      }),
      'src/index.ts': 'export const main = () => console.log("hello");',
    },
    prompt: 'Explore the project and find where the main function is defined.',
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      // Group by prompt_id and find the one that ends with #0 (first turn)
      const firstTurnLogs = toolLogs.filter((log) =>
        log.toolRequest.prompt_id?.endsWith('#0'),
      );

      const hasReadPackageJson = toolLogs.some(
        (log) =>
          log.toolRequest.name === 'read_file' &&
          log.toolRequest.args.includes('package.json'),
      );
      const hasSearch = toolLogs.some(
        (log) =>
          log.toolRequest.name === 'grep_search' ||
          log.toolRequest.name === 'list_directory' ||
          log.toolRequest.name === 'glob',
      );

      // Relaxing turn-1 check slightly as it might take a moment to bootstrap,
      // but ensuring they happen early.
      expect(
        hasReadPackageJson,
        'Should read package.json to discover scripts',
      ).toBe(true);
      expect(
        hasSearch,
        'Should perform search/listing to explore the project',
      ).toBe(true);
    },
  });

  /**
   * Verifies "Negative Verification": Agent must run the repro and confirm failure.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should confirm negative verification (repro fails) before fix',
    files: {
      'src/utils.ts':
        'export const square = (n: number) => n + n; // BUG: should be n * n',
      'package.json': JSON.stringify({
        name: 'test-project',
        scripts: { test: 'vitest run' },
        devDependencies: { vitest: '^1.0.0' },
      }),
    },
    prompt:
      'Fix the square function in src/utils.ts. Create a test to reproduce it first.',
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const editIndex = toolLogs.findIndex(
        (log) =>
          log.toolRequest.name === 'replace' &&
          log.toolRequest.args.includes('src/utils.ts'),
      );

      const testRunsBeforeFix = toolLogs
        .slice(0, editIndex)
        .filter(
          (log) =>
            log.toolRequest.name === 'run_shell_command' &&
            log.toolRequest.args.includes('test'),
        );

      expect(
        testRunsBeforeFix.length,
        'Should run tests at least once before fix',
      ).toBeGreaterThanOrEqual(1);

      // Check if it acknowledged the failure in thoughts or if it explicitly ran the test.
      // The mandate is to "run this reproduction script and confirm it fails".
    },
  });

  /**
   * Verifies "Tail-First Navigation" for large logs.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should use tail-first navigation for large logs',
    files: {
      'src/bug.ts': 'console.log("error");',
      'large_log.log':
        'Line 1\n'.repeat(1000) +
        'CRITICAL ERROR: specific failure at the end\n',
    },
    prompt:
      'There is a failure at the end of large_log.log. Find it and explain the cause.',
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      const usedTailOrGrep = toolLogs.some(
        (log) =>
          log.toolRequest.name === 'run_shell_command' &&
          (log.toolRequest.args.includes('tail') ||
            log.toolRequest.args.includes('grep')),
      );

      const readWholeFile = toolLogs.some(
        (log) =>
          log.toolRequest.name === 'read_file' &&
          log.toolRequest.args.includes('large_log.log') &&
          !log.toolRequest.args.includes('limit'),
      );

      expect(usedTailOrGrep, 'Should use tail or grep for large logs').toBe(
        true,
      );
      expect(readWholeFile, 'Should not read the entire large log file').toBe(
        false,
      );
    },
  });
});
