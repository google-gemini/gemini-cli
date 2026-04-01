/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('Context efficiency', () => {
  /**
   * Ensures the agent uses grep/search to locate relevant code in a large
   * project instead of reading every file. When asked about a specific
   * function, the agent should search first, then read only the relevant
   * file(s).
   */
  evalTest('USUALLY_PASSES', {
    name: 'uses search before reading in a multi-file project',
    prompt:
      'What does the calculateTotal function do? Find it and explain its logic.',
    files: {
      'src/index.ts': 'export { run } from "./runner.js";\n',
      'src/runner.ts':
        'export function run() { console.log("running"); }\n',
      'src/utils.ts': (() => {
        const lines = [];
        for (let i = 0; i < 200; i++) {
          lines.push(`export const helper${i} = () => ${i};`);
        }
        return lines.join('\n');
      })(),
      'src/billing.ts': (() => {
        const lines = [];
        for (let i = 0; i < 100; i++) {
          lines.push(`// billing line ${i}`);
        }
        lines.push(
          'export function calculateTotal(items: {price: number; qty: number}[]) {',
        );
        lines.push(
          '  return items.reduce((sum, item) => sum + item.price * item.qty, 0);',
        );
        lines.push('}');
        return lines.join('\n');
      })(),
      'src/auth.ts': (() => {
        const lines = [];
        for (let i = 0; i < 150; i++) {
          lines.push(`// auth placeholder line ${i}`);
        }
        return lines.join('\n');
      })(),
    },
    assert: async (rig, result) => {
      const toolLogs = rig.readToolLogs();

      // Agent should have used a search tool to locate the function.
      const searchCalls = toolLogs.filter(
        (log) =>
          log.toolRequest?.name === 'grep_search' ||
          log.toolRequest?.name === 'file_search' ||
          log.toolRequest?.name === 'run_shell_command',
      );
      expect(
        searchCalls.length,
        'Agent should use search tools to locate the function',
      ).toBeGreaterThan(0);

      // Agent should mention billing.ts or calculateTotal in its response.
      expect(
        result,
        'Agent should find and explain calculateTotal',
      ).toMatch(/calculateTotal|billing|price|qty|reduce|sum|total/i);
    },
  });

  /**
   * Ensures the agent does not re-read a file it has already read in a
   * multi-step task. When explicitly told the content, it should work from
   * memory rather than issuing redundant read_file calls.
   */
  evalTest('USUALLY_PASSES', {
    name: 'avoids redundant file reads within a single task',
    prompt:
      'Read config.json, then tell me both the project name and the port number from it.',
    files: {
      'config.json': JSON.stringify(
        {
          name: 'my-awesome-app',
          port: 8080,
          debug: false,
          version: '2.1.0',
        },
        null,
        2,
      ),
    },
    assert: async (rig, result) => {
      const toolLogs = rig.readToolLogs();
      const readCalls = toolLogs.filter((log) => {
        if (log.toolRequest?.name !== 'read_file') return false;
        const args =
          typeof log.toolRequest.args === 'string'
            ? log.toolRequest.args
            : JSON.stringify(log.toolRequest.args);
        return args.includes('config.json');
      });

      // Agent should have read the file at least once.
      expect(
        readCalls.length,
        'Agent should read config.json at least once',
      ).toBeGreaterThanOrEqual(1);

      // Agent should NOT read the same file more than twice.
      expect(
        readCalls.length,
        'Agent should not redundantly re-read config.json',
      ).toBeLessThanOrEqual(2);

      // Agent should answer with both values.
      expect(result, 'Agent should report the project name').toMatch(
        /my-awesome-app/i,
      );
      expect(result, 'Agent should report the port number').toMatch(/8080/);
    },
  });
});
