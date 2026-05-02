/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { WRITE_TODOS_TOOL_NAME } from '@google/gemini-cli-core';
import { evalTest } from './test-helper.js';

describe('Write Todos', () => {
  /**
   * When the user explicitly asks the agent to track tasks with write_todos,
   * the agent should use write_todos and populate it with meaningful items.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should use write_todos when asked to create a task list',
    prompt:
      'I have a multi-step task. Please use write_todos to track your progress as you work: (1) extract all helper functions from app.js into utils.js, (2) add error handling to each function, (3) write unit tests in app.test.js, (4) update app.js to import from utils.js.',
    files: {
      'app.js': `
function processData(data) {
  const result = data.map(item => item.value * 2);
  console.log(result);
  return result;
}
`,
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const todoCalls = toolLogs.filter(
        (log) => log.toolRequest.name === WRITE_TODOS_TOOL_NAME,
      );
      expect(
        todoCalls.length,
        'Expected agent to use write_todos for task tracking',
      ).toBeGreaterThanOrEqual(1);

      // Verify the todos capture meaningful task items, not just an empty list
      const lastTodoCall = todoCalls[todoCalls.length - 1];
      let args = lastTodoCall.toolRequest.args;
      if (typeof args === 'string') {
        try {
          args = JSON.parse(args);
        } catch {
          /* */
        }
      }
      const todos = Array.isArray(args?.todos) ? args.todos : [];
      expect(
        todos.length,
        'Expected write_todos to contain at least one task item',
      ).toBeGreaterThanOrEqual(1);
    },
  });

  /**
   * Hard case: a simple two-step task where write_todos should NOT be used.
   *
   * The tool description states write_todos should not be used for tasks
   * completable in fewer than two steps. This tests that the model correctly
   * skips write_todos for simple tasks -- a behavioral boundary that is easy
   * to regress if the model becomes overly eager to use planning tools.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should NOT use write_todos for a simple single-step task',
    prompt: 'Add a console.log("hello") line to the top of app.js.',
    files: {
      'app.js': `
function main() {
  return 42;
}
module.exports = { main };
`,
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const todoCalls = toolLogs.filter(
        (log) => log.toolRequest.name === WRITE_TODOS_TOOL_NAME,
      );
      expect(
        todoCalls.length,
        'Agent should not use write_todos for a simple single-step task',
      ).toBe(0);

      // But it should have made the edit
      const writeCalls = toolLogs.filter(
        (log) =>
          log.toolRequest.name === 'write_file' ||
          log.toolRequest.name === 'replace',
      );
      expect(
        writeCalls.length,
        'Expected agent to edit app.js',
      ).toBeGreaterThanOrEqual(1);
    },
  });
});
