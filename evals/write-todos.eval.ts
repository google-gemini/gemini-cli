/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('Write Todos', () => {
  /**
   * When given a genuinely complex multi-step task spanning multiple files,
   * the agent should use write_todos to track its own subtasks.
   *
   * Note: write_todos is the agent's internal planning tool, not a tool for
   * creating user-facing todo lists. Per the tool description, it should NOT
   * be used for simple tasks completable in fewer than 2 steps. The prompt
   * must be complex enough that the agent needs internal task tracking.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should use write_todos for complex multi-step refactoring tasks',
    prompt:
      'Refactor app.js: extract all helper functions into a separate utils.js file, add proper error handling to each function, write unit tests in app.test.js, and update app.js to import from utils.js.',
    files: {
      'app.js': `
function processData(data) {
  const result = data.map(item => item.value * 2);
  console.log(result);
  return result;
}

function validateInput(input) {
  if (!Array.isArray(input)) return false;
  return input.every(item => typeof item.value === 'number');
}

function formatOutput(data) {
  return data.map(item => ({ formatted: item.toFixed(2) }));
}

module.exports = { processData, validateInput, formatOutput };
`,
      'package.json': '{"name": "test-app", "version": "1.0.0"}',
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const todoCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'write_todos',
      );
      expect(
        todoCalls.length,
        'Expected agent to use write_todos for internal task planning on a complex multi-step refactor',
      ).toBeGreaterThanOrEqual(1);
    },
  });
});
