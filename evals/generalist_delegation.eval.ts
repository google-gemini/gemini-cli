/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { appEvalTest } from './app-test-helper.js';

describe('generalist_delegation', () => {
  // --- Positive Evals (Should Delegate) ---

  appEvalTest('USUALLY_PASSES', {
    name: 'should delegate batch error fixing to generalist agent',
    configOverrides: {
      agents: {
        overrides: {
          generalist: { enabled: true },
        },
      },
      experimental: {
        enableAgents: true,
      },
      excludeTools: ['run_shell_command'],
    },
    files: {
      'file1.ts': 'console.log("no semi")',
      'file2.ts': 'console.log("no semi")',
      'file3.ts': 'console.log("no semi")',
      'file4.ts': 'console.log("no semi")',
      'file5.ts': 'console.log("no semi")',
      'file6.ts': 'console.log("no semi")',
      'file7.ts': 'console.log("no semi")',
      'file8.ts': 'console.log("no semi")',
      'file9.ts': 'console.log("no semi")',
      'file10.ts': 'console.log("no semi")',
    },
    prompt:
      'I have 10 files (file1.ts to file10.ts) that are missing semicolons. Can you fix them?',
    setup: async (rig) => {
      rig.setBreakpoint(['generalist']);
    },
    assert: async (rig) => {
      const confirmation = await rig.waitForPendingConfirmation(
        'generalist',
        60000,
      );
      expect(
        confirmation,
        'Expected a tool call for generalist agent',
      ).toBeTruthy();
      await rig.resolveTool(confirmation);
      await rig.waitForIdle(60000);
    },
  });

  appEvalTest('USUALLY_PASSES', {
    name: 'should autonomously delegate complex batch task to generalist agent',
    configOverrides: {
      agents: {
        overrides: {
          generalist: { enabled: true },
        },
      },
      experimental: {
        enableAgents: true,
      },
      excludeTools: ['run_shell_command'],
    },
    files: {
      'src/a.ts': 'export const a = 1;',
      'src/b.ts': 'export const b = 2;',
      'src/c.ts': 'export const c = 3;',
      'src/d.ts': 'export const d = 4;',
      'src/e.ts': 'export const e = 5;',
    },
    prompt:
      'Please update all files in the src directory. For each file, add a comment at the top that says "Processed by Gemini".',
    setup: async (rig) => {
      rig.setBreakpoint(['generalist']);
    },
    assert: async (rig) => {
      const confirmation = await rig.waitForPendingConfirmation(
        'generalist',
        60000,
      );
      expect(
        confirmation,
        'Expected autonomously delegate to generalist for batch task',
      ).toBeTruthy();
      await rig.resolveTool(confirmation);
      await rig.waitForIdle(60000);
    },
  });

  // --- Negative Evals (Should NOT Delegate - Assertive Handling) ---

  appEvalTest('USUALLY_PASSES', {
    name: 'should NOT delegate simple read and fix to generalist agent',
    configOverrides: {
      agents: {
        overrides: {
          generalist: { enabled: true },
        },
      },
      experimental: {
        enableAgents: true,
      },
      excludeTools: ['run_shell_command'],
    },
    files: {
      'README.md': 'This is a proyect.',
    },
    prompt:
      'There is a typo in README.md ("proyect"). Please fix it to "project".',
    setup: async (rig) => {
      // Break on everything to see what it calls
      rig.setBreakpoint(['*']);
    },
    assert: async (rig) => {
      await rig.drainBreakpointsUntilIdle((confirmation) => {
        expect(
          confirmation.toolName,
          `Agent should NOT have delegated to generalist.`,
        ).not.toBe('generalist');
      });

      const output = rig.getStaticOutput();
      expect(output).toMatch(/project/i);
    },
  });

  appEvalTest('USUALLY_PASSES', {
    name: 'should NOT delegate simple direct question to generalist agent',
    configOverrides: {
      agents: {
        overrides: {
          generalist: { enabled: true },
        },
      },
      experimental: {
        enableAgents: true,
      },
      excludeTools: ['run_shell_command'],
    },
    files: {
      'src/VERSION': '1.2.3',
    },
    prompt: 'Can you tell me the version number in the src folder?',
    setup: async (rig) => {
      rig.setBreakpoint(['*']);
    },
    assert: async (rig) => {
      await rig.drainBreakpointsUntilIdle((confirmation) => {
        expect(
          confirmation.toolName,
          `Agent should NOT have delegated to generalist.`,
        ).not.toBe('generalist');
      });

      const output = rig.getStaticOutput();
      expect(output).toMatch(/1\.2\.3/);
    },
  });
});
