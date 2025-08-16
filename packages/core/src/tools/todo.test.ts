/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { TodoListTool } from './todo.js';
import { TodoList } from './todo_list.js';
import { expect, describe, it, beforeEach } from 'vitest';

describe('TodoListTool', () => {
  let todoListTool: TodoListTool;
  let todoList: TodoList;

  beforeEach(() => {
    todoListTool = new TodoListTool();
    todoList = TodoList.getInstance();
    // Clear tasks before each test
    (todoList as any).tasks = [];
    (todoList as any).nextId = 1;
  });

  it('should add a task', async () => {
    const invocation = todoListTool['createInvocation']({
      action: 'add',
      task: 'Test task',
    });
    const result = await invocation.execute();
    expect(result.llmContent).toBe('Task added: Test task with id: 1');
    expect(todoList.listTasks()).toHaveLength(1);
  });

  it('should remove a task', async () => {
    const task = todoList.addTask('Test task');
    const invocation = todoListTool['createInvocation']({
      action: 'remove',
      id: task.id,
    });
    const result = await invocation.execute();
    expect(result.llmContent).toBe(`Task with id: ${task.id} removed.`);
    expect(todoList.listTasks()).toHaveLength(0);
  });

  it('should list tasks', async () => {
    todoList.addTask('Task 1');
    todoList.addTask('Task 2');
    const invocation = todoListTool['createInvocation']({
      action: 'list',
    });
    const result = await invocation.execute();
    expect(result.llmContent).toContain('Task 1');
    expect(result.llmContent).toContain('Task 2');
  });

  it('should mark a task as done', async () => {
    const task = todoList.addTask('Test task');
    const invocation = todoListTool['createInvocation']({
      action: 'done',
      id: task.id,
    });
    const result = await invocation.execute();
    expect(result.llmContent).toBe(`Task with id: ${task.id} marked as done.`);
    const updatedTask = todoList.listTasks()[0];
    expect(updatedTask.status).toBe('done');
  });
});
