/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { appEvalTest, AppEvalCase } from './app-test-helper.js';
import { EvalPolicy } from './test-helper.js';

/**
 * Default config override for ask_user tests
 */
const defaultConfig = {
  general: {
    approvalMode: 'default',
    enableAutoUpdate: false,
    enableAutoUpdateNotification: false,
  },
};

/**
 * Utility: Merge configs safely
 */
function mergeConfig(overrides?: AppEvalCase['configOverrides']) {
  return {
    ...overrides,
    general: {
      ...defaultConfig.general,
      ...overrides?.general,
    },
  };
}

/**
 * Wrapper for ask_user eval tests
 */
function askUserEvalTest(policy: EvalPolicy, evalCase: AppEvalCase) {
  return appEvalTest(policy, {
    ...evalCase,
    configOverrides: mergeConfig(evalCase.configOverrides),
    files: evalCase.files ?? {},
  });
}

/**
 * Utility: Expect tool confirmation exists
 */
async function expectToolCall(rig: any, tools: string | string[]) {
  const confirmation = await rig.waitForPendingConfirmation(tools);
  expect(confirmation, 'Expected a pending confirmation').toBeDefined();
  return confirmation;
}

/**
 * Utility: Ensure tool is ask_user
 */
function expectAskUser(confirmation: any, message?: string) {
  expect(
    confirmation?.toolName,
    message || 'Expected ask_user to be called',
  ).toBe('ask_user');
}

describe('ask_user', () => {
  // ---------- Core Behavior Tests ----------

  askUserEvalTest('USUALLY_PASSES', {
    name: 'Uses ask_user for multiple choice input',
    prompt: `Use the ask_user tool to ask my favorite color with options: red, green, blue.`,
    setup: async (rig) => rig.setBreakpoint(['ask_user']),
    assert: async (rig) => {
      const confirmation = await expectToolCall(rig, 'ask_user');
      expectAskUser(confirmation);
    },
  });

  askUserEvalTest('USUALLY_PASSES', {
    name: 'Uses ask_user for requirement clarification',
    files: {
      'package.json': JSON.stringify({ name: 'my-app', version: '1.0.0' }),
    },
    prompt: `I want to build a feature. Ask clarifying questions before proceeding.`,
    setup: async (rig) => rig.setBreakpoint(['ask_user']),
    assert: async (rig) => {
      const confirmation = await expectToolCall(rig, 'ask_user');
      expectAskUser(confirmation);
    },
  });

  askUserEvalTest('USUALLY_PASSES', {
    name: 'Uses ask_user before major ambiguous rework',
    files: {
      'packages/core/src/index.ts': 'export const version = "1.0.0";',
      'packages/core/src/util.ts': 'export function help() {}',
      'packages/core/package.json': JSON.stringify({
        name: '@google/gemini-cli-core',
      }),
      'README.md': '# Gemini CLI',
    },
    prompt: `I want to rewrite the core package for V2 but requirements are unclear. Ask questions first.`,
    setup: async (rig) =>
      rig.setBreakpoint(['enter_plan_mode', 'ask_user']),
    assert: async (rig) => {
      let confirmation = await expectToolCall(rig, [
        'enter_plan_mode',
        'ask_user',
      ]);

      // Handle intermediate planning step
      if (confirmation?.toolName === 'enter_plan_mode') {
        rig.acceptConfirmation('enter_plan_mode');
        confirmation = await expectToolCall(rig, 'ask_user');
      }

      expectAskUser(
        confirmation,
        'Expected ask_user to clarify major rework',
      );
    },
  });

  // ---------- Regression Tests ----------

  askUserEvalTest('USUALLY_PASSES', {
    name: 'Does NOT use ask_user for shell command confirmation',
    files: {
      'package.json': JSON.stringify({
        scripts: { build: 'echo building' },
      }),
    },
    prompt: `Run 'npm run build' in the current directory.`,
    setup: async (rig) =>
      rig.setBreakpoint(['run_shell_command', 'ask_user']),
    assert: async (rig) => {
      const confirmation = await expectToolCall(rig, [
        'run_shell_command',
        'ask_user',
      ]);

      expect(
        confirmation?.toolName,
        'ask_user should not be used for shell command confirmation',
      ).toBe('run_shell_command');
    },
  });
});
