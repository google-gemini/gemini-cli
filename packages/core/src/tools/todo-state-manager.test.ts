/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  TodoStateManager,
  getTodoStateManager,
  resetTodoStateManager,
} from './todo-state-manager.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

describe('TodoStateManager', () => {
  let tempDir: string;
  let stateManager: TodoStateManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'todo-state-manager-test-'),
    );
    stateManager = new TodoStateManager();
    await stateManager.initialize(tempDir);
  });

  afterEach(async () => {
    resetTodoStateManager();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('initialization', () => {
    it('should initialize with empty todos', () => {
      expect(stateManager.getTodos()).toEqual([]);
      expect(stateManager.isInitialized()).toBe(true);
    });

    it('should load existing todos from disk', async () => {
      const existingTodos = {
        todos: [{ description: 'Existing task', status: 'pending' }],
        lastUpdated: new Date().toISOString(),
      };
      await fs.writeFile(
        path.join(tempDir, 'todos.json'),
        JSON.stringify(existingTodos),
      );

      const newManager = new TodoStateManager();
      await newManager.initialize(tempDir);

      expect(newManager.getTodos()).toEqual(existingTodos.todos);
    });
  });

  describe('setTodos', () => {
    it('should set the entire todo list', async () => {
      const todos = [
        { description: 'Task 1', status: 'pending' as const },
        { description: 'Task 2', status: 'completed' as const },
      ];

      const result = await stateManager.setTodos(todos);

      expect(result.success).toBe(true);
      expect(stateManager.getTodos()).toEqual(todos);
    });

    it('should reject invalid todos', async () => {
      const todos = [{ description: '', status: 'pending' as const }];

      const result = await stateManager.setTodos(todos);

      expect(result.success).toBe(false);
      expect(result.message).toContain('non-empty description');
    });

    it('should reject multiple in_progress todos', async () => {
      const todos = [
        { description: 'Task 1', status: 'in_progress' as const },
        { description: 'Task 2', status: 'in_progress' as const },
      ];

      const result = await stateManager.setTodos(todos);

      expect(result.success).toBe(false);
      expect(result.message).toContain('in_progress');
    });
  });

  describe('addTodo', () => {
    it('should add a new todo at the end', async () => {
      const result = await stateManager.addTodo('New task');

      expect(result.success).toBe(true);
      expect(stateManager.getTodos()).toHaveLength(1);
      expect(stateManager.getTodos()[0].description).toBe('New task');
      expect(stateManager.getTodos()[0].status).toBe('pending');
    });

    it('should add a todo with specified status', async () => {
      const result = await stateManager.addTodo('New task', 'in_progress');

      expect(result.success).toBe(true);
      expect(stateManager.getTodos()[0].status).toBe('in_progress');
    });

    it('should reject adding in_progress when one exists', async () => {
      await stateManager.addTodo('First task', 'in_progress');
      const result = await stateManager.addTodo('Second task', 'in_progress');

      expect(result.success).toBe(false);
      expect(result.message).toContain('already in progress');
    });

    it('should reject empty description', async () => {
      const result = await stateManager.addTodo('   ');

      expect(result.success).toBe(false);
      expect(result.message).toContain('cannot be empty');
    });
  });

  describe('updateStatus', () => {
    beforeEach(async () => {
      await stateManager.setTodos([
        { description: 'Task 1', status: 'pending' },
        { description: 'Task 2', status: 'pending' },
      ]);
    });

    it('should update status of a specific todo', async () => {
      const result = await stateManager.updateStatus(1, 'in_progress');

      expect(result.success).toBe(true);
      expect(stateManager.getTodos()[0].status).toBe('in_progress');
    });

    it('should reject invalid index', async () => {
      const result = await stateManager.updateStatus(10, 'completed');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid todo index');
    });

    it('should reject setting in_progress when one exists', async () => {
      await stateManager.updateStatus(1, 'in_progress');
      const result = await stateManager.updateStatus(2, 'in_progress');

      expect(result.success).toBe(false);
      expect(result.message).toContain('already in progress');
    });
  });

  describe('completeTodo', () => {
    it('should mark a todo as completed', async () => {
      await stateManager.addTodo('Task to complete');
      const result = await stateManager.completeTodo(1);

      expect(result.success).toBe(true);
      expect(stateManager.getTodos()[0].status).toBe('completed');
    });
  });

  describe('startTodo', () => {
    it('should mark a todo as in_progress', async () => {
      await stateManager.addTodo('Task to start');
      const result = await stateManager.startTodo(1);

      expect(result.success).toBe(true);
      expect(stateManager.getTodos()[0].status).toBe('in_progress');
    });
  });

  describe('cancelTodo', () => {
    it('should mark a todo as cancelled', async () => {
      await stateManager.addTodo('Task to cancel');
      const result = await stateManager.cancelTodo(1);

      expect(result.success).toBe(true);
      expect(stateManager.getTodos()[0].status).toBe('cancelled');
    });
  });

  describe('removeTodo', () => {
    it('should remove a todo from the list', async () => {
      await stateManager.setTodos([
        { description: 'Task 1', status: 'pending' },
        { description: 'Task 2', status: 'pending' },
      ]);

      const result = await stateManager.removeTodo(1);

      expect(result.success).toBe(true);
      expect(stateManager.getTodos()).toHaveLength(1);
      expect(stateManager.getTodos()[0].description).toBe('Task 2');
    });
  });

  describe('insertTodo', () => {
    it('should insert a todo at specified position', async () => {
      await stateManager.setTodos([
        { description: 'Task 1', status: 'pending' },
        { description: 'Task 3', status: 'pending' },
      ]);

      const result = await stateManager.insertTodo(2, 'Task 2');

      expect(result.success).toBe(true);
      expect(stateManager.getTodos()[1].description).toBe('Task 2');
    });
  });

  describe('clearTodos', () => {
    it('should clear all todos', async () => {
      await stateManager.setTodos([
        { description: 'Task 1', status: 'pending' },
        { description: 'Task 2', status: 'completed' },
      ]);

      const result = await stateManager.clearTodos();

      expect(result.success).toBe(true);
      expect(stateManager.getTodos()).toEqual([]);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      await stateManager.setTodos([
        { description: 'Task 1', status: 'pending' },
        { description: 'Task 2', status: 'in_progress' },
        { description: 'Task 3', status: 'completed' },
        { description: 'Task 4', status: 'cancelled' },
      ]);

      const stats = stateManager.getStats();

      expect(stats.total).toBe(4);
      expect(stats.pending).toBe(1);
      expect(stats.inProgress).toBe(1);
      expect(stats.completed).toBe(1);
      expect(stats.cancelled).toBe(1);
    });
  });

  describe('persistence', () => {
    it('should persist todos to disk', async () => {
      await stateManager.addTodo('Persistent task');

      const fileContent = await fs.readFile(
        path.join(tempDir, 'todos.json'),
        'utf-8',
      );
      const saved = JSON.parse(fileContent);

      expect(saved.todos).toHaveLength(1);
      expect(saved.todos[0].description).toBe('Persistent task');
    });
  });

  describe('singleton', () => {
    it('should return the same instance from getTodoStateManager', () => {
      resetTodoStateManager();
      const instance1 = getTodoStateManager();
      const instance2 = getTodoStateManager();

      expect(instance1).toBe(instance2);
    });

    it('should return a new instance after reset', () => {
      const instance1 = getTodoStateManager();
      resetTodoStateManager();
      const instance2 = getTodoStateManager();

      expect(instance1).not.toBe(instance2);
    });
  });
});
