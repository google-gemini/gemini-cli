/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { appEvalTest } from './app-test-helper.js';

describe.sequential('write_todos', () => {
  appEvalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: 'Agent uses write_todos to outline plan when asked to perform multi-step refactoring',
    files: {
      'src/utils.js': 'export function add(a, b) { return a + b; }',
      'src/math.js': 'export function multiply(a, b) { return a * b; }',
      'src/index.js':
        'import { add } from "./utils.js"; console.log(add(1, 2));',
    },
    configOverrides: {
      model: 'gemini-2.5-pro',
    },
    prompt:
      'We need a multi-step refactor: 1) add a divide function to src/utils.js, 2) export divide from src/math.js, 3) update src/index.js to use divide, and 4) add unit tests. Please organize the TODO list first using write_todos before writing code.',
    setup: async (rig) => {
      rig.setBreakpoint(['write_todos']);
    },
    assert: async (rig) => {
      const confirmation = await rig.waitForPendingConfirmation(
        ['write_todos'],
        30000,
      );

      expect(
        confirmation,
        'Expected write_todos tool call confirmation',
      ).toBeDefined();
      expect(
        confirmation.toolName,
        'Agent should call write_todos to track work items',
      ).toBe('write_todos');

      // Verify write_todos tool was called
      const toolCalls = (rig as any).getToolCalls();
      const writeTodosCall = toolCalls.find(
        (call: any) => call.request?.name === 'write_todos',
      );
      expect(
        writeTodosCall,
        'Expected write_todos call in tool logs',
      ).toBeDefined();
      const argsString = (writeTodosCall as any)?.request?.args;
      const args = argsString ? JSON.parse(argsString) : undefined;
      const todos = args?.todos;
      expect(Array.isArray(todos), 'Expected todos to be an array').toBe(true);
      expect(
        todos.length,
        'Expected at least 3 TODO items for a 4-step refactoring plan',
      ).toBeGreaterThanOrEqual(3);

      for (let i = 0; i < todos.length; i++) {
        const item = todos[i];
        const content =
          typeof item === 'string'
            ? item
            : (item?.description ?? item?.title ?? item?.content ?? '');
        expect(
          typeof content === 'string' && content.trim().length > 0,
          `TODO item ${i} must have non-empty content`,
        ).toBe(true);
      }

      const todoText = JSON.stringify(todos).toLowerCase();

      // Assert coverage for each of the four distinct requested refactoring operations
      expect(
        todoText.includes('divide') || todoText.includes('utils'),
        'TODO list must include divide function creation in utils',
      ).toBe(true);

      expect(
        (todoText.includes('export') ||
          todoText.includes('re-export') ||
          todoText.includes('reexport')) &&
          (todoText.includes('math') || todoText.includes('src/math')),
        'TODO list must explicitly include exporting divide from math module (src/math.js)',
      ).toBe(true);

      expect(
        todoText.includes('index'),
        'TODO list must include updating index.js',
      ).toBe(true);

      expect(
        todoText.includes('test'),
        'TODO list must include adding unit tests',
      ).toBe(true);

      await rig.resolveTool(confirmation);
      await rig.waitForIdle(30000);
    },
  });
});
