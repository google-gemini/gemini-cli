/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('Shell Efficiency', () => {
  evalTest('ALWAYS_PASSES', {
    name: 'should use --silent/--quiet flags when installing packages',
    prompt: 'Install the "lodash" package using npm.',
    assert: async (rig) => {
      const toolCalls = rig.readToolLogs();
      const shellCalls = toolCalls.filter(
        (call) => call.toolRequest.name === 'run_shell_command',
      );

      const hasEfficiencyFlag = shellCalls.some((call) => {
        let args = call.toolRequest.args;
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args);
          } catch (e) {
            // Ignore parse errors
          }
        }
        const cmd = typeof args === 'string' ? args : (args as any)['command'];
        return (
          cmd &&
          cmd.includes('npm install') &&
          (cmd.includes('--silent') ||
            cmd.includes('--quiet') ||
            cmd.includes('-q'))
        );
      });

      expect(
        hasEfficiencyFlag,
        `Expected agent to use efficiency flags for npm install. Commands used: ${shellCalls
          .map((c) => (c.toolRequest.args as any)['command'])
          .join(', ')}`,
      ).toBe(true);
    },
  });

  evalTest('ALWAYS_PASSES', {
    name: 'should use --no-pager with git commands',
    prompt: 'Show the git log.',
    assert: async (rig) => {
      const toolCalls = rig.readToolLogs();
      const shellCalls = toolCalls.filter(
        (call) => call.toolRequest.name === 'run_shell_command',
      );

      const hasNoPager = shellCalls.some((call) => {
        let args = call.toolRequest.args;
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args);
          } catch (e) {
            // Ignore parse errors
          }
        }
        const cmd = typeof args === 'string' ? args : (args as any)['command'];
        return cmd && cmd.includes('git') && cmd.includes('--no-pager');
      });

      expect(
        hasNoPager,
        `Expected agent to use --no-pager with git. Commands used: ${shellCalls
          .map((c) => (c.toolRequest.args as any)['command'])
          .join(', ')}`,
      ).toBe(true);
    },
  });

  evalTest('ALWAYS_PASSES', {
    name: 'should NOT use efficiency flags when enableShellOutputEfficiency is disabled',
    params: {
      settings: {
        tools: {
          shell: {
            enableShellOutputEfficiency: false,
          },
        },
      },
    },
    prompt: 'Install the "lodash" package using npm.',
    assert: async (rig) => {
      const toolCalls = rig.readToolLogs();
      const shellCalls = toolCalls.filter(
        (call) => call.toolRequest.name === 'run_shell_command',
      );

      const hasEfficiencyFlag = shellCalls.some((call) => {
        let args = call.toolRequest.args;
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args);
          } catch (e) {
            // Ignore parse errors
          }
        }
        const cmd = typeof args === 'string' ? args : (args as any)['command'];
        return (
          cmd &&
          cmd.includes('npm install') &&
          (cmd.includes('--silent') ||
            cmd.includes('--quiet') ||
            cmd.includes('-q'))
        );
      });

      expect(
        hasEfficiencyFlag,
        'Agent used efficiency flags even though enableShellOutputEfficiency was disabled',
      ).toBe(false);
    },
  });
});
