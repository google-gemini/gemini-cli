/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { appEvalTest } from './app-test-helper.js';

describe.sequential('shell_error_recovery', () => {
  appEvalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: 'Agent recovers from failed shell command by diagnosing error output and retrying with corrected command',
    files: {
      'package.json': JSON.stringify({
        name: 'demo-app',
        version: '1.0.0',
        scripts: {
          'test:broken': 'exit 1',
          test: 'echo "Tests passed!"',
        },
      }),
    },
    prompt:
      'Run the project test suite by executing the shell command "npm run test:broken". When that command fails with a non-zero exit status, diagnose the failure output and retry using "npm test".',
    setup: async (rig) => {
      rig.setBreakpoint(['run_shell_command']);
    },
    assert: async (rig) => {
      const firstConfirmation = await rig.waitForPendingConfirmation(
        ['run_shell_command'],
        30000,
      );

      expect(
        firstConfirmation,
        'Expected initial run_shell_command confirmation',
      ).toBeDefined();
      expect(firstConfirmation.toolName).toBe('run_shell_command');

      await rig.resolveTool(firstConfirmation);

      // Wait until the initial failing tool execution completes and records its result
      await (rig as any).waitUntil(
        () => {
          const calls = (rig as any).getToolCalls();
          const call = calls.find(
            (c: any) =>
              c.request?.name === 'run_shell_command' &&
              JSON.stringify(c.request?.args ?? '').includes('test:broken'),
          );
          return Boolean(
            call?.response || call?.result || call?.status === 'error',
          );
        },
        {
          timeout: 30000,
          message: 'Timed out waiting for initial run_shell_command to execute',
        },
      );

      const toolCallsAfterFirst = (rig as any).getToolCalls();
      const firstCall = toolCallsAfterFirst.find(
        (call: any) => call.request?.name === 'run_shell_command',
      );
      expect(
        firstCall,
        'Expected first run_shell_command in tool logs',
      ).toBeDefined();

      const firstArgsStr = JSON.stringify(
        firstCall?.request?.args ?? {},
      ).toLowerCase();
      expect(
        firstArgsStr,
        'Initial shell command should execute the failing npm run test:broken script',
      ).toContain('test:broken');

      // Verify the first tool call completed with a structured non-zero exit status or error output
      const firstResponseStr = JSON.stringify(
        firstCall?.response ?? firstCall?.result ?? {},
      );

      const exitCodeMatch = firstResponseStr.match(/exit code:?\s*(\d+)/i);
      const exitCode = exitCodeMatch ? parseInt(exitCodeMatch[1], 10) : null;

      const showsFailure =
        firstCall?.status === 'error' ||
        (exitCode !== null && exitCode !== 0) ||
        /exit code:?\s*[1-9]/i.test(firstResponseStr) ||
        /command failed with exit code/i.test(firstResponseStr) ||
        /npm ERR!/i.test(firstResponseStr);

      expect(
        showsFailure,
        'First shell command must register a non-zero exit status (e.g. Exit Code: 1 or status: error) before retry',
      ).toBe(true);

      // Re-install breakpoint so the retry call produces a pending confirmation
      rig.setBreakpoint(['run_shell_command']);

      const secondConfirmation = await rig.waitForPendingConfirmation(
        ['run_shell_command'],
        30000,
      );

      expect(
        secondConfirmation,
        'Expected second run_shell_command confirmation for corrected command',
      ).toBeDefined();
      expect(secondConfirmation.toolName).toBe('run_shell_command');

      await rig.resolveTool(secondConfirmation);

      // Wait for the second shell command (npm test) to complete execution
      await (rig as any).waitUntil(
        () => {
          const calls = (rig as any).getToolCalls();
          const shellCalls = calls.filter(
            (c: any) => c.request?.name === 'run_shell_command',
          );
          const second = shellCalls[1];
          return Boolean(
            second?.response || second?.result || second?.status === 'success',
          );
        },
        {
          timeout: 30000,
          message: 'Timed out waiting for corrected shell command to execute',
        },
      );

      const toolCallsAfterSecond = (rig as any).getToolCalls();
      const shellCalls = toolCallsAfterSecond.filter(
        (call: any) => call.request?.name === 'run_shell_command',
      );
      expect(
        shellCalls.length,
        'Expected at least two run_shell_command calls during recovery',
      ).toBeGreaterThanOrEqual(2);

      const secondCall = shellCalls[1];
      const secondArgsStr = JSON.stringify(
        secondCall?.request?.args ?? {},
      ).toLowerCase();
      expect(
        secondArgsStr,
        'Subsequent shell command should execute the corrected npm test command',
      ).toContain('npm test');

      // Verify the corrected retry command executed successfully with 0 exit code
      const secondResponseStr = JSON.stringify(
        secondCall?.response ?? secondCall?.result ?? {},
      );
      const secondExitCodeMatch =
        secondResponseStr.match(/exit code:?\s*(\d+)/i);
      const secondExitCode = secondExitCodeMatch
        ? parseInt(secondExitCodeMatch[1], 10)
        : null;

      const secondSucceeded =
        secondCall?.status !== 'error' &&
        (secondExitCode === 0 ||
          secondResponseStr.includes('Tests passed!') ||
          (!/exit code:?\s*[1-9]/i.test(secondResponseStr) &&
            !/npm ERR!/i.test(secondResponseStr)));

      expect(
        secondSucceeded,
        'Corrected shell command (npm test) must execute successfully with a 0 exit status',
      ).toBe(true);

      await rig.waitForIdle(30000);
    },
  });
});
