/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { TodoList, TaskStatus } from './todo_list.js';
import { expect, describe, it, beforeEach } from 'vitest';

describe('TodoList', () => {
  let todoList: TodoList;

  beforeEach(() => {
    todoList = TodoList.getInstance();
    // Clear tasks before each test
    (todoList as any).tasks = [];
    (todoList as any).nextId = 1;
  });

  it('should add a task', () => {
    const task = todoList.addTask('Test task');
    expect(task.task).toBe('Test task');
    expect(task.status).toBe(TaskStatus.PENDING);
    expect(todoList.listTasks()).toHaveLength(1);
  });

  it('should remove a task', () => {
    const task = todoList.addTask('Test task');
    const result = todoList.removeTask(task.id);
    expect(result).toBe(true);
    expect(todoList.listTasks()).toHaveLength(0);
  });

  it('should not remove a non-existent task', () => {
    const result = todoList.removeTask(999);
    expect(result).toBe(false);
  });

  it('should list tasks', () => {
    todoList.addTask('Task 1');
    todoList.addTask('Task 2');
    const tasks = todoList.listTasks();
    expect(tasks).toHaveLength(2);
    expect(tasks[0].task).toBe('Task 1');
    expect(tasks[1].task).toBe('Task 2');
  });

  it('should update a task status', () => {
    const task = todoList.addTask('Test task');
    const updatedTask = todoList.updateTask(task.id, TaskStatus.DONE);
    expect(updatedTask?.status).toBe(TaskStatus.DONE);
  });

  it('should not update a non-existent task', () => {
    const updatedTask = todoList.updateTask(999, TaskStatus.DONE);
    expect(updatedTask).toBeNull();
  });
});
