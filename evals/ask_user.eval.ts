/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { ApprovalMode, isRecord } from '@google/gemini-cli-core';
import { appEvalTest, type AppEvalCase } from './app-test-helper.js';
import { type EvalPolicy } from './test-helper.js';

function askUserEvalTest(policy: EvalPolicy, evalCase: AppEvalCase) {
  const existingGeneral = evalCase.configOverrides?.['general'];
  const generalBase = isRecord(existingGeneral) ? existingGeneral : {};

  return appEvalTest(policy, {
    ...evalCase,
    configOverrides: {
      ...evalCase.configOverrides,
      approvalMode: ApprovalMode.DEFAULT,
      general: {
        ...generalBase,
        enableAutoUpdate: false,
        enableAutoUpdateNotification: false,
      },
    },
    files: {
      ...evalCase.files,
    },
  });
}

describe('ask_user', () => {
  askUserEvalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: 'Agent uses AskUser tool to present multiple choice options',
    prompt: `Use the ask_user tool to ask me what my favorite color is. Provide 3 options: red, green, or blue.`,
    setup: async (rig) => {
      rig.setBreakpoint(['ask_user']);
    },
    assert: async (rig) => {
      const confirmation = await rig.waitForPendingConfirmation('ask_user');
      expect(
        confirmation,
        'Expected a pending confirmation for ask_user tool',
      ).toBeDefined();
    },
  });

  askUserEvalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: 'Agent uses AskUser tool to clarify ambiguous requirements',
    files: {
      'package.json': JSON.stringify({ name: 'my-app', version: '1.0.0' }),
    },
    prompt: `I want to build a new feature in this app. Ask me questions to clarify the requirements before proceeding.`,
    setup: async (rig) => {
      rig.setBreakpoint(['ask_user']);
    },
    assert: async (rig) => {
      const confirmation = await rig.waitForPendingConfirmation('ask_user');
      expect(
        confirmation,
        'Expected a pending confirmation for ask_user tool',
      ).toBeDefined();
    },
  });

  askUserEvalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: 'Agent uses AskUser tool before performing significant ambiguous rework',
    files: {
      'packages/core/src/index.ts': '// index\nexport const version = "1.0.0";',
      'packages/core/src/util.ts': '// util\nexport function help() {}',
      'packages/core/package.json': JSON.stringify({
        name: '@google/gemini-cli-core',
      }),
      'README.md': '# Gemini CLI',
    },
    prompt: `I want to completely rewrite the core package to support the upcoming V2 architecture, but I haven't decided what that looks like yet. We need to figure out the requirements first. Can you ask me some questions to help nail down the design?`,
    setup: async (rig) => {
      rig.setBreakpoint(['enter_plan_mode', 'ask_user']);
    },
    assert: async (rig) => {
      // It might call enter_plan_mode first.
      let confirmation = await rig.waitForPendingConfirmation([
        'enter_plan_mode',
        'ask_user',
      ]);
      expect(confirmation, 'Expected a tool call confirmation').toBeDefined();

      if (confirmation?.toolName === 'enter_plan_mode') {
        await rig.resolveTool('enter_plan_mode');
        confirmation = await rig.waitForPendingConfirmation('ask_user');
      }

      expect(
        confirmation?.toolName,
        'Expected ask_user to be called to clarify the significant rework',
      ).toBe('ask_user');
    },
  });

  // --- Regression Tests for Recent Fixes ---

  // Regression test for issue #20177: Ensure the agent does not use \`ask_user\` to
  // confirm shell commands. Fixed via prompt refinements and tool definition
  // updates to clarify that shell command confirmation is handled by the UI.
  // See fix: https://github.com/google-gemini/gemini-cli/pull/20504
  askUserEvalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: 'Agent does NOT use AskUser to confirm shell commands',
    files: {
      'package.json': JSON.stringify({
        scripts: { build: 'echo building' },
      }),
    },
    prompt: `Run 'npm run build' in the current directory.`,
    setup: async (rig) => {
      rig.setBreakpoint(['run_shell_command', 'ask_user']);
    },
    assert: async (rig) => {
      const confirmation = await rig.waitForPendingConfirmation([
        'run_shell_command',
        'ask_user',
      ]);

      expect(
        confirmation,
        'Expected a pending confirmation for a tool',
      ).toBeDefined();

      expect(
        confirmation?.toolName,
        'ask_user should not be called to confirm shell commands',
      ).toBe('run_shell_command');
    },
  });
});
