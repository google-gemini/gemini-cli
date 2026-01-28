/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';
import { GREP_TOOL_NAME, READ_FILE_TOOL_NAME } from '@google/gemini-cli-core';

describe('optimization_evals', () => {
  evalTest('ALWAYS_PASSES', {
    name: 'should avoid reading entire file when fixing scattered linter issues',
    files: {
      'linter_mess.ts': (() => {
        const lines = [];
        for (let i = 0; i < 4000; i++) {
          if (i % 300 === 0) {
            lines.push(`var oldVar${i} = "needs fix";`); // 'var' is the "linter error"
          } else {
            lines.push(`const goodVar${i} = "clean";`);
          }
        }
        return lines.join('\n');
      })(),
    },
    prompt:
      'Start by searching for "var" in linter_mess.ts. Then, using the line numbers from the search results, read only the 5 lines of context around each match to verify safety before fixing.',
    assert: async (rig, result) => {
      const logs = rig.readToolLogs();

      // 1. Check if the agent read the whole file
      const readCalls = logs.filter(
        (log) => log.toolRequest?.name === READ_FILE_TOOL_NAME,
      );
      expect(
        readCalls.length,
        'Agent should have used read_file to check context',
      ).toBeGreaterThan(0);

      for (const call of readCalls) {
        const args = JSON.parse(call.toolRequest.args);
        if (args.file_path.includes('linter_mess.ts')) {
          // If limit is missing or undefined, it defaults to reading the whole file (or a very large chunk)
          // We want to force it to be specific.
          expect(
            args.limit,
            'Agent read the entire file (missing limit) instead of searching/partial reading',
          ).toBeDefined();

          // Even if defined, it shouldn't be the file size (4000)
          expect(args.limit, 'Agent read too many lines at once').toBeLessThan(
            1000,
          );
        }
      }

      // 2. Verify search was likely used (good behavior)
      const searchCalls = logs.filter(
        (log) => log.toolRequest?.name === GREP_TOOL_NAME,
      );
      expect(
        searchCalls.length,
        'Agent should have searched for "var" first',
      ).toBeGreaterThan(0);

      // 3. Verify the file content was actually updated (using read_file to check disk state from test rig)
      // Since we can't easily check disk state inside assert without 'fs', we rely on the tool execution logs or success.
      // But for this behavior test, the read pattern is the most important part.
    },
  });

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

      for (const call of readCalls) {
        const args = JSON.parse(call.toolRequest.args);
        if (args.file_path.includes('linter_mess.ts')) {
          expect(
            args.limit,
            'Agent read the entire file (missing limit) instead of using ranged read',
          ).toBeDefined();

          expect(args.limit, 'Agent read too many lines at once').toBeLessThan(
            1000,
          );

          // Since the error is at line 3000, efficient reading implies using an offset
          // unless they grep first (which is also fine, but less direct if line is known).
          // However, strict ranged read usually means offset is set.
          // We'll allow either grep OR offset usage.
          const hasOffset = args.offset !== undefined && args.offset > 2000;

          // If they didn't use offset, they better have searched first or read a small chunk?
          // Actually if they read line 0-1000, they won't find line 3000.
          // So if they read the file, they MUST have used offset to see line 3000 without reading the whole thing.
          expect(
            hasOffset,
            'Agent should use offset to read around line 3000',
          ).toBe(true);
        }
      }
    },
  });
});
