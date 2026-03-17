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
} from './tools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type { Config } from '../config/config.js';
import { WRITE_TODOS_TOOL_NAME } from './tool-names.js';
import { WRITE_TODOS_DEFINITION } from './definitions/coreTools.js';
import { resolveToolDeclaration } from './definitions/resolver.js';

const TODO_STATUSES = [
  'pending',
  'in_progress',
  'completed',
  'cancelled',
] as const;

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
  private readonly config: Config;

  constructor(
    params: WriteTodosToolParams,
    config: Config,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
    this.config = config;
  }

  getDescription(): string {
    const count = this.params.todos?.length ?? 0;
    if (count === 0) {
      return 'Cleared todo list';
    }
    return `Set ${count} todo(s)`;
  }

  async execute(
    _signal: AbortSignal,
    _updateOutput?: (output: string) => void,
  ): Promise<ToolResult> {
    const todos = this.params.todos ?? [];
    const todoListString = todos
      .map(
        (todo, index) => `${index + 1}. [${todo.status}] ${todo.description}`,
      )
      .join('\n');

    let llmContent =
      todos.length > 0
        ? `Successfully updated the todo list. The current list is now:\n${todoListString}`
        : 'Successfully cleared the todo list.';

    if (this.config.getAklEnabled() && this.config.getActiveEpicId()) {
      const completedTask = todos.find((t) => t.status === 'completed');
      if (completedTask) {
        llmContent += `\n\n**AKL NOTIFICATION**: You have completed a task. You MUST now update the Epic situational awareness using \`update_epic_state\` (type: 'task_log') and record any new architectural decisions or machine-learnings if applicable.`;
      }
    }

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
  private readonly config: Config;

  constructor(config: Config, messageBus: MessageBus) {
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
    this.config = config;
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
      this.config,
      messageBus,
      _toolName,
      _displayName,
    );
  }
}
