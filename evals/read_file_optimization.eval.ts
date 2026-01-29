/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';
import { READ_FILE_TOOL_NAME } from '@google/gemini-cli-core';

describe('optimization_evals', () => {
  evalTest('ALWAYS_PASSES', {
    name: 'should use ranged read when specific line is targeted',
    files: {
      'linter_mess.ts': (() => {
        const lines = [];
        for (let i = 0; i < 4000; i++) {
          if (i === 3000) {
            lines.push(`var oldVar${i} = "needs fix";`);
          } else {
            lines.push(`const goodVar${i} = "clean";`);
          }
        }
        return lines.join('\n');
      })(),
    },
    prompt:
      'Fix the linter error on line 3000 of linter_mess.ts. The error is the use of "var".',
    assert: async (rig, result) => {
      const logs = rig.readToolLogs();

      // Check if the agent read the whole file
      const readCalls = logs.filter(
        (log) => log.toolRequest?.name === READ_FILE_TOOL_NAME,
      );
      expect(
        readCalls.length,
        'Agent should have used read_file to check context',
      ).toBeGreaterThan(0);

      let targetedReadFound = false;
      let totalLinesRead = 0;

      for (const call of readCalls) {
        const args = JSON.parse(call.toolRequest.args);
        if (args.file_path.includes('linter_mess.ts')) {
          totalLinesRead += args.limit ?? 4000;

          expect(
            args.limit,
            'Agent read the entire file (missing limit) instead of using ranged read',
          ).toBeDefined();

          expect(args.limit, 'Agent read too many lines at once').toBeLessThan(
            1000,
          );

          if (args.offset !== undefined && args.offset > 2000) {
            targetedReadFound = true;
          }
        }
      }

      // Ranged read shoud be frugal and just enough to satisfy the task at hand.
      expect(
        totalLinesRead,
        'Agent read more of the file than expected',
      ).toBeLessThan(500);

      expect(
        targetedReadFound,
        'Agent should have used offset to read around line 3000 at least once',
      ).toBe(true);
    },
  });
});
