/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { ManageTodosTool, type ManageTodosToolParams } from './manage-todos.js';
import {
  resetTodoStateManager,
  getTodoStateManager,
} from './todo-state-manager.js';
import type { Config } from '../config/config.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

describe('ManageTodosTool', () => {
  let tempDir: string;
  let tool: ManageTodosTool;
  const signal = new AbortController().signal;

  const createMockConfig = (tempPath: string) =>
    ({
      storage: {
        getProjectTempDir: () => tempPath,
      },
    }) as unknown as Config;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manage-todos-test-'));
    tool = new ManageTodosTool(createMockConfig(tempDir));
    resetTodoStateManager();
  });

  afterEach(async () => {
    resetTodoStateManager();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('validation', () => {
    it('should reject missing operation', async () => {
      const params = {} as unknown as ManageTodosToolParams;
      await expect(tool.buildAndExecute(params, signal)).rejects.toThrow();
    });

    it('should reject add without description', async () => {
      const params: ManageTodosToolParams = {
        operation: 'add',
      };
      await expect(tool.buildAndExecute(params, signal)).rejects.toThrow(
        '"description" parameter is required',
      );
    });

    it('should reject update_status without index', async () => {
      const params: ManageTodosToolParams = {
        operation: 'update_status',
        status: 'completed',
      };
      await expect(tool.buildAndExecute(params, signal)).rejects.toThrow(
        '"index" parameter must be a positive integer',
      );
    });

    it('should reject update_status without status', async () => {
      const params: ManageTodosToolParams = {
        operation: 'update_status',
        index: 1,
      };
      await expect(tool.buildAndExecute(params, signal)).rejects.toThrow(
        '"status" parameter is required',
      );
    });

    it('should reject complete without index', async () => {
      const params: ManageTodosToolParams = {
        operation: 'complete',
      };
      await expect(tool.buildAndExecute(params, signal)).rejects.toThrow(
        '"index" parameter must be a positive integer',
      );
    });
  });

  describe('add operation', () => {
    it('should add a new todo', async () => {
      const params: ManageTodosToolParams = {
        operation: 'add',
        description: 'New task',
      };

      const result = await tool.buildAndExecute(params, signal);

      expect(result.llmContent).toContain('Added new todo');
      expect(result.returnDisplay).toEqual({
        todos: [{ description: 'New task', status: 'pending' }],
      });
    });

    it('should add a todo with specified status', async () => {
      const params: ManageTodosToolParams = {
        operation: 'add',
        description: 'Started task',
        status: 'in_progress',
      };

      const result = await tool.buildAndExecute(params, signal);

      expect(result.returnDisplay).toEqual({
        todos: [{ description: 'Started task', status: 'in_progress' }],
      });
    });
  });

  describe('complete operation', () => {
    it('should complete a todo', async () => {
      // First add a todo
      await tool.buildAndExecute(
        { operation: 'add', description: 'Task to complete' },
        signal,
      );

      const params: ManageTodosToolParams = {
        operation: 'complete',
        index: 1,
      };

      const result = await tool.buildAndExecute(params, signal);

      expect(result.llmContent).toContain('completed');
      expect(result.returnDisplay).toEqual({
        todos: [{ description: 'Task to complete', status: 'completed' }],
      });
    });
  });

  describe('start operation', () => {
    it('should start a todo', async () => {
      await tool.buildAndExecute(
        { operation: 'add', description: 'Task to start' },
        signal,
      );

      const params: ManageTodosToolParams = {
        operation: 'start',
        index: 1,
      };

      const result = await tool.buildAndExecute(params, signal);

      expect(result.llmContent).toContain('in_progress');
    });
  });

  describe('cancel operation', () => {
    it('should cancel a todo', async () => {
      await tool.buildAndExecute(
        { operation: 'add', description: 'Task to cancel' },
        signal,
      );

      const params: ManageTodosToolParams = {
        operation: 'cancel',
        index: 1,
      };

      const result = await tool.buildAndExecute(params, signal);

      expect(result.llmContent).toContain('cancelled');
    });
  });

  describe('remove operation', () => {
    it('should remove a todo', async () => {
      await tool.buildAndExecute(
        { operation: 'add', description: 'Task 1' },
        signal,
      );
      await tool.buildAndExecute(
        { operation: 'add', description: 'Task 2' },
        signal,
      );

      const params: ManageTodosToolParams = {
        operation: 'remove',
        index: 1,
      };

      const result = await tool.buildAndExecute(params, signal);

      expect(result.llmContent).toContain('Removed');
      expect(result.returnDisplay).toEqual({
        todos: [{ description: 'Task 2', status: 'pending' }],
      });
    });
  });

  describe('insert operation', () => {
    it('should insert a todo at specified position', async () => {
      await tool.buildAndExecute(
        { operation: 'add', description: 'Task 1' },
        signal,
      );
      await tool.buildAndExecute(
        { operation: 'add', description: 'Task 3' },
        signal,
      );

      const params: ManageTodosToolParams = {
        operation: 'insert',
        index: 2,
        description: 'Task 2',
      };

      const result = await tool.buildAndExecute(params, signal);

      expect(result.llmContent).toContain('Inserted');
      const todos = getTodoStateManager().getTodos();
      expect(todos[1].description).toBe('Task 2');
    });
  });

  describe('clear operation', () => {
    it('should clear all todos', async () => {
      await tool.buildAndExecute(
        { operation: 'add', description: 'Task 1' },
        signal,
      );
      await tool.buildAndExecute(
        { operation: 'add', description: 'Task 2' },
        signal,
      );

      const params: ManageTodosToolParams = {
        operation: 'clear',
      };

      const result = await tool.buildAndExecute(params, signal);

      expect(result.llmContent).toContain('Cleared');
      expect(result.returnDisplay).toEqual({ todos: [] });
    });
  });

  describe('update_description operation', () => {
    it('should update todo description', async () => {
      await tool.buildAndExecute(
        { operation: 'add', description: 'Old description' },
        signal,
      );

      const params: ManageTodosToolParams = {
        operation: 'update_description',
        index: 1,
        description: 'New description',
      };

      const result = await tool.buildAndExecute(params, signal);

      expect(result.llmContent).toContain('Updated');
      expect(getTodoStateManager().getTodos()[0].description).toBe(
        'New description',
      );
    });
  });
});
