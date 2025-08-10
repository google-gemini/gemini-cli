/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  vi,
} from 'vitest';
import { TodoWriteTool, TodoWriteParams } from './todoWrite.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock fs/promises
vi.mock('fs/promises');
const mockFs = vi.mocked(fs);

// Mock homedir
vi.mock('os', () => ({
  homedir: vi.fn(() => '/mock/home'),
}));

describe('TodoWriteTool', () => {
  let todoTool: TodoWriteTool;
  const mockTodoPath = path.join('/mock/home', '.gemini', 'todos.md');

  beforeEach(() => {
    vi.clearAllMocks();
    todoTool = new TodoWriteTool();
  });

  describe('constructor', () => {
    it('should initialize with correct properties', () => {
      expect(todoTool.name).toBe('todo_write');
      expect(todoTool.displayName).toBe('TodoWrite');
      expect(todoTool.isOutputMarkdown).toBe(true);
      expect(todoTool.canUpdateOutput).toBe(false);
    });
  });

  describe('validateToolParams', () => {
    it('should accept valid parameters', () => {
      const params: TodoWriteParams = {
        todos: [
          { content: 'Test task', status: 'pending', id: '1' },
          { content: 'Another task', status: 'in_progress', id: '2' },
          { content: 'Completed task', status: 'completed', id: '3' },
        ],
      };

      const result = todoTool['validateToolParams'](params);
      expect(result).toBeNull();
    });

    it('should reject non-array todos', () => {
      const params = { todos: 'not an array' } as unknown as TodoWriteParams;
      const result = todoTool['validateToolParams'](params);
      expect(result).toBe('todos must be an array');
    });

    it('should reject todos with missing content', () => {
      const params: TodoWriteParams = {
        todos: [{ content: '', status: 'pending', id: '1' }],
      };
      const result = todoTool['validateToolParams'](params);
      expect(result).toBe('todo at index 0 must have a content string');
    });

    it('should reject todos with missing id', () => {
      const params: TodoWriteParams = {
        todos: [{ content: 'Test', status: 'pending', id: '' }],
      };
      const result = todoTool['validateToolParams'](params);
      expect(result).toBe('todo at index 0 must have an id string');
    });

    it('should reject todos with invalid status', () => {
      const params: TodoWriteParams = {
        todos: [{ content: 'Test', status: 'invalid' as never, id: '1' }],
      };
      const result = todoTool['validateToolParams'](params);
      expect(result).toBe("todo at index 0 must have status 'pending', 'in_progress', or 'completed'");
    });
  });

  describe('build', () => {
    it('should create invocation with valid parameters', () => {
      const params: TodoWriteParams = {
        todos: [{ content: 'Test task', status: 'pending', id: '1' }],
      };

      const invocation = todoTool.build(params);
      expect(invocation).toBeDefined();
      expect(invocation.params).toEqual(params);
    });

    it('should throw error with invalid parameters', () => {
      const params = { todos: 'invalid' } as unknown as TodoWriteParams;
      expect(() => todoTool.build(params)).toThrow('todos must be an array');
    });
  });

  describe('TodoWriteInvocation', () => {
    let params: TodoWriteParams;

    beforeEach(() => {
      params = {
        todos: [
          { content: 'First task', status: 'pending', id: '1' },
          { content: 'Second task', status: 'in_progress', id: '2' },
          { content: 'Third task', status: 'completed', id: '3' },
        ],
      };
    });

    describe('getDescription', () => {
      it('should return correct description for multiple todos', () => {
        const invocation = todoTool.build(params);
        const description = invocation.getDescription();
        
        expect(description).toBe('Update todo list with 3 items (1 completed, 1 in progress, 1 pending)');
      });

      it('should handle empty todo list', () => {
        const emptyParams: TodoWriteParams = { todos: [] };
        const invocation = todoTool.build(emptyParams);
        const description = invocation.getDescription();
        
        expect(description).toBe('Update todo list with 0 items (0 completed, 0 in progress, 0 pending)');
      });
    });

    describe('execute', () => {
      let abortSignal: AbortSignal;

      beforeEach(() => {
        abortSignal = new AbortController().signal;
        mockFs.access.mockRejectedValue(new Error('Directory does not exist'));
        mockFs.mkdir.mockResolvedValue(undefined);
        mockFs.writeFile.mockResolvedValue(undefined);
      });

      it('should create directory and write todos successfully', async () => {
        const invocation = todoTool.build(params);
        const result = await invocation.execute(abortSignal);

        expect(mockFs.mkdir).toHaveBeenCalledWith('/mock/home/.gemini', { recursive: true });
        expect(mockFs.writeFile).toHaveBeenCalledWith(
          mockTodoPath,
          expect.stringContaining('# Todo List'),
          'utf-8'
        );

        expect(result.summary).toBe('Updated todo list with 3 items');
        expect(result.returnDisplay).toContain('- [ ] First task');
        expect(result.returnDisplay).toContain('- [⏳] Second task');
        expect(result.returnDisplay).toContain('- [x] Third task');
        expect(result.returnDisplay).not.toContain('Current Todo List');
        expect(result.returnDisplay).not.toContain('Progress:');
      });

      it('should handle empty todo list', async () => {
        const emptyParams: TodoWriteParams = { todos: [] };
        const invocation = todoTool.build(emptyParams);
        const result = await invocation.execute(abortSignal);

        expect(result.summary).toBe('Updated todo list with 0 items');
        expect(result.returnDisplay).toBe('No todos currently tracked.');
        expect(mockFs.writeFile).toHaveBeenCalledWith(
          mockTodoPath,
          '# Todo List\n\nNo todos currently tracked.\n',
          'utf-8'
        );
      });

      it('should skip directory creation if it already exists', async () => {
        mockFs.access.mockResolvedValue(undefined); // Directory exists

        const invocation = todoTool.build(params);
        await invocation.execute(abortSignal);

        expect(mockFs.mkdir).not.toHaveBeenCalled();
        expect(mockFs.writeFile).toHaveBeenCalled();
      });

      it('should handle file write errors', async () => {
        const writeError = new Error('Permission denied');
        mockFs.writeFile.mockRejectedValue(writeError);

        const invocation = todoTool.build(params);
        const result = await invocation.execute(abortSignal);

        expect(result.summary).toBe('Failed to update todo list');
        expect(result.error).toEqual({
          message: 'Permission denied',
          type: 'unhandled_exception',
        });
        expect(result.returnDisplay).toContain('**Error:** Failed to update todo list - Permission denied');
      });
    });
  });

  describe('markdown formatting', () => {
    it('should format todos correctly in markdown', async () => {
      const params: TodoWriteParams = {
        todos: [
          { content: 'Pending task', status: 'pending', id: '1' },
          { content: 'In progress task', status: 'in_progress', id: '2' },
          { content: 'Completed task', status: 'completed', id: '3' },
        ],
      };

      mockFs.access.mockRejectedValue(new Error('Directory does not exist'));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      const invocation = todoTool.build(params);
      await invocation.execute(new AbortController().signal);

      const expectedContent = '# Todo List\n\n- [ ] Pending task\n- [⏳] In progress task\n- [x] Completed task\n';
      expect(mockFs.writeFile).toHaveBeenCalledWith(mockTodoPath, expectedContent, 'utf-8');
    });
  });
});