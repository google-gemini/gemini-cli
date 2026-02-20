/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('Fast-Path Validation', () => {
  /**
   * Verifies that the agent prioritizes fast-path validation (like tsc) during the incremental loop.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should prioritize fast-path validation after an edit',
    files: {
      'src/math.ts': 'export const add = (a: number, b: number) => a + b;',
      'package.json': JSON.stringify({
        name: 'test-project',
        type: 'module',
        scripts: {
          test: 'sleep 10 && vitest run', // Slow test
          typecheck: 'tsc --noEmit', // Fast path
          build: 'npm run typecheck && npm run test',
        },
      }),
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          target: 'ESNext',
          module: 'ESNext',
          moduleResolution: 'node',
          strict: true,
        },
      }),
    },
    prompt:
      'Update src/math.ts to include a "subtract" function. Verify your changes.',
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      const editIndex = toolLogs.findIndex(
        (log) =>
          (log.toolRequest.name === 'replace' ||
            log.toolRequest.name === 'write_file') &&
          log.toolRequest.args.includes('src/math.ts'),
      );

      expect(editIndex, 'Agent should have edited src/math.ts').toBeGreaterThan(
        -1,
      );

      // Check for fast-path validation (tsc or typecheck) after the edit
      const validationCalls = toolLogs.slice(editIndex + 1);
      const hasFastPath = validationCalls.some(
        (log) =>
          log.toolRequest.name === 'run_shell_command' &&
          (log.toolRequest.args.includes('tsc') ||
            log.toolRequest.args.includes('typecheck')),
      );

      expect(
        hasFastPath,
        'Agent should have used a fast-path validation tool (tsc or typecheck) immediately after the edit',
      ).toBe(true);
    },
  });
});
