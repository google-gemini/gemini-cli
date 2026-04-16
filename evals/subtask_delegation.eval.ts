/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { TRACKER_CREATE_TASK_TOOL_NAME } from '@google/gemini-cli-core';
import { evalTest, TEST_AGENTS } from './test-helper.js';

describe('subtask delegation eval test cases', () => {
  /**
   * Checks that the main agent can correctly decompose a complex, sequential
   * task into subtasks using the task tracker and delegate each to the appropriate expert subagent.
   *
   * The task requires:
   * 1. Reading requirements (researcher)
   * 2. Implementing logic (developer)
   * 3. Documenting (doc expert)
   */
  evalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: 'should delegate sequential subtasks to relevant experts using the task tracker',
    params: {
      settings: {
        experimental: {
          enableAgents: true,
          taskTracker: true,
        },
      },
    },
    prompt:
      'Please read the requirements in requirements.txt using a researcher, then implement the requested logic in src/logic.ts using a developer, and finally document the implementation in docs/logic.md using a documentation expert.',
    files: {
      '.gemini/agents/researcher.md': `---
name: researcher
description: Expert in reading files and extracting requirements.
tools:
  - read_file
---
You are the researcher. Read the provided file and extract requirements.`,
      '.gemini/agents/developer.md': `---
name: developer
description: Expert in implementing logic in TypeScript.
tools:
  - write_file
---
You are the developer. Implement the requested logic in the specified file.`,
      '.gemini/agents/doc-expert.md': `---
name: doc-expert
description: Expert in writing technical documentation.
tools:
  - write_file
---
You are the doc expert. Document the provided implementation clearly.`,
      'requirements.txt':
        'Implement a function named "calculateSum" that adds two numbers.',
    },
    assert: async (rig, _result) => {
      // Verify tracker tasks were created
      const wasCreateCalled = await rig.waitForToolCall(
        TRACKER_CREATE_TASK_TOOL_NAME,
      );
      expect(wasCreateCalled).toBe(true);

      const toolLogs = rig.readToolLogs();
      const createCalls = toolLogs.filter(
        (l) => l.toolRequest.name === TRACKER_CREATE_TASK_TOOL_NAME,
      );
      expect(createCalls.length).toBeGreaterThanOrEqual(3);

      await rig.expectToolCallSuccess([
        'researcher',
        'developer',
        'doc-expert',
      ]);

      const logicFile = rig.readFile('src/logic.ts');
      const docFile = rig.readFile('docs/logic.md');

      expect(logicFile).toContain('calculateSum');
      expect(docFile).toBeTruthy();
    },
  });

  /**
   * Checks that the main agent can delegate a batch of independent subtasks
   * to multiple subagents in parallel using the task tracker to manage state.
   */
  evalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: 'should delegate independent subtasks to specialists using the task tracker',
    params: {
      settings: {
        experimental: {
          enableAgents: true,
          taskTracker: true,
        },
      },
    },
    prompt:
      'Please update the project for internationalization (i18n), audit the security of the current code, and update the CSS to use a blue theme. Use specialized experts for each task.',
    files: {
      ...TEST_AGENTS.I18N_AGENT.asFile(),
      ...TEST_AGENTS.SECURITY_AGENT.asFile(),
      ...TEST_AGENTS.CSS_AGENT.asFile(),
      'index.ts': 'console.log("Hello World");',
    },
    assert: async (rig, _result) => {
      // Verify tracker tasks were created
      const wasCreateCalled = await rig.waitForToolCall(
        TRACKER_CREATE_TASK_TOOL_NAME,
      );
      expect(wasCreateCalled).toBe(true);

      const toolLogs = rig.readToolLogs();
      const createCalls = toolLogs.filter(
        (l) => l.toolRequest.name === TRACKER_CREATE_TASK_TOOL_NAME,
      );
      expect(createCalls.length).toBeGreaterThanOrEqual(3);

      await rig.expectToolCallSuccess([
        TEST_AGENTS.I18N_AGENT.name,
        TEST_AGENTS.SECURITY_AGENT.name,
        TEST_AGENTS.CSS_AGENT.name,
      ]);
    },
  });
});
