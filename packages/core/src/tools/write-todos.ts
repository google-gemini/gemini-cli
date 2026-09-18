/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolInvocation,
  type Todo,
  type ToolResult,
  type ExecuteOptions,
} from './tools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { WRITE_TODOS_TOOL_NAME } from './tool-names.js';
import { WRITE_TODOS_DEFINITION } from './definitions/coreTools.js';
import { resolveToolDeclaration } from './definitions/resolver.js';
import type { TrackerService } from '../services/trackerService.js';
import { TaskStatus, TaskType } from '../services/trackerTypes.js';
import { buildTodosReturnDisplay } from './trackerTools.js';

const TODO_STATUSES = [
  'pending',
  'in_progress',
  'completed',
  'cancelled',
  'blocked',
] as const;

/**
 * Maps a WriteTodos status string to a TrackerService TaskStatus.
 */
function mapTodoStatusToTaskStatus(status: string): TaskStatus {
  switch (status) {
    case 'in_progress':
      return TaskStatus.IN_PROGRESS;
    case 'completed':
      return TaskStatus.CLOSED;
    case 'blocked':
      return TaskStatus.BLOCKED;
    case 'cancelled':
      return TaskStatus.CLOSED;
    case 'pending':
    default:
      return TaskStatus.OPEN;
  }
}

export interface WriteTodosToolParams {
  /**
   * The full list of todos. This will overwrite any existing list.
   */
  todos: Todo[];
}

class WriteTodosToolInvocation extends BaseToolInvocation<
  WriteTodosToolParams,
  ToolResult
> {
  constructor(
    params: WriteTodosToolParams,
    messageBus: MessageBus,
    private readonly trackerService?: TrackerService,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
  }

  getDescription(): string {
    const count = this.params.todos?.length ?? 0;
    if (count === 0) {
      return 'Cleared todo list';
    }
    return `Set ${count} todo(s)`;
  }

  async execute({ abortSignal: _signal }: ExecuteOptions): Promise<ToolResult> {
    const todos = this.params.todos ?? [];

    // If we have a TrackerService, persist the todos through it.
    if (this.trackerService) {
      return this.executeWithPersistence(todos);
    }

    // Legacy fallback: in-context only (no persistence).
    return this.executeInContext(todos);
  }

  /**
   * Persists todos via the TrackerService. Clears existing tasks and
   * recreates them from the provided list so the on-disk state matches
   * what the model declared.
   */
  private async executeWithPersistence(todos: Todo[]): Promise<ToolResult> {
    const service = this.trackerService!;

    // Clear existing tasks so the file-based tracker matches the
    // model's declared list exactly.
    await service.clearTasks();

    if (todos.length === 0) {
      return {
        llmContent:
          'Successfully cleared the todo list. Tasks have been removed from persistent storage.',
        returnDisplay: { todos: [] },
      };
    }

    // Create each todo as a persistent tracker task.
    for (const todo of todos) {
      await service.createTask({
        title: todo.description,
        description: todo.description,
        type: TaskType.TASK,
        status: mapTodoStatusToTaskStatus(todo.status),
        dependencies: [],
      });
    }

    const todoListString = todos
      .map(
        (todo, index) => `${index + 1}. [${todo.status}] ${todo.description}`,
      )
      .join('\n');

    return {
      llmContent: `Successfully updated the todo list (persisted to disk). The current list is now:\n${todoListString}`,
      returnDisplay: await buildTodosReturnDisplay(service),
    };
  }

  /**
   * Legacy in-context execution without persistence.
   */
  private executeInContext(todos: Todo[]): ToolResult {
    const todoListString = todos
      .map(
        (todo, index) => `${index + 1}. [${todo.status}] ${todo.description}`,
      )
      .join('\n');

    const llmContent =
      todos.length > 0
        ? `Successfully updated the todo list. The current list is now:\n${todoListString}`
        : 'Successfully cleared the todo list.';

    return {
      llmContent,
      returnDisplay: { todos },
    };
  }
}

export class WriteTodosTool extends BaseDeclarativeTool<
  WriteTodosToolParams,
  ToolResult
> {
  static readonly Name = WRITE_TODOS_TOOL_NAME;

  constructor(
    messageBus: MessageBus,
    private readonly trackerService?: TrackerService,
  ) {
    super(
      WriteTodosTool.Name,
      'WriteTodos',
      WRITE_TODOS_DEFINITION.base.description!,
      Kind.Other,
      WRITE_TODOS_DEFINITION.base.parametersJsonSchema,
      messageBus,
      true, // isOutputMarkdown
      false, // canUpdateOutput
    );
  }

  override getSchema(modelId?: string) {
    return resolveToolDeclaration(WRITE_TODOS_DEFINITION, modelId);
  }

  protected override validateToolParamValues(
    params: WriteTodosToolParams,
  ): string | null {
    const todos = params?.todos;
    if (!params || !Array.isArray(todos)) {
      return '`todos` parameter must be an array';
    }

    for (const todo of todos) {
      if (typeof todo !== 'object' || todo === null) {
        return 'Each todo item must be an object';
      }
      if (typeof todo.description !== 'string' || !todo.description.trim()) {
        return 'Each todo must have a non-empty description string';
      }
      if (!TODO_STATUSES.includes(todo.status)) {
        return `Each todo must have a valid status (${TODO_STATUSES.join(', ')})`;
      }
    }

    const inProgressCount = todos.filter(
      (todo: Todo) => todo.status === 'in_progress',
    ).length;

    if (inProgressCount > 1) {
      return 'Invalid parameters: Only one task can be "in_progress" at a time.';
    }

    return null;
  }

  protected createInvocation(
    params: WriteTodosToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _displayName?: string,
  ): ToolInvocation<WriteTodosToolParams, ToolResult> {
    return new WriteTodosToolInvocation(
      params,
      messageBus,
      this.trackerService,
      _toolName,
      _displayName,
    );
  }
}
