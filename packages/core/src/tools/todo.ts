/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import type { ToolInvocation, ToolResult } from './tools.js';


interface Todo {
  id: number;
  task: string;
  done: boolean;
  priority?: number;
  assignee?: string;
  tags?: string[];
  todos?: Todo[];
}

type TodoOperation = () => Promise<ToolResult>;

class TodoQueue {
  private queue: TodoOperation[] = [];
  private isProcessing = false;

  add(operation: TodoOperation) {
    this.queue.push(operation);
    this.process();
  }

  private async process() {
    if (this.isProcessing) {
      return;
    }
    this.isProcessing = true;
    while (this.queue.length > 0) {
      const operation = this.queue.shift()!;
      await operation();
    }
    this.isProcessing = false;
  }
}

const todoQueue = new TodoQueue();

async function readTodos(config: Config): Promise<Todo[]> {
  try {
    const todosContent = await config
      .getFileSystemService()
      .readTextFile('.gemini/todos.json');
    return JSON.parse(todosContent);
  } catch (error) {
    // @ts-expect-error - error is a generic error and does not have a code property
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function writeTodos(config: Config, todos: Todo[]): Promise<void> {
  await config
    .getFileSystemService()
    .writeTextFile('.gemini/todos.json', JSON.stringify(todos, null, 2));
}

function findTodoById(todos: Todo[], id: number): Todo | undefined {
  for (const todo of todos) {
    if (todo.id === id) {
      return todo;
    }
    if (todo.todos) {
      const found = findTodoById(todo.todos, id);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

// ===== list_todos =====

export interface ListTodosToolParams {
  filter?: {
    status?: 'done' | 'open';
    priority?: number;
    assignee?: string;
  };
  sort?: 'priority' | 'id';
}

function formatTodos(todos: Todo[], indent = 0): string {
  let result = '';
  for (const todo of todos) {
    let priority = ''
    if (todo.priority) {
      priority = ` (priority: ${todo.priority})`
    }
    let assignee = ''
    if (todo.assignee) {
      assignee = ` (assignee: ${todo.assignee})`
    }
    let tags = ''
    if (todo.tags) {
      tags = ` (tags: ${todo.tags.join(', ')})`
    }
    result += `${' '.repeat(indent)}- [${todo.done ? 'x' : ' '}] #${todo.id}: ${todo.task}${priority}${assignee}${tags}\n`;
    if (todo.todos) {
      result += formatTodos(todo.todos, indent + 2);
    }
  }
  return result;
}

class ListTodosToolInvocation extends BaseToolInvocation<
  ListTodosToolParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: ListTodosToolParams,
  ) {
    super(params);
  }

  getDescription(): string {
    return 'Listing all todos';
  }

  async execute(): Promise<ToolResult> {
    return new Promise((resolve) => {
      todoQueue.add(async () => {
        try {
          let todos = await readTodos(this.config);
          if (this.params.filter) {
            if (this.params.filter.status) {
              todos = todos.filter((todo) =>
                this.params.filter?.status === 'done' ? todo.done : !todo.done
              );
            }
            if (this.params.filter.priority) {
              todos = todos.filter(
                (todo) => todo.priority === this.params.filter?.priority
              );
            }
            if (this.params.filter.assignee) {
              todos = todos.filter(
                (todo) => todo.assignee === this.params.filter?.assignee
              );
            }
          }

          if (this.params.sort) {
            if (this.params.sort === 'priority') {
              todos.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
            }
          }

          if (todos.length === 0) {
            const result = {
              llmContent: 'No todos found.',
              returnDisplay: 'No todos found.',
            };
            resolve(result);
            return result;
          }
          const llmContent = `Here are your todos:\n${formatTodos(todos)}`;
          const result = {
            llmContent,
            returnDisplay: llmContent,
          };
          resolve(result);
          return result;
        } catch (e) {
          const llmContent = `Could not list todos. The todo file at .gemini/todos.json might be corrupted. You can try to fix it manually or delete it. Error: ${ (e as Error).message}`;
          const result = {
            llmContent,
            returnDisplay: llmContent,
            error: {
              message: llmContent,
            },
          };
          resolve(result);
          return result;
        }
      });
    });
  }
}

export class ListTodosTool extends BaseDeclarativeTool<
  ListTodosToolParams,
  ToolResult
> {
  static readonly Name: string = 'list_todos';

  constructor(private readonly config: Config) {
    super(
      ListTodosTool.Name,
      'ListTodos',
      'Lists all the todo items.',
      Kind.Read,
      {
        properties: {
          filter: {
            type: 'object',
            properties: {
              status: {
                type: 'string',
                enum: ['done', 'open'],
              },
              priority: {
                type: 'number',
              },
              assignee: {
                type: 'string',
              },
            },
          },
          sort: {
            type: 'string',
            enum: ['priority', 'id'],
          },
        },
      },
    );
  }

  protected createInvocation(
    params: ListTodosToolParams,
  ): ToolInvocation<ListTodosToolParams, ToolResult> {
    return new ListTodosToolInvocation(this.config, params);
  }
}

// ===== add_todo =====

export interface AddTodoToolParams {
  task: string;
  parent?: number;
  priority?: number;
  assignee?: string;
  tags?: string[];
}

class AddTodoToolInvocation extends BaseToolInvocation<
  AddTodoToolParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: AddTodoToolParams,
  ) {
    super(params);
  }

  getDescription(): string {
    return `Adding todo: ${this.params.task}`;
  }

  async execute(): Promise<ToolResult> {
    return new Promise((resolve) => {
      todoQueue.add(async () => {
        const todos = await readTodos(this.config);
        const newTodo: Todo = {
          id: todos.length > 0 ? Math.max(...todos.map((t) => t.id)) + 1 : 1,
          task: this.params.task,
          done: false,
          priority: this.params.priority,
          assignee: this.params.assignee,
          tags: this.params.tags,
        };

        if (this.params.parent) {
          const parent = findTodoById(todos, this.params.parent);
          if (parent) {
            if (!parent.todos) {
              parent.todos = [];
            }
            parent.todos.push(newTodo);
          } else {
            const llmContent = `Parent todo with id ${this.params.parent} not found.`;
            const result = {
              llmContent,
              returnDisplay: llmContent,
              error: {
                message: llmContent,
              },
            };
            resolve(result);
            return result;
          }
        } else {
          todos.push(newTodo);
        }

        await writeTodos(this.config, todos);
        const llmContent = `Added todo: "${this.params.task}"`;
        const result = {
          llmContent,
          returnDisplay: llmContent,
        };
        resolve(result);
        return result;
      });
    });
  }
}

export class AddTodoTool extends BaseDeclarativeTool<
  AddTodoToolParams,
  ToolResult
> {
  static readonly Name: string = 'add_todo';

  constructor(private readonly config: Config) {
    super(AddTodoTool.Name, 'AddTodo', 'Adds a new todo item.', Kind.Edit, {
      properties: {
        task: {
          type: 'string',
          description: 'The task to add.',
        },
        parent: {
          type: 'number',
          description: 'The id of the parent todo.',
        },
        priority: {
          type: 'number',
          description: 'The priority of the todo.',
        },
        assignee: {
          type: 'string',
          description: 'The user to assign the todo to.',
        },
        tags: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'A list of tags for the todo.',
        },
      },
      required: ['task'],
      type: 'object',
    });
  }

  protected createInvocation(
    params: AddTodoToolParams,
  ): ToolInvocation<AddTodoToolParams, ToolResult> {
    return new AddTodoToolInvocation(this.config, params);
  }
}

