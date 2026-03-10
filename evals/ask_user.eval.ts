/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('ask_user', () => {
  evalTest('USUALLY_PASSES', {
    name: 'Agent uses AskUser tool to present multiple choice options',
    prompt: `Use the ask_user tool to ask me what my favorite color is. Provide 3 options: red, green, or blue.`,
    assert: async (rig) => {
      const wasToolCalled = await rig.waitForToolCall('ask_user');
      expect(wasToolCalled, 'Expected ask_user tool to be called').toBe(true);
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'Agent uses AskUser tool to clarify ambiguous requirements',
    files: {
      'package.json': JSON.stringify({ name: 'my-app', version: '1.0.0' }),
    },
    prompt: `I want to build a new feature in this app. Ask me questions to clarify the requirements before proceeding.`,
    assert: async (rig) => {
      const wasToolCalled = await rig.waitForToolCall('ask_user');
      expect(wasToolCalled, 'Expected ask_user tool to be called').toBe(true);
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'Agent uses AskUser tool before performing significant ambiguous rework',
    files: {
      'packages/core/src/index.ts': '// index\nexport const version = "1.0.0";',
      'packages/core/src/util.ts': '// util\nexport function help() {}',
      'packages/core/package.json': JSON.stringify({
        name: '@google/gemini-cli-core',
      }),
      'README.md': '# Gemini CLI',
    },
    prompt: `Refactor the entire core package to be better.`,
    assert: async (rig) => {
      const wasPlanModeCalled = await rig.waitForToolCall('enter_plan_mode');
      expect(wasPlanModeCalled, 'Expected enter_plan_mode to be called').toBe(
        true,
      );

      const wasAskUserCalled = await rig.waitForToolCall('ask_user');
      expect(
        wasAskUserCalled,
        'Expected ask_user tool to be called to clarify the significant rework',
      ).toBe(true);
    },
  });

  // --- Regression Tests for Recent Fixes ---

  // Regression test for issue #20177: Ensure the agent does not use `ask_user` to
  // confirm shell commands. Fixed via prompt refinements and tool definition
  // updates to clarify that shell command confirmation is handled by the UI.
  // See fix: https://github.com/google-gemini/gemini-cli/pull/20504
  evalTest('USUALLY_PASSES', {
    name: 'Agent does NOT use AskUser to confirm shell commands',
    files: {
      'package.json': JSON.stringify({
        scripts: { build: 'echo building' },
      }),
    },
    prompt: `Run 'npm run build' in the current directory.`,
    assert: async (rig) => {
      await rig.waitForTelemetryReady();

      const toolLogs = rig.readToolLogs();
      const wasShellCalled = toolLogs.some(
        (log) => log.toolRequest.name === 'run_shell_command',
      );
      const wasAskUserCalled = toolLogs.some(
        (log) => log.toolRequest.name === 'ask_user',
      );

      expect(
        wasShellCalled,
        'Expected run_shell_command tool to be called',
      ).toBe(true);
      expect(
        wasAskUserCalled,
        'ask_user should not be called to confirm shell commands',
      ).toBe(false);
    },
  });
});
