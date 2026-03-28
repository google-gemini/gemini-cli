/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest, safeParseArgs } from './test-helper.js';

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
        const args = safeParseArgs<{ file_path?: string; new_string?: string }>(
          log.toolRequest.args,
        );
        return (
          args?.file_path?.endsWith('src/math.ts') &&
          args?.new_string?.includes('sum')
        );
      });
      expect(mathRefactor, 'Agent should have refactored math.ts').toBe(true);

      const shellCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'run_shell_command',
      );
      const ranValidation = shellCalls.some((log) => {
        const args = safeParseArgs<{ command?: string }>(log.toolRequest.args);
        if (!args?.command) return false;
        return (
          args.command.toLowerCase().includes('build') ||
          args.command.toLowerCase().includes('tsc')
        );
      });

      expect(ranValidation, 'Agent should have attempted validation').toBe(
        true,
      );
    },
  });
});