// ===== edit_todo =====

export interface EditTodoToolParams {
  id: number;
  task?: string;
  done?: boolean;
  priority?: number;
  assignee?: string;
  tags?: string[];
}

class EditTodoToolInvocation extends BaseToolInvocation<
  EditTodoToolParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: EditTodoToolParams,
  ) {
    super(params);
  }

  getDescription(): string {
    return `Editing todo: ${this.params.id}`;
  }

  async execute(): Promise<ToolResult> {
    return new Promise((resolve) => {
      todoQueue.add(async () => {
        const todos = await readTodos(this.config);
        const todo = todos.find((t) => t.id === this.params.id);
        if (!todo) {
          const llmContent = `Todo with id ${this.params.id} not found.`;
          const result = {
            llmContent,
            returnDisplay: llmContent,
            error: {
              message: llmContent,
            },
          };
          resolve(result);
          return result;
        }
        if (this.params.task !== undefined) {
          todo.task = this.params.task;
        }
        if (this.params.done !== undefined) {
          todo.done = this.params.done;
        }
        if (this.params.priority !== undefined) {
          todo.priority = this.params.priority;
        }
        if (this.params.assignee !== undefined) {
          todo.assignee = this.params.assignee;
        }
        if (this.params.tags !== undefined) {
          todo.tags = this.params.tags;
        }
        await writeTodos(this.config, todos);
        const llmContent = `Edited todo ${this.params.id}.`;
        const result = {
          llmContent,
          returnDisplay: llmContent,
        };
        resolve(result);
        return result;
      });
    });
  }
}

