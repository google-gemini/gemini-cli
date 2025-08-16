/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export enum TaskStatus {
  PENDING = 'pending',
  DONE = 'done',
}

export class Todo {
  id: number;
  task: string;
  status: TaskStatus;

  constructor(id: number, task: string) {
    this.id = id;
    this.task = task;
    this.status = TaskStatus.PENDING;
  }
}

export class TodoList {
  private static instance: TodoList;
  private tasks: Todo[] = [];
  private nextId = 1;

  private constructor() {}

  public static getInstance(): TodoList {
    if (!TodoList.instance) {
      TodoList.instance = new TodoList();
    }
    return TodoList.instance;
  }

  addTask(task: string): Todo {
    const newTodo = new Todo(this.nextId++, task);
    this.tasks.push(newTodo);
    return newTodo;
  }

  removeTask(id: number): boolean {
    const index = this.tasks.findIndex((t) => t.id === id);
    if (index !== -1) {
      this.tasks.splice(index, 1);
      return true;
    }
    return false;
  }

  listTasks(): Todo[] {
    return this.tasks;
  }

  updateTask(id: number, status: TaskStatus): Todo | null {
    const task = this.tasks.find((t) => t.id === id);
    if (task) {
      task.status = status;
      return task;
    }
    return null;
  }
}
