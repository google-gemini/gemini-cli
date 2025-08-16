/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  ToolInvocation,
  ToolResult,
} from './tools.js';
import { TodoList, TaskStatus } from './todo_list.js';

export interface TodoToolParams {
  action: 'add' | 'remove' | 'list' | 'done';
  task?: string;
  id?: number;
}

class TodoToolInvocation extends BaseToolInvocation<TodoToolParams, ToolResult> {
  private todoList: TodoList;

  constructor(params: TodoToolParams) {
    super(params);
    this.todoList = TodoList.getInstance();
  }

  getDescription(): string {
    switch (this.params.action) {
      case 'add':
        return `Adding task: ${this.params.task}`;
      case 'remove':
        return `Removing task with id: ${this.params.id}`;
      case 'list':
        return `Listing all tasks`;
      case 'done':
        return `Marking task with id: ${this.params.id} as done`;
      default:
        return 'Unknown todo action';
    }
  }

  async execute(): Promise<ToolResult> {
    let llmContent = '';
    let returnDisplay = '';

    try {
      switch (this.params.action) {
        case 'add':
          if (!this.params.task) {
            throw new Error('Task description is required for adding a task.');
          }
          const newTodo = this.todoList.addTask(this.params.task);
          llmContent = `Task added: ${newTodo.task} with id: ${newTodo.id}`;
          returnDisplay = llmContent;
          break;
        case 'remove':
          if (!this.params.id) {
            throw new Error('Task id is required for removing a task.');
          }
          const removed = this.todoList.removeTask(this.params.id);
          if (removed) {
            llmContent = `Task with id: ${this.params.id} removed.`;
          } else {
            llmContent = `Task with id: ${this.params.id} not found.`;
          }
          returnDisplay = llmContent;
          break;
        case 'list':
          const tasks = this.todoList.listTasks();
          if (tasks.length === 0) {
            llmContent = 'No tasks in the list.';
          } else {
            llmContent =
              'Tasks:\n' +
              tasks
                .map((t) => `${t.id}: ${t.task} [${t.status}]`)
                .join('\n');
          }
          returnDisplay = llmContent;
          break;
        case 'done':
          if (!this.params.id) {
            throw new Error('Task id is required for marking a task as done.');
          }
          const updatedTask = this.todoList.updateTask(
            this.params.id,
            TaskStatus.DONE
          );
          if (updatedTask) {
            llmContent = `Task with id: ${this.params.id} marked as done.`;
          } else {
            llmContent = `Task with id: ${this.params.id} not found.`;
          }
          returnDisplay = llmContent;
          break;
        default:
          llmContent = 'Invalid action for todo tool.';
          returnDisplay = llmContent;
      }
    } catch (error) {
      llmContent = `Error: ${(error as Error).message}`;
      returnDisplay = llmContent;
    }

    return {
      llmContent,
      returnDisplay,
    };
  }
}

export class TodoListTool extends BaseDeclarativeTool<
  TodoToolParams,
  ToolResult
> {
  static Name = 'todo_list';

  constructor() {
    super(
      TodoListTool.Name,
      'Todo List',
      'A tool to manage a todo list. You can add, remove, list, and mark tasks as done.',
      'Execute',
      {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform on the todo list.',
            enum: ['add', 'remove', 'list', 'done'],
          },
          task: {
            type: 'string',
            description: 'The description of the task to add.',
          },
          id: {
            type: 'number',
            description: 'The id of the task to remove or mark as done.',
          },
        },
        required: ['action'],
      }
    );
  }

  protected createInvocation(
    params: TodoToolParams
  ): ToolInvocation<TodoToolParams, ToolResult> {
    return new TodoToolInvocation(params);
  }
}