export class EditTodoTool extends BaseDeclarativeTool<
  EditTodoToolParams,
  ToolResult
> {
  static readonly Name: string = 'edit_todo';

  constructor(private readonly config: Config) {
    super(
      EditTodoTool.Name,
      'EditTodo',
      'Edits an existing todo item.',
      Kind.Edit,
      {
        properties: {
          id: {
            type: 'number',
            description: 'The id of the todo to edit.',
          },
          task: {
            type: 'string',
            description: 'The new task description.',
          },
          done: {
            type: 'boolean',
            description: 'The new done status.',
          },
          priority: {
            type: 'number',
            description: 'The new priority.',
          },
          assignee: {
            type: 'string',
            description: 'The user to assign the todo to.',
          },
          tags: {
            type: 'array',
            items: {
              type: 'string',
            },
            description: 'The new list of tags.',
          },
        },
        required: ['id'],
        type: 'object',
      },
    );
  }

  protected createInvocation(
    params: EditTodoToolParams,
  ): ToolInvocation<EditTodoToolParams, ToolResult> {
    return new EditTodoToolInvocation(this.config, params);
  }
}

// ===== remove_todo =====

export interface RemoveTodoToolParams {
  id: number;
}

function removeTodoById(todos: Todo[], id: number): Todo[] {
  return todos.filter((todo) => {
    if (todo.id === id) {
      return false;
    }
    if (todo.todos) {
      todo.todos = removeTodoById(todo.todos, id);
    }
    return true;
  });
}

class RemoveTodoToolInvocation extends BaseToolInvocation<
  RemoveTodoToolParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: RemoveTodoToolParams,
  ) {
    super(params);
  }

  getDescription(): string {
    return `Removing todo: ${this.params.id}`;
  }

  async execute(): Promise<ToolResult> {
    return new Promise((resolve) => {
      todoQueue.add(async () => {
        const todos = await readTodos(this.config);
        const newTodos = removeTodoById(todos, this.params.id);

        if (todos.length === newTodos.length) {
          const llmContent = `Todo with id ${this.params.id} not found.`;
          const result = {
            llmContent,
            returnDisplay: llmContent,
            error: {
              message: llmContent,
            },
          };
          resolve(result);
          return result;
        }

        await writeTodos(this.config, newTodos);
        const llmContent = `Removed todo ${this.params.id}.`;
        const result = {
          llmContent,
          returnDisplay: llmContent,
        };
        resolve(result);
        return result;
      });
    });
  }
}

export class RemoveTodoTool extends BaseDeclarativeTool<
  RemoveTodoToolParams,
  ToolResult
> {
  static readonly Name: string = 'remove_todo';

  constructor(private readonly config: Config) {
    super(
      RemoveTodoTool.Name,
      'RemoveTodo',
      'Removes a todo item.',
      Kind.Edit,
      {
        properties: {
          id: {
            type: 'number',
            description: 'The id of the todo to remove.',
          },
        },
        required: ['id'],
        type: 'object',
      },
    );
  }

  protected createInvocation(
    params: RemoveTodoToolParams,
  ): ToolInvocation<RemoveTodoToolParams, ToolResult> {
    return new RemoveTodoToolInvocation(this.config, params);
  }
}
