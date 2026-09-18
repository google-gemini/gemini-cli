/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { WriteTodosTool, type WriteTodosToolParams } from './write-todos.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import { TrackerService } from '../services/trackerService.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

describe('WriteTodosTool', () => {
  const signal = new AbortController().signal;

  describe('legacy (no tracker)', () => {
    const tool = new WriteTodosTool(createMockMessageBus());

    describe('validation', () => {
      it('should not throw for valid parameters', async () => {
        const params: WriteTodosToolParams = {
          todos: [
            { description: 'Task 1', status: 'pending' },
            { description: 'Task 2', status: 'in_progress' },
            { description: 'Task 3', status: 'completed' },
            { description: 'Task 4', status: 'blocked' },
          ],
        };
        await expect(
          tool.buildAndExecute(params, signal),
        ).resolves.toBeDefined();
      });

      it('should not throw for an empty list', async () => {
        const params: WriteTodosToolParams = {
          todos: [],
        };
        await expect(
          tool.buildAndExecute(params, signal),
        ).resolves.toBeDefined();
      });

      it('should throw an error if todos is not an array', async () => {
        const params = {
          todos: 'not-an-array',
        } as unknown as WriteTodosToolParams;
        await expect(tool.buildAndExecute(params, signal)).rejects.toThrow(
          'params/todos must be array',
        );
      });

      it('should throw an error if a todo item is not an object', async () => {
        const params = {
          todos: ['not-an-object'],
        } as unknown as WriteTodosToolParams;
        await expect(tool.buildAndExecute(params, signal)).rejects.toThrow(
          'params/todos/0 must be object',
        );
      });

      it('should throw an error if a todo description is missing or empty', async () => {
        const params: WriteTodosToolParams = {
          todos: [{ description: '  ', status: 'pending' }],
        };
        await expect(tool.buildAndExecute(params, signal)).rejects.toThrow(
          'Each todo must have a non-empty description string',
        );
      });

      it('should throw an error if a todo status is invalid', async () => {
        const params = {
          todos: [{ description: 'Task 1', status: 'invalid-status' }],
        } as unknown as WriteTodosToolParams;
        await expect(tool.buildAndExecute(params, signal)).rejects.toThrow(
          'params/todos/0/status must be equal to one of the allowed values',
        );
      });

      it('should throw an error if more than one task is in_progress', async () => {
        const params: WriteTodosToolParams = {
          todos: [
            { description: 'Task 1', status: 'in_progress' },
            { description: 'Task 2', status: 'in_progress' },
          ],
        };
        await expect(tool.buildAndExecute(params, signal)).rejects.toThrow(
          'Invalid parameters: Only one task can be "in_progress" at a time.',
        );
      });
    });

    describe('execute', () => {
      it('should return a success message for clearing the list', async () => {
        const params: WriteTodosToolParams = {
          todos: [],
        };
        const result = await tool.buildAndExecute(params, signal);
        expect(result.llmContent).toBe('Successfully cleared the todo list.');
        expect(result.returnDisplay).toEqual({ todos: [] });
      });

      it('should return a formatted todo list on success', async () => {
        const params: WriteTodosToolParams = {
          todos: [
            { description: 'First task', status: 'completed' },
            { description: 'Second task', status: 'in_progress' },
            { description: 'Third task', status: 'pending' },
            { description: 'Fourth task', status: 'blocked' },
          ],
        };
        const result = await tool.buildAndExecute(params, signal);
        const expectedOutput = `Successfully updated the todo list. The current list is now:
1. [completed] First task
2. [in_progress] Second task
3. [pending] Third task
4. [blocked] Fourth task`;
        expect(result.llmContent).toBe(expectedOutput);
        expect(result.returnDisplay).toEqual(params);
      });
    });
  });

  describe('persistent (with tracker)', () => {
    let tempDir: string;
    let trackerService: TrackerService;
    let tool: WriteTodosTool;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(
        path.join(os.tmpdir(), 'write-todos-persistent-'),
      );
      trackerService = new TrackerService(tempDir);
      tool = new WriteTodosTool(createMockMessageBus(), trackerService);
    });

    afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('should persist todos to disk via TrackerService', async () => {
      const params: WriteTodosToolParams = {
        todos: [
          { description: 'Persistent task A', status: 'pending' },
          { description: 'Persistent task B', status: 'in_progress' },
        ],
      };
      const result = await tool.buildAndExecute(params, signal);
      expect(result.llmContent).toContain('persisted to disk');

      // Verify tasks are on disk
      const tasks = await trackerService.listTasks();
      expect(tasks.length).toBe(2);
      expect(tasks.map((t) => t.title)).toContain('Persistent task A');
      expect(tasks.map((t) => t.title)).toContain('Persistent task B');
    });

    it('should map todo statuses to tracker statuses correctly', async () => {
      const params: WriteTodosToolParams = {
        todos: [
          { description: 'Pending', status: 'pending' },
          { description: 'InProgress', status: 'in_progress' },
          { description: 'Completed', status: 'completed' },
          { description: 'Blocked', status: 'blocked' },
        ],
      };
      await tool.buildAndExecute(params, signal);

      const tasks = await trackerService.listTasks();
      const byTitle = new Map(tasks.map((t) => [t.title, t.status]));
      expect(byTitle.get('Pending')).toBe('open');
      expect(byTitle.get('InProgress')).toBe('in_progress');
      expect(byTitle.get('Completed')).toBe('closed');
      expect(byTitle.get('Blocked')).toBe('blocked');
    });

    it('should clear persistent tasks when given an empty list', async () => {
      // First create some tasks
      await tool.buildAndExecute(
        {
          todos: [{ description: 'Will be removed', status: 'pending' }],
        },
        signal,
      );
      expect((await trackerService.listTasks()).length).toBe(1);

      // Now clear
      const result = await tool.buildAndExecute({ todos: [] }, signal);
      expect(result.llmContent).toContain('removed from persistent storage');
      expect((await trackerService.listTasks()).length).toBe(0);
    });

    it('should replace all existing tasks when called again', async () => {
      await tool.buildAndExecute(
        {
          todos: [
            { description: 'Old A', status: 'pending' },
            { description: 'Old B', status: 'pending' },
          ],
        },
        signal,
      );
      expect((await trackerService.listTasks()).length).toBe(2);

      await tool.buildAndExecute(
        {
          todos: [{ description: 'New X', status: 'in_progress' }],
        },
        signal,
      );
      const tasks = await trackerService.listTasks();
      expect(tasks.length).toBe(1);
      expect(tasks[0].title).toBe('New X');
    });

    it('should survive service restart by reading from disk', async () => {
      await tool.buildAndExecute(
        {
          todos: [{ description: 'Survives restart', status: 'pending' }],
        },
        signal,
      );

      // Simulate restart: create a new service pointing at the same dir
      const freshService = new TrackerService(tempDir);
      const tasks = await freshService.listTasks();
      expect(tasks.length).toBe(1);
      expect(tasks[0].title).toBe('Survives restart');
    });
  });
});
