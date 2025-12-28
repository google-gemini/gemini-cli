/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { ReadTodosTool, type ReadTodosToolParams } from './read-todos.js';
import {
  resetTodoStateManager,
  getTodoStateManager,
} from './todo-state-manager.js';
import type { Config } from '../config/config.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

describe('ReadTodosTool', () => {
  let tempDir: string;
  let tool: ReadTodosTool;
  const signal = new AbortController().signal;

  const createMockConfig = (tempPath: string) =>
    ({
      storage: {
        getProjectTempDir: () => tempPath,
      },
    }) as unknown as Config;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'read-todos-test-'));
    tool = new ReadTodosTool(createMockConfig(tempDir));
    resetTodoStateManager();

    // Initialize state manager with some todos
    const stateManager = getTodoStateManager();
    await stateManager.initialize(tempDir);
    await stateManager.setTodos([
      { description: 'Task 1', status: 'completed' },
      { description: 'Task 2', status: 'in_progress' },
      { description: 'Task 3', status: 'pending' },
      { description: 'Task 4', status: 'cancelled' },
    ]);
  });

  afterEach(async () => {
    resetTodoStateManager();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('execute', () => {
    it('should return the full todo list', async () => {
      const params: ReadTodosToolParams = {};

      const result = await tool.buildAndExecute(params, signal);

      expect(result.llmContent).toContain('Current todo list');
      expect(result.llmContent).toContain('[completed] Task 1');
      expect(result.llmContent).toContain('[in_progress] Task 2');
      expect(result.llmContent).toContain('[pending] Task 3');
      expect(result.llmContent).toContain('[cancelled] Task 4');
    });

    it('should include statistics', async () => {
      const params: ReadTodosToolParams = {};

      const result = await tool.buildAndExecute(params, signal);

      expect(result.llmContent).toContain('Statistics');
      expect(result.llmContent).toContain('1/3 completed'); // 1 completed out of 3 active (excluding cancelled)
    });

    it('should indicate current task', async () => {
      const params: ReadTodosToolParams = {};

      const result = await tool.buildAndExecute(params, signal);

      expect(result.llmContent).toContain('Currently working on: Task 2');
    });

    it('should return empty message when no todos', async () => {
      const stateManager = getTodoStateManager();
      await stateManager.clearTodos();

      const params: ReadTodosToolParams = {};

      const result = await tool.buildAndExecute(params, signal);

      expect(result.llmContent).toContain('empty');
    });
  });

  describe('filtering', () => {
    it('should filter by pending status', async () => {
      const params: ReadTodosToolParams = {
        filter_status: 'pending',
      };

      const result = await tool.buildAndExecute(params, signal);

      expect(result.llmContent).toContain('pending');
      expect(result.llmContent).toContain('Task 3');
      expect(result.llmContent).not.toContain('[completed] Task 1');
    });

    it('should filter by completed status', async () => {
      const params: ReadTodosToolParams = {
        filter_status: 'completed',
      };

      const result = await tool.buildAndExecute(params, signal);

      expect(result.llmContent).toContain('completed');
      expect(result.llmContent).toContain('Task 1');
    });

    it('should filter by in_progress status', async () => {
      const params: ReadTodosToolParams = {
        filter_status: 'in_progress',
      };

      const result = await tool.buildAndExecute(params, signal);

      expect(result.llmContent).toContain('in_progress');
      expect(result.llmContent).toContain('Task 2');
    });

    it('should filter by cancelled status', async () => {
      const params: ReadTodosToolParams = {
        filter_status: 'cancelled',
      };

      const result = await tool.buildAndExecute(params, signal);

      expect(result.llmContent).toContain('cancelled');
      expect(result.llmContent).toContain('Task 4');
    });

    it('should show message when filter returns no results', async () => {
      const stateManager = getTodoStateManager();
      await stateManager.setTodos([
        { description: 'Only pending task', status: 'pending' },
      ]);

      const params: ReadTodosToolParams = {
        filter_status: 'completed',
      };

      const result = await tool.buildAndExecute(params, signal);

      expect(result.llmContent).toContain('No tasks with status "completed"');
    });
  });

  describe('validation', () => {
    it('should reject invalid filter_status', async () => {
      const params = {
        filter_status: 'invalid_status',
      } as unknown as ReadTodosToolParams;

      await expect(tool.buildAndExecute(params, signal)).rejects.toThrow(
        'must be equal to one of the allowed values',
      );
    });
  });

  describe('returnDisplay', () => {
    it('should return todos in returnDisplay', async () => {
      const params: ReadTodosToolParams = {};

      const result = await tool.buildAndExecute(params, signal);

      expect(result.returnDisplay).toHaveProperty('todos');
      expect((result.returnDisplay as { todos: unknown[] }).todos).toHaveLength(
        4,
      );
    });
  });
});
