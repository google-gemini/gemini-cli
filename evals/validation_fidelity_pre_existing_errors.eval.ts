/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

function parseToolArgs(args: unknown): Record<string, any> | null {
  if (args && typeof args === 'object') {
    return args as Record<string, any>;
  }
  if (typeof args === 'string') {
    try {
      return JSON.parse(args) as Record<string, any>;
    } catch {
      return null;
    }
  }
  return null;
}

describe('validation_fidelity_pre_existing_errors', () => {
  evalTest('USUALLY_PASSES', {
    name: 'should handle pre-existing project errors gracefully during validation',
    files: {
      'src/math.ts': `
export function add(a: number, b: number): number {
  return a + b;
}
`,
      'src/index.ts': `
import { add } from './math.js';
console.log(add(1, 2));
`,
      'src/utils.ts': `
export function multiply(a: number, b: number): number {
  return a * c; // 'c' is not defined - PRE-EXISTING ERROR
}
`,
      'package.json': JSON.stringify({
        name: 'test-project',
        type: 'module',
        scripts: {
          test: 'vitest run',
          build: 'tsc --noEmit',
        },
      }),
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          target: 'ESNext',
          module: 'ESNext',
          moduleResolution: 'node',
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true,
        },
      }),
    },
    prompt: "In src/math.ts, rename the 'add' function to 'sum'.",
    timeout: 600000,
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const replaceCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'replace',
      );

      // Verify it did the work in math.ts
      const mathRefactor = replaceCalls.some((log) => {
        const args = parseToolArgs(log.toolRequest.args);
        if (!args) {
          return false;
        }
        return (
          typeof args.file_path === 'string' &&
          args.file_path.endsWith('src/math.ts') &&
          typeof args.new_string === 'string' &&
          args.new_string.includes('sum')
        );
      });
      expect(mathRefactor, 'Agent should have refactored math.ts').toBe(true);

      const shellCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'run_shell_command',
      );
      const ranValidation = shellCalls.some((log) => {
        const args = parseToolArgs(log.toolRequest.args);
        const cmd =
          typeof args?.command === 'string' ? args.command.toLowerCase() : '';
        return cmd.includes('build') || cmd.includes('tsc');
      });

      expect(ranValidation, 'Agent should have attempted validation').toBe(
        true,
      );
    },
  });
});
