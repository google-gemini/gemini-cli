/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { appEvalTest } from './app-test-helper.js';

describe.sequential('activate_skill', () => {
  appEvalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: 'Agent activates behavioral-evals skill when asked about writing behavioral evaluations',
    files: {
      '.gemini/skills/behavioral-evals/SKILL.md': `---
name: behavioral-evals
description: Guidance for creating, running, fixing, and promoting behavioral evaluations. Use when verifying agent decision logic, debugging failures, debugging prompt steering, or adding workspace regression tests.
---
# Behavioral Evals
Workflow decision tree for creating, fixing, and promoting behavioral evaluations.`,
    },
    prompt:
      'I want to write a new behavioral evaluation test for verifying agent decision logic. What is the recommended workflow?',
    setup: async (rig) => {
      await rig.getConfig().reloadSkills();
      rig.setBreakpoint(['activate_skill']);
    },
    assert: async (rig) => {
      const confirmation = await rig.waitForPendingConfirmation(
        'activate_skill',
        30000,
      );
      expect(
        confirmation,
        'Expected activate_skill to be called',
      ).toBeDefined();

      const toolCalls = (rig as any).getToolCalls();
      const activateSkillCall = toolCalls.find(
        (call: any) => call.request?.name === 'activate_skill',
      );
      expect(
        activateSkillCall,
        'Expected activate_skill call in tool logs',
      ).toBeDefined();
      const argsString = activateSkillCall?.request?.args;
      const args = argsString ? JSON.parse(argsString) : undefined;
      expect(args?.name).toBe('behavioral-evals');

      // Resolve the tool to allow the turn to complete successfully
      await rig.resolveTool(confirmation);
      await rig.waitForIdle(30000);
    },
  });
});
