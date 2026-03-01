/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('Edits location eval', () => {
  /**
   * Ensure that Gemini CLI always updates existing test files, if present,
   * instead of creating a new one.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should update existing test file instead of creating a new one',
    files: {
      'package.json': JSON.stringify(
        {
          name: 'test-location-repro',
          version: '1.0.0',
          scripts: {
            test: 'vitest run',
          },
          devDependencies: {
            vitest: '^1.0.0',
            typescript: '^5.0.0',
          },
        },
        null,
        2,
      ),
      'src/math.ts': `
export function add(a: number, b: number): number {
  return a + b;
}

export function subtract(a: number, b: number): number {
  return a - b;
}

export function multiply(a: number, b: number): number {
  return a + b;
}
`,
      'src/math.test.ts': `
import { expect, test } from 'vitest';
import { add, subtract } from './math';

test('add adds two numbers', () => {
  expect(add(2, 3)).toBe(5);
});

test('subtract subtracts two numbers', () => {
  expect(subtract(5, 3)).toBe(2);
});
`,
      'src/utils.ts': `
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
`,
      'src/utils.test.ts': `
import { expect, test } from 'vitest';
import { capitalize } from './utils';

test('capitalize capitalizes the first letter', () => {
  expect(capitalize('hello')).toBe('Hello');
});
`,
    },
    prompt: 'Fix the bug in src/math.ts. Do not run the code.',
    timeout: 180000,
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const replaceCalls = toolLogs.filter(
        (t) => t.toolRequest.name === 'replace',
      );
      const writeFileCalls = toolLogs.filter(
        (t) => t.toolRequest.name === 'write_file',
      );

      expect(replaceCalls.length).toBeGreaterThan(0);
      expect(
        writeFileCalls.some((file) =>
          file.toolRequest.args.includes('.test.ts'),
        ),
      ).toBe(false);

      const targetFiles = replaceCalls.map((t) => {
        try {
          return JSON.parse(t.toolRequest.args).file_path;
        } catch {
          return null;
        }
      });

      console.log('DEBUG: targetFiles', targetFiles);

      expect(
        new Set(targetFiles).size,
        'Expected only two files changed',
      ).greaterThanOrEqual(2);
      expect(targetFiles.some((f) => f?.endsWith('src/math.ts'))).toBe(true);
      expect(targetFiles.some((f) => f?.endsWith('src/math.test.ts'))).toBe(
        true,
      );
    },
  });
});
