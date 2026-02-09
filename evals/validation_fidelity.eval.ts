/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('validation_fidelity', () => {
  evalTest('ALWAYS_PASSES', {
    name: 'should perform exhaustive validation autonomously when guided by system instructions',
    files: {
      'src/types.ts': `
export interface LogEntry {
  level: 'info' | 'warn' | 'error';
  message: string;
}
`,
      'src/logger.ts': `
import { LogEntry } from './types.js';

export function formatLog(entry: LogEntry): string {
  return \`[\${entry.level.toUpperCase()}] \${entry.message}\`;
}
`,
      'src/logger.test.ts': `
import { expect, test } from 'vitest';
import { formatLog } from './logger.js';
import { LogEntry } from './types.js';

test('formats log correctly', () => {
  const entry: LogEntry = { level: 'info', message: 'test message' };
  expect(formatLog(entry)).toBe('[INFO] test message');
});
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
    prompt:
      "Refactor the 'LogEntry' interface in 'src/types.ts' to rename the 'message' field to 'payload'.",
    timeout: 600000,
    assert: async (rig) => {
      // The goal of this eval is to see if the agent realizes it needs to update usages
      // AND run 'npm run build' or 'tsc' autonomously to ensure project-wide structural integrity.

      const toolLogs = rig.readToolLogs();
      const shellCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'run_shell_command',
      );

      const hasBuildOrTsc = shellCalls.some((log) => {
        const cmd = JSON.parse(log.toolRequest.args).command.toLowerCase();
        return (
          cmd.includes('npm run build') ||
          cmd.includes('tsc') ||
          cmd.includes('typecheck') ||
          cmd.includes('npm run verify')
        );
      });

      expect(
        hasBuildOrTsc,
        'Expected the agent to autonomously run a build or type-check command to verify the refactoring',
      ).toBe(true);
    },
  });
});
