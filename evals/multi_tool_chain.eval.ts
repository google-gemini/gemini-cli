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

describe('multi_tool_chain', () => {
  evalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: 'Agent uses search then targeted read then edit for a locate-and-fix task',
    files: {
      'src/utils/math.ts': [
        'export function add(a: number, b: number): number {',
        '  return a - b; // BUG: should be a + b',
        '}',
        '',
        'export function multiply(a: number, b: number): number {',
        '  return a * b;',
        '}',
      ].join('\n'),
      'src/utils/strings.ts': [
        'export function capitalize(str: string): string {',
        '  return str.charAt(0).toUpperCase() + str.slice(1);',
        '}',
      ].join('\n'),
      'src/index.ts': [
        'import { add } from "./utils/math.js";',
        '',
        'console.log(add(2, 3));',
      ].join('\n'),
    },
    prompt:
      'There is a bug in the add function somewhere in this project — it subtracts instead of adding. Find it using search, read the file to confirm, and fix the bug.',
    assert: async (rig) => {
      const logs = rig.readToolLogs();
      const toolNames = logs.map((log) => log.toolRequest?.name);

      // Agent should use a search tool to locate the bug
      const searchTools = ['grep_search', 'glob', 'list_directory'];
      const usedSearch = toolNames.some(
        (name) => name && searchTools.includes(name),
      );
      expect(
        usedSearch,
        'Agent should use grep_search, glob, or list_directory to locate the buggy file before reading it',
      ).toBe(true);

      // Agent should read the specific file containing the bug
      const readCalls = logs.filter(
        (log) => log.toolRequest?.name === 'read_file',
      );
      const readMathFile = readCalls.some((call) => {
        const args = safeParseArgs(call.toolRequest.args);
        return args.file_path?.includes('math.ts');
      });
      expect(
        readMathFile,
        'Agent should read the identified math.ts file to confirm the bug',
      ).toBe(true);

      // Agent should edit the file to fix the bug
      const editTools = [
        'replace_file_content',
        'full_file_rewrite',
        'write_file',
      ];
      const usedEdit = toolNames.some(
        (name) => name && editTools.includes(name),
      );
      expect(
        usedEdit,
        'Agent should use an edit tool to fix the bug in math.ts',
      ).toBe(true);

      // Verify the fix targeted the correct file
      const editCalls = logs.filter(
        (log) =>
          log.toolRequest?.name && editTools.includes(log.toolRequest.name),
      );
      const editedMathFile = editCalls.some((call) => {
        const args = safeParseArgs(call.toolRequest.args);
        return (
          args.file_path?.includes('math.ts') ||
          args.target_file?.includes('math.ts')
        );
      });
      expect(
        editedMathFile,
        'Agent should edit math.ts specifically, not other files',
      ).toBe(true);

      // Agent should NOT have read every file in the project (frugal context usage)
      const readStringsFile = readCalls.some((call) => {
        const args = safeParseArgs(call.toolRequest.args);
        return args.file_path?.includes('strings.ts');
      });
      expect(
        readStringsFile,
        'Agent should avoid reading unrelated files like strings.ts when search already identified math.ts',
      ).toBe(false);
    },
  });
});
