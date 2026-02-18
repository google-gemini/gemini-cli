/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';
import { READ_FILE_TOOL_NAME, EDIT_TOOL_NAME } from '@google/gemini-cli-core';

describe('Frugal reads eval', () => {
  /**
   * Ensures that the agent is frugal in its use of context by relying
   * primarily on ranged reads when the line number is known, and combining
   * nearby ranges into a single contiguous read to save tool calls.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should use ranged read when nearby lines are targeted',
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
        for (let i = 0; i < 1000; i++) {
          if (i === 500 || i === 510 || i === 520) {
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

      // We expect 1-3 ranges in a single turn.
      expect(
        targetFileReads.length,
        'Agent should have used 1-3 ranged reads for near errors',
      ).toBeLessThanOrEqual(3);

      const firstPromptId = targetFileReads[0].toolRequest.prompt_id;
      expect(firstPromptId, 'Prompt ID should be defined').toBeDefined();
      expect(
        targetFileReads.every(
          (call) => call.toolRequest.prompt_id === firstPromptId,
        ),
        'All reads should have happened in the same turn',
      ).toBe(true);

      let totalLinesRead = 0;
      const readRanges: { offset: number; limit: number }[] = [];

      for (const call of targetFileReads) {
        const args = JSON.parse(call.toolRequest.args);

        expect(
          args.limit,
          'Agent read the entire file (missing limit) instead of using ranged read',
        ).toBeDefined();

        const limit = args.limit;
        const offset = args.offset ?? 0;
        totalLinesRead += limit;
        readRanges.push({ offset, limit });

        expect(args.limit, 'Agent read too many lines at once').toBeLessThan(
          1001,
        );
      }

      // Ranged read shoud be frugal and just enough to satisfy the task at hand.
      expect(
        totalLinesRead,
        'Agent read more of the file than expected',
      ).toBeLessThan(1000);

      // Check that we read around the error lines
      const errorLines = [500, 510, 520];
      for (const line of errorLines) {
        const covered = readRanges.some(
          (range) => line >= range.offset && line < range.offset + range.limit,
        );
        expect(covered, `Agent should have read around line ${line}`).toBe(
          true,
        );
      }

      const editCalls = logs.filter(
        (log) => log.toolRequest?.name === EDIT_TOOL_NAME,
      );
      const targetEditCalls = editCalls.filter((call) => {
        const args = JSON.parse(call.toolRequest.args);
        return args.file_path.includes('linter_mess.ts');
      });
      expect(
        targetEditCalls.length,
        'Agent should have made replacement calls on the target file',
      ).toBeGreaterThanOrEqual(3);
    },
  });

  /**
   * Ensures the agent uses multiple ranged reads when the targets are far
   * apart to avoid the need to read the whole file.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should use ranged read when targets are far apart',
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
      'far_mess.ts': (() => {
        const lines = [];
        for (let i = 0; i < 1000; i++) {
          if (i === 100 || i === 900) {
            lines.push(`var oldVar${i} = "needs fix";`);
          } else {
            lines.push(`const goodVar${i} = "clean";`);
          }
        }
        return lines.join('\n');
      })(),
    },
    prompt:
      'Fix all linter errors in far_mess.ts manually by editing the file. Run eslint directly (using "npx --yes eslint") to find them. Do not run the file.',
    assert: async (rig) => {
      const logs = rig.readToolLogs();

      const readCalls = logs.filter(
        (log) => log.toolRequest?.name === READ_FILE_TOOL_NAME,
      );

      const targetFileReads = readCalls.filter((call) => {
        const args = JSON.parse(call.toolRequest.args);
        return args.file_path.includes('far_mess.ts');
      });

      // The agent should use ranged reads to be frugal with context tokens,
      // even if it requires multiple calls for far-apart errors.
      expect(
        targetFileReads.length,
        'Agent should have used read_file to check context',
      ).toBeGreaterThan(0);

      // We allow multiple calls since the errors are far apart.
      expect(
        targetFileReads.length,
        'Agent should have used separate reads for far apart errors',
      ).toBeLessThanOrEqual(4);

      for (const call of targetFileReads) {
        const args = JSON.parse(call.toolRequest.args);
        expect(
          args.limit,
          'Agent should have used ranged read (limit) to save tokens',
        ).toBeDefined();
      }
    },
  });

  /**
   * Validates that the agent reads the entire file if there are lots of matches
   * (e.g.: 10), as it's more efficient than many small ranged reads.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should read the entire file when there are many matches',
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
      'many_mess.ts': (() => {
        const lines = [];
        for (let i = 0; i < 1000; i++) {
          if (i % 100 === 0) {
            lines.push(`var oldVar${i} = "needs fix";`);
          } else {
            lines.push(`const goodVar${i} = "clean";`);
          }
        }
        return lines.join('\n');
      })(),
    },
    prompt:
      'Fix all linter errors in many_mess.ts manually by editing the file. Run eslint directly (using "npx --yes eslint") to find them. Do not run the file.',
    assert: async (rig) => {
      const logs = rig.readToolLogs();

      const readCalls = logs.filter(
        (log) => log.toolRequest?.name === READ_FILE_TOOL_NAME,
      );

      const targetFileReads = readCalls.filter((call) => {
        const args = JSON.parse(call.toolRequest.args);
        return args.file_path.includes('many_mess.ts');
      });

      expect(
        targetFileReads.length,
        'Agent should have used read_file to check context',
      ).toBeGreaterThan(0);

      // In this case, we expect the agent to realize there are many scattered errors
      // and just read the whole file to be efficient with tool calls.
      const readEntireFile = targetFileReads.some((call) => {
        const args = JSON.parse(call.toolRequest.args);
        return args.limit === undefined;
      });

      expect(
        readEntireFile,
        'Agent should have read the entire file because of the high number of scattered matches',
      ).toBe(true);

      // Check that the agent actually fixed the errors
      const editCalls = logs.filter(
        (log) => log.toolRequest?.name === EDIT_TOOL_NAME,
      );
      const targetEditCalls = editCalls.filter((call) => {
        const args = JSON.parse(call.toolRequest.args);
        return args.file_path.includes('many_mess.ts');
      });
      expect(
        targetEditCalls.length,
        'Agent should have made replacement calls on the target file',
      ).toBeGreaterThanOrEqual(1);
    },
  });
});
