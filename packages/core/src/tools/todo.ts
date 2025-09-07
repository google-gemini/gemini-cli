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
}

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

// ===== list_todos =====

export type ListTodosToolParams = Record<string, never>;

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
    const todos = await readTodos(this.config);
    if (todos.length === 0) {
      return {
        llmContent: 'No todos found.',
        returnDisplay: 'No todos found.',
      };
    }
    const llmContent = `Here are your todos:\n${JSON.stringify(todos, null, 2)}`;
    return {
      llmContent,
      returnDisplay: llmContent,
    };
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
        properties: {},
        required: [],
        type: 'object',
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
    const todos = await readTodos(this.config);
    const newTodo: Todo = {
      id: todos.length > 0 ? Math.max(...todos.map((t) => t.id)) + 1 : 1,
      task: this.params.task,
      done: false,
    };
    todos.push(newTodo);
    await writeTodos(this.config, todos);
    const llmContent = `Added todo: "${this.params.task}"`;
    return {
      llmContent,
      returnDisplay: llmContent,
    };
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
    const todos = await readTodos(this.config);
    const todo = todos.find((t) => t.id === this.params.id);
    if (!todo) {
      const llmContent = `Todo with id ${this.params.id} not found.`;
      return {
        llmContent,
        returnDisplay: llmContent,
        error: {
          message: llmContent,
        },
      };
    }
    if (this.params.task !== undefined) {
      todo.task = this.params.task;
    }
    if (this.params.done !== undefined) {
      todo.done = this.params.done;
    }
    await writeTodos(this.config, todos);
    const llmContent = `Edited todo ${this.params.id}.`;
    return {
      llmContent,
      returnDisplay: llmContent,
    };
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
    const todos = await readTodos(this.config);
    const newTodos = todos.filter((t) => t.id !== this.params.id);
    if (todos.length === newTodos.length) {
      const llmContent = `Todo with id ${this.params.id} not found.`;
      return {
        llmContent,
        returnDisplay: llmContent,
        error: {
          message: llmContent,
        },
      };
    }
    await writeTodos(this.config, newTodos);
    const llmContent = `Removed todo ${this.params.id}.`;
    return {
      llmContent,
      returnDisplay: llmContent,
    };
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
