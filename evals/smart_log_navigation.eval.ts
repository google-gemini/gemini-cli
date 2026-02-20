/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('Smart Log Navigation', () => {
  /**
   * Verifies that the agent uses tail or ranged read at the end of a massive log file.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should use smart log navigation for large log files',
    files: {
      'build.log': (() => {
        const lines = [];
        for (let i = 0; i < 2000; i++) {
          lines.push(`Log line ${i}: All good so far...`);
        }
        lines.push(
          'ERROR: The build failed at the very end because of a syntax error in main.ts',
        );
        return lines.join('\n');
      })(),
      'package.json': JSON.stringify({
        name: 'test-project',
        type: 'module',
      }),
    },
    prompt:
      'The build failed and logs are in build.log. Find the error at the end of the file and report it.',
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      // Check if it used tail or read_file with an offset/limit targeting the end
      const readCalls = toolLogs.filter(
        (log) =>
          (log.toolRequest.name === 'run_shell_command' &&
            (log.toolRequest.args.includes('tail') ||
              log.toolRequest.args.includes('grep'))) ||
          log.toolRequest.name === 'read_file',
      );

      const usedSmartNavigation = readCalls.some((log) => {
        if (log.toolRequest.name === 'run_shell_command') {
          const cmd = log.toolRequest.args.toLowerCase();
          return cmd.includes('tail') || cmd.includes('grep error');
        }
        if (log.toolRequest.name === 'read_file') {
          const args = JSON.parse(log.toolRequest.args);
          return args.offset !== undefined && args.offset >= 1000;
        }
        return false;
      });

      expect(
        usedSmartNavigation,
        'Agent should have used tail, grep, or a ranged read at the end of the large log file',
      ).toBe(true);
    },
  });
});
