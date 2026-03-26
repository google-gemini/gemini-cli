/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';
import {
  READ_FILE_TOOL_NAME,
  EDIT_TOOL_NAME,
} from '@google/gemini-cli-core';

/* -------------------------------------------------------------------------- */
/*                                🧰 Helpers                                  */
/* -------------------------------------------------------------------------- */

const parseArgs = (call: any) => {
  try {
    return JSON.parse(call.toolRequest.args);
  } catch {
    throw new Error('Invalid JSON in toolRequest.args');
  }
};

const filterToolCalls = (logs: any[], toolName: string, file: string) =>
  logs.filter((log) => {
    if (log.toolRequest?.name !== toolName) return false;
    const args = parseArgs(log);
    return args.file_path?.includes(file);
  });

const generateMessFile = (
  size: number,
  errorIndices: number[],
): string => {
  return Array.from({ length: size }, (_, i) =>
    errorIndices.includes(i)
      ? `var oldVar${i} = "needs fix";`
      : `const goodVar${i} = "clean";`,
  ).join('\n');
};

/* -------------------------------------------------------------------------- */
/*                              🧪 Test Suite                                 */
/* -------------------------------------------------------------------------- */

describe('Frugal reads eval', () => {
  /**
   * 🧠 Goal:
   * Ensure agent groups nearby reads into minimal ranged reads
   */
  evalTest('USUALLY_PASSES', {
    name: 'uses minimal ranged reads for nearby errors',

    files: {
      'package.json': JSON.stringify({
        name: 'test-project',
        version: '1.0.0',
        type: 'module',
      }),

      'eslint.config.mjs': `export default [{
        files: ["**/*.ts"],
        rules: { "no-var": "error" }
      }];`,

      'linter_mess.ts': generateMessFile(1000, [500, 510, 520]),
    },

    prompt:
      'Fix all linter errors in linter_mess.ts manually. Use eslint (npx --yes eslint). Do not execute the file.',

    assert: async (rig) => {
      const logs = rig.readToolLogs();

      const reads = filterToolCalls(logs, READ_FILE_TOOL_NAME, 'linter_mess.ts');
      const edits = filterToolCalls(logs, EDIT_TOOL_NAME, 'linter_mess.ts');

      /* ---------- Read Assertions ---------- */

      expect(reads.length).toBeGreaterThan(0);
      expect(reads.length).toBeLessThanOrEqual(3); // frugal grouping

      const promptId = reads[0].toolRequest.prompt_id;
      expect(promptId).toBeDefined();

      expect(
        reads.every((r) => r.toolRequest.prompt_id === promptId),
      ).toBe(true);

      let totalLines = 0;
      const ranges: { start: number; end: number }[] = [];

      for (const call of reads) {
        const args = parseArgs(call);

        expect(args.end_line).toBeDefined(); // must use ranged read

        const start = args.start_line ?? 1;
        const end = args.end_line;

        const lines = end - start + 1;
        totalLines += lines;

        ranges.push({ start, end });

        expect(lines).toBeLessThan(1001); // not whole file
      }

      expect(totalLines).toBeLessThan(1000);

      /* ---------- Coverage Check ---------- */

      const errorLines = [500, 510, 520];

      for (const line of errorLines) {
        const covered = ranges.some(
          (r) => line >= r.start && line <= r.end,
        );
        expect(covered).toBe(true);
      }

      /* ---------- Edit Assertions ---------- */

      expect(edits.length).toBeGreaterThanOrEqual(3);
    },
  });

  /**
   * 🧠 Goal:
   * Ensure agent uses multiple ranged reads when targets are far apart
   */
  evalTest('USUALLY_PASSES', {
    name: 'uses separate ranged reads for distant errors',

    files: {
      'package.json': JSON.stringify({
        name: 'test-project',
        version: '1.0.0',
        type: 'module',
      }),

      'eslint.config.mjs': `export default [{
        files: ["**/*.ts"],
        rules: { "no-var": "error" }
      }];`,

      'far_mess.ts': generateMessFile(1000, [100, 900]),
    },

    prompt:
      'Fix all linter errors in far_mess.ts manually. Use eslint (npx --yes eslint). Do not execute the file.',

    assert: async (rig) => {
      const logs = rig.readToolLogs();

      const reads = filterToolCalls(logs, READ_FILE_TOOL_NAME, 'far_mess.ts');

      expect(reads.length).toBeGreaterThan(0);
      expect(reads.length).toBeLessThanOrEqual(4);

      for (const call of reads) {
        const args = parseArgs(call);
        expect(args.end_line).toBeDefined();
      }
    },
  });

  /**
   * 🧠 Goal:
   * Ensure agent reads full file when many scattered matches exist
   */
  evalTest('USUALLY_PASSES', {
    name: 'reads entire file for many scattered errors',

    files: {
      'package.json': JSON.stringify({
        name: 'test-project',
        version: '1.0.0',
        type: 'module',
      }),

      'eslint.config.mjs': `export default [{
        files: ["**/*.ts"],
        rules: { "no-var": "error" }
      }];`,

      'many_mess.ts': generateMessFile(
        1000,
        Array.from({ length: 10 }, (_, i) => i * 100),
      ),
    },

    prompt:
      'Fix all linter errors in many_mess.ts manually. Use eslint (npx --yes eslint). Do not execute the file.',

    assert: async (rig) => {
      const logs = rig.readToolLogs();

      const reads = filterToolCalls(
        logs,
        READ_FILE_TOOL_NAME,
        'many_mess.ts',
      );

      const edits = filterToolCalls(
        logs,
        EDIT_TOOL_NAME,
        'many_mess.ts',
      );

      expect(reads.length).toBeGreaterThan(0);

      const readFullFile = reads.some((call) => {
        const args = parseArgs(call);
        return args.end_line === undefined;
      });

      expect(readFullFile).toBe(true);

      expect(edits.length).toBeGreaterThanOrEqual(1);
    },
  });
});
