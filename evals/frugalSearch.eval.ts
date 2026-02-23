/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

/**
 * Evals to verify that the agent uses search tools efficiently (frugally)
 * by utilizing limiting parameters like `limit` and `max_matches_per_file`.
 * This ensures the agent doesn't flood the context window with unnecessary search results.
 */
describe('Frugal Search', () => {
  const getGrepParams = (call: any): any => {
    let args = call.toolRequest.args;
    if (typeof args === 'string') {
      try {
        args = JSON.parse(args);
      } catch (e) {
        // Ignore parse errors
      }
    }
    return args;
  };

  /**
   * Ensure that the agent makes use of either grep or ranged reads in fulfilling this task.
   * The task is specifically phrased to not evoke "view" or "search" specifically because
   * the model implicitly understands that such tasks are searches. This covers the case of
   * an unexpectedly large file benefitting from frugal approaches to viewing, like grep, or
   * ranged reads.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should use grep or ranged read for large files',
    prompt: 'What year was legacy_processor.ts written?',
    files: {
      'src/utils.ts': 'export const add = (a, b) => a + b;',
      'src/types.ts': 'export type ID = string;',
      'src/legacy_processor.ts': [
        '// Copyright 2005 Legacy Systems Inc.',
        ...Array.from(
          { length: 5000 },
          (_, i) =>
            `// Legacy code block ${i} - strictly preserved for backward compatibility`,
        ),
      ].join('\n'),
      'README.md': '# Project documentation',
    },
    assert: async (rig) => {
      const toolCalls = rig.readToolLogs();
      const getParams = (call: any) => {
        let args = call.toolRequest.args;
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args);
          } catch (e) {
            // Ignore parse errors
          }
        }
        return args;
      };

      // Check for wasteful full file reads
      const fullReads = toolCalls.filter((call) => {
        if (call.toolRequest.name !== 'read_file') return false;
        const args = getParams(call);
        return (
          args.file_path === 'src/legacy_processor.ts' &&
          (args.limit === undefined || args.limit === null)
        );
      });

      expect(
        fullReads.length,
        'Agent should not attempt to read the entire large file at once',
      ).toBe(0);

      // Check that it actually tried to find it using appropriate tools
      const validAttempts = toolCalls.filter((call) => {
        const args = getParams(call);
        if (call.toolRequest.name === 'grep_search') {
          return true;
        }

        if (
          call.toolRequest.name === 'read_file' &&
          args.file_path === 'src/legacy_processor.ts' &&
          args.limit !== undefined
        ) {
          return true;
        }
        return false;
      });

      expect(validAttempts.length).toBeGreaterThan(0);
    },
  });
});
