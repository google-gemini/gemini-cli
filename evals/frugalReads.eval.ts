/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';
import { READ_FILE_TOOL_NAME, GREP_TOOL_NAME } from '@google/gemini-cli-core';

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

  /**
   * Ensures that the agent uses search_file_content effectively when searching
   * through large files, and refines its search or uses context to find the
   * correct match among many.
   */
  evalTest('ALWAYS_PASSES', {
    name: 'should use search_file_content with context and limits to find a needle in a haystack',
    files: (() => {
      const files: Record<string, string> = {};
      for (let f = 1; f <= 5; f++) {
        const lines = [];
        for (let i = 0; i < 2000; i++) {
          if (f === 3 && i === 1500) {
            lines.push('Pattern: TargetMatch');
            lines.push('Metadata: CORRECT_VALUE_42');
          } else if (i % 50 === 0) {
            lines.push('Pattern: TargetMatch');
            lines.push('Metadata: WRONG_VALUE');
          } else {
            lines.push(`Noise line ${i} in file ${f}`);
          }
        }
        files[`large_file_${f}.txt`] = lines.join('\n');
      }
      return files;
    })(),
    prompt:
      'Find the "Metadata" value associated with the "Pattern: TargetMatch" in the large_file_*.txt files. There are many such patterns, so you MUST set the "limit" parameter of search_file_content to 10 to avoid returning too many results. If you do not find the correct metadata (CORRECT_VALUE_42) in the first batch, refine your search or search file-by-file.',
    assert: async (rig) => {
      const logs = rig.readToolLogs();

      const grepCalls = logs.filter(
        (log) => log.toolRequest?.name === GREP_TOOL_NAME,
      );

      expect(
        grepCalls.length,
        'Agent should have used search_file_content to find the pattern',
      ).toBeGreaterThan(0);

      // Check that the agent used the limit parameter
      const usedLimit = grepCalls.some((call) => {
        const args = JSON.parse(call.toolRequest.args);
        return args.limit !== undefined && args.limit <= 20;
      });
      expect(usedLimit, 'Agent should have used the limit parameter').toBe(
        true,
      );

      // We expect the agent to eventually use context or refine the search.
      const usedContext = grepCalls.some((call) => {
        const args = JSON.parse(call.toolRequest.args);
        return (args.after ?? 0) > 0 || (args.context ?? 0) > 0;
      });

      const usedReadForContext = logs.some((log) => {
        if (log.toolRequest?.name !== READ_FILE_TOOL_NAME) return false;
        const args = JSON.parse(log.toolRequest.args);
        return (
          args.file_path.includes('large_file_3.txt') &&
          args.offset !== undefined
        );
      });

      expect(
        usedContext || usedReadForContext,
        'Agent should have used context (either via grep "after/context" or read_file) to find the metadata',
      ).toBe(true);
    },
  });
});
