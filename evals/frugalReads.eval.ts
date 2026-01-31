/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';
import { READ_FILE_TOOL_NAME } from '@google/gemini-cli-core';

describe('Frugal reads eval', () => {
  /**
   * Ensures that the agent is frugal in its use of context by relying
   * primarily on ranged reads when the line number is known. Smaller
   * context generally helps the agent to work more reliably for longer.
   */
  evalTest('ALWAYS_PASSES', {
    name: 'should use ranged read when specific line is targeted',
    files: {
      'package.json': JSON.stringify({
        name: 'test-project',
        version: '1.0.0',
        type: 'module',
      }),
      'eslint.config.mjs': `export default [
        {
          files: ["**/*.ts"],
          rules: {
            "no-var": "error"
          }
        }
      ];`,
      'linter_mess.ts': (() => {
        const lines = [];
        for (let i = 0; i < 4000; i++) {
          if (i === 1000 || i === 1040 || i === 3000) {
            lines.push(`var oldVar${i} = "needs fix";`);
          } else {
            lines.push(`const goodVar${i} = "clean";`);
          }
        }
        return lines.join('\n');
      })(),
    },
    prompt:
      'Fix all linter errors in linter_mess.ts manually by editing the file. Run eslint directly (using "npx --yes eslint") to find them. Do not run the file.',
    assert: async (rig) => {
      const logs = rig.readToolLogs();

      // Check if the agent read the whole file
      const readCalls = logs.filter(
        (log) => log.toolRequest?.name === READ_FILE_TOOL_NAME,
      );

      const targetFileReads = readCalls.filter((call) => {
        const args = JSON.parse(call.toolRequest.args);
        return args.file_path.includes('linter_mess.ts');
      });

      expect(
        targetFileReads.length,
        'Agent should have used read_file to check context',
      ).toBeGreaterThan(0);

      // We expect 2-3 ranges: one covering 1000/1040 (or two separate ones) and one for 3000
      // Some models re-verify their findings, so we relax this to 6.
      expect(
        targetFileReads.length,
        'Agent should have used ranged reads on the target file',
      ).toBeGreaterThanOrEqual(2);
      expect(
        targetFileReads.length,
        'Agent should have used ranged reads on the target file',
      ).toBeLessThanOrEqual(6);

      let totalLinesRead = 0;
      const readRanges: { offset: number; limit: number }[] = [];

      for (const call of targetFileReads) {
        const args = JSON.parse(call.toolRequest.args);
        // file_path check is redundant now but harmless
        const limit = args.limit ?? 4000;
        const offset = args.offset ?? 0;
        totalLinesRead += limit;
        readRanges.push({ offset, limit });

        expect(
          args.limit,
          'Agent read the entire file (missing limit) instead of using ranged read',
        ).toBeDefined();

        expect(args.limit, 'Agent read too many lines at once').toBeLessThan(
          1000,
        );
      }

      // Ranged read shoud be frugal and just enough to satisfy the task at hand.
      expect(
        totalLinesRead,
        'Agent read more of the file than expected',
      ).toBeLessThan(500);

      // Check that we read around the error lines
      const errorLines = [1000, 1040, 3000];
      for (const line of errorLines) {
        const covered = readRanges.some(
          (range) => line >= range.offset && line < range.offset + range.limit,
        );
        expect(covered, `Agent should have read around line ${line}`).toBe(
          true,
        );
      }
    },
  });
});
