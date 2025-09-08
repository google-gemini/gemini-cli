
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
  afterEach,
  vi,
  type Mocked,
} from 'vitest';
import {
  AddTodoTool,
  EditTodoTool,
  ListTodosTool,
  RemoveTodoTool,
} from './todo.js';
import type {
  ListTodosToolParams,
  AddTodoToolParams,
  EditTodoToolParams,
  RemoveTodoToolParams,
} from './todo.js';
import type { Config } from '../config/config.js';
import type { FileSystemService } from '../services/fileSystemService.js';

// Mock Config
const mockConfig = {
  getFileSystemService: vi.fn(),
} as unknown as Config;

describe('Todo Tools', () => {
  let fileSystemService: Mocked<FileSystemService>;

  beforeEach(() => {
    fileSystemService = {
      readTextFile: vi.fn(),
      writeTextFile: vi.fn(),
      deleteFile: vi.fn(),
      createLockFile: vi.fn(),
    };
    vi.mocked(mockConfig.getFileSystemService).mockReturnValue(
      fileSystemService
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('ListTodosTool', () => {
    it('should list todos', async () => {
      const tool = new ListTodosTool(mockConfig);
      const todos = [
        { id: 1, task: 'Task 1', done: false },
        { id: 2, task: 'Task 2', done: true },
      ];
      fileSystemService.readTextFile.mockResolvedValue(JSON.stringify(todos));

      const invocation = tool.build({} as ListTodosToolParams);
      const result = await invocation.execute();

      expect(result.llmContent).toContain('Here are your todos:');
      expect(result.llmContent).toContain('- [ ] #1: Task 1');
      expect(result.llmContent).toContain('- [x] #2: Task 2');
    });

    it('should return a message when no todos are found', async () => {
      const tool = new ListTodosTool(mockConfig);
      fileSystemService.readTextFile.mockRejectedValue({ code: 'ENOENT' });

      const invocation = tool.build({} as ListTodosToolParams);
      const result = await invocation.execute();

      expect(result.llmContent).toBe('No todos found.');
    });

    it('should filter todos by status done', async () => {
      const tool = new ListTodosTool(mockConfig);
      const todos = [
        { id: 1, task: 'Task 1', done: false },
        { id: 2, task: 'Task 2', done: true },
      ];
      fileSystemService.readTextFile.mockResolvedValue(JSON.stringify(todos));

      const invocation = tool.build({ filter: { status: 'done' } } as ListTodosToolParams);
      const result = await invocation.execute();

      expect(result.llmContent).not.toContain('- [ ] #1: Task 1');
      expect(result.llmContent).toContain('- [x] #2: Task 2');
    });

    it('should filter todos by status open', async () => {
      const tool = new ListTodosTool(mockConfig);
      const todos = [
        { id: 1, task: 'Task 1', done: false },
        { id: 2, task: 'Task 2', done: true },
      ];
      fileSystemService.readTextFile.mockResolvedValue(JSON.stringify(todos));

      const invocation = tool.build({ filter: { status: 'open' } } as ListTodosToolParams);
      const result = await invocation.execute();

      expect(result.llmContent).toContain('- [ ] #1: Task 1');
      expect(result.llmContent).not.toContain('- [x] #2: Task 2');
    });

    it('should sort todos by priority', async () => {
      const tool = new ListTodosTool(mockConfig);
      const todos = [
        { id: 1, task: 'Task 1', done: false, priority: 2 },
        { id: 2, task: 'Task 2', done: false, priority: 1 },
      ];
      fileSystemService.readTextFile.mockResolvedValue(JSON.stringify(todos));

      const invocation = tool.build({ sort: 'priority' } as ListTodosToolParams);
      const result = await invocation.execute();

      expect(result.llmContent).toContain('- [ ] #2: Task 2');
      expect(result.llmContent).toContain('- [ ] #1: Task 1');
    });
  });

  describe('AddTodoTool', () => {
    it('should add a new todo', async () => {
      const tool = new AddTodoTool(mockConfig);
      fileSystemService.readTextFile.mockRejectedValue({ code: 'ENOENT' });

      const invocation = tool.build({ task: 'New Task' } as AddTodoToolParams);
      await invocation.execute();

      expect(fileSystemService.writeTextFile).toHaveBeenCalledWith(
        '.gemini/todos.json',
        JSON.stringify([{ id: 1, task: 'New Task', done: false }], null, 2)
      );
    });

    it('should return an error when adding a sub-todo to a non-existent parent', async () => {
      const tool = new AddTodoTool(mockConfig);
      fileSystemService.readTextFile.mockRejectedValue({ code: 'ENOENT' });

      const invocation = tool.build({ task: 'Sub Task', parent: 1 } as AddTodoToolParams);
      const result = await invocation.execute();

      expect(result.error).toBeDefined();
      expect(result.llmContent).toContain('Parent todo with id 1 not found');
    });
  });

  describe('EditTodoTool', () => {
    it('should edit a todo', async () => {
      const tool = new EditTodoTool(mockConfig);
      const todos = [{ id: 1, task: 'Task 1', done: false }];
      fileSystemService.readTextFile.mockResolvedValue(JSON.stringify(todos));

      const invocation = tool.build({ id: 1, task: 'Updated Task' } as EditTodoToolParams);
      await invocation.execute();

      expect(fileSystemService.writeTextFile).toHaveBeenCalledWith(
        '.gemini/todos.json',
        JSON.stringify([{ id: 1, task: 'Updated Task', done: false }], null, 2)
      );
    });

    it('should return an error when editing a non-existent todo', async () => {
      const tool = new EditTodoTool(mockConfig);
      fileSystemService.readTextFile.mockRejectedValue({ code: 'ENOENT' });

      const invocation = tool.build({ id: 1, task: 'Updated Task' } as EditTodoToolParams);
      const result = await invocation.execute();

      expect(result.error).toBeDefined();
      expect(result.llmContent).toContain('Todo with id 1 not found');
    });
  });

  describe('RemoveTodoTool', () => {
    it('should remove a todo', async () => {
      const tool = new RemoveTodoTool(mockConfig);
      const todos = [{ id: 1, task: 'Task 1', done: false }];
      fileSystemService.readTextFile.mockResolvedValue(JSON.stringify(todos));

      const invocation = tool.build({ id: 1 } as RemoveTodoToolParams);
      await invocation.execute();

      expect(fileSystemService.writeTextFile).toHaveBeenCalledWith(
        '.gemini/todos.json',
        JSON.stringify([], null, 2)
      );
    });

    it('should return an error when removing a non-existent todo', async () => {
      const tool = new RemoveTodoTool(mockConfig);
      fileSystemService.readTextFile.mockRejectedValue({ code: 'ENOENT' });

      const invocation = tool.build({ id: 1 } as RemoveTodoToolParams);
      const result = await invocation.execute();

      expect(result.error).toBeDefined();
      expect(result.llmContent).toContain('Todo with id 1 not found');
    });
  });
});
