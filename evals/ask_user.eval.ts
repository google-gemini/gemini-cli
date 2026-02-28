/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('ask_user', () => {
  evalTest('USUALLY_PASSES', {
    name: 'Agent uses AskUser tool when explicitly instructed',
    prompt: `Please ask me what my favorite color is. Provide 3 options: red, green, or blue.`,
    assert: async (rig) => {
      const wasToolCalled = await rig.waitForToolCall('ask_user');
      expect(wasToolCalled, 'Expected ask_user tool to be called').toBe(true);
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'Agent uses AskUser tool to clarify ambiguous requirements',
    prompt: `I want to build a new web app. Ask me questions to clarify the framework and styling preferences before proceeding.`,
    assert: async (rig) => {
      const wasToolCalled = await rig.waitForToolCall('ask_user');
      expect(wasToolCalled, 'Expected ask_user tool to be called').toBe(true);
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'Agent uses AskUser tool before performing significant ambiguous rework',
    prompt: `Refactor the entire core package to be better.`,
    assert: async (rig) => {
      const wasToolCalled = await rig.waitForToolCall('ask_user');
      expect(
        wasToolCalled,
        'Expected ask_user tool to be called to clarify the significant rework',
      ).toBe(true);
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'Agent does NOT use AskUser to confirm shell commands',
    prompt: `Run 'npm run build' in the current directory.`,
    assert: async (rig) => {
      const wasShellCalled = await rig.waitForToolCall('run_shell_command');
      expect(
        wasShellCalled,
        'Expected run_shell_command tool to be called',
      ).toBe(true);

      await rig.waitForTelemetryReady();
      const wasAskUserCalled = rig
        .readToolLogs()
        .some((log) => log.toolRequest.name === 'ask_user');
      expect(
        wasAskUserCalled,
        'ask_user should not be called to confirm shell commands',
      ).toBe(false);
    },
  });
});
