/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

function safeParseArgs(argsStr: string): any {
  try {
    return JSON.parse(argsStr);
  } catch {
    return {};
  }
}

describe('context_safety', () => {
  evalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: 'Agent uses scoped search or ranged read instead of dumping a large file',
    files: {
      'server.log': (() => {
        const lines: string[] = [];
        for (let i = 1; i <= 2000; i++) {
          if (i === 1337) {
            lines.push(
              `[2026-08-15T10:42:${String(i % 60).padStart(2, '0')}Z] ERROR DatabaseConnectionError: ETIMEDOUT connecting to postgres:5432`,
            );
          } else if (i === 1338) {
            lines.push(
              `[2026-08-15T10:42:${String(i % 60).padStart(2, '0')}Z] ERROR Retry attempt 3 failed for query "SELECT * FROM users"`,
            );
          } else {
            lines.push(
              `[2026-08-15T10:42:${String(i % 60).padStart(2, '0')}Z] INFO  Request ${i} processed successfully in ${Math.floor(Math.random() * 200)}ms`,
            );
          }
        }
        return lines.join('\n');
      })(),
    },
    prompt:
      'Find all ERROR entries in server.log and summarize what went wrong. The file is very large so be efficient.',
    assert: async (rig) => {
      const logs = rig.readToolLogs();

      // Check if agent used grep_search to find errors efficiently
      const grepCalls = logs.filter(
        (log) => log.toolRequest?.name === 'grep_search',
      );
      const readCalls = logs.filter(
        (log) => log.toolRequest?.name === 'read_file',
      );

      const usedGrepForErrors = grepCalls.some((call) => {
        const args = safeParseArgs(call.toolRequest.args);
        return (
          args.query?.toLowerCase().includes('error') &&
          (args.file_path?.includes('server.log') ||
            args.dir_path !== undefined)
        );
      });

      // Check if agent used ranged reads (start_line/end_line) instead of full file reads
      const usedRangedRead = readCalls.some((call) => {
        const args = safeParseArgs(call.toolRequest.args);
        return (
          args.file_path?.includes('server.log') &&
          (args.start_line !== undefined || args.end_line !== undefined)
        );
      });

      // Check for unbounded full-file reads of the large log
      const unboundedLogReads = readCalls.filter((call) => {
        const args = safeParseArgs(call.toolRequest.args);
        return (
          args.file_path?.includes('server.log') &&
          args.start_line === undefined &&
          args.end_line === undefined
        );
      });

      // Agent should use grep_search OR ranged reads, not dump the whole file
      const usedEfficientApproach = usedGrepForErrors || usedRangedRead;
      expect(
        usedEfficientApproach,
        'Agent should use grep_search to find ERROR lines or ranged read_file with start_line/end_line, not dump the entire 2000-line log file',
      ).toBe(true);

      // If unbounded reads occurred, at least grep should have been used first
      if (unboundedLogReads.length > 0) {
        expect(
          usedGrepForErrors,
          'If agent reads the full log file, it should have first used grep_search to scope the problem',
        ).toBe(true);
      }
    },
  });
});
