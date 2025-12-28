/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ToolInvocation } from './tools.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolResult,
} from './tools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { READ_TODOS_TOOL_NAME } from './tool-names.js';
import { getTodoStateManager } from './todo-state-manager.js';
import type { Config } from '../config/config.js';

const READ_TODOS_DESCRIPTION = `Read the current todo list to remind yourself of pending tasks and their statuses.

Use this tool when you need to:
- Check the current state of the todo list after context window summarization
- Verify which tasks are completed, in progress, or pending
- Get an overview of remaining work
- Remind yourself of the task plan after several tool executions

The tool returns the complete list of todos with their statuses and indices.

## Output Format
Each todo is displayed as:
\`[index]. [status] description\`

## Statistics
The tool also provides statistics showing completed/total tasks.
`;

export interface ReadTodosToolParams {
  /** Optional: only show todos with specific status */
  filter_status?: 'pending' | 'in_progress' | 'completed' | 'cancelled';
}

class ReadTodosToolInvocation extends BaseToolInvocation<
  ReadTodosToolParams,
  ToolResult
> {
  constructor(
    params: ReadTodosToolParams,
    private readonly config: Config,
    messageBus?: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
  }

  getDescription(): string {
    const filter = this.params.filter_status;
    if (filter) {
      return `Read todos (filtered by ${filter})`;
    }
    return 'Read current todo list';
  }

  async execute(
    _signal: AbortSignal,
    _updateOutput?: (output: string) => void,
  ): Promise<ToolResult> {
    const stateManager = getTodoStateManager();

    // Initialize state manager if not already done
    if (!stateManager.isInitialized()) {
      const persistDir = this.config.storage.getProjectTempDir();
      await stateManager.initialize(persistDir);
    }

    const todos = stateManager.getTodos();
    const stats = stateManager.getStats();
    const filter = this.params.filter_status;

    // Apply filter if specified
    const filteredTodos = filter
      ? todos.filter((t) => t.status === filter)
      : todos;

    if (todos.length === 0) {
      return {
        llmContent: 'The todo list is empty. No tasks have been created yet.',
        returnDisplay: { todos: [] },
      };
    }

    // Format todos with their original indices
    const todoListString = todos
      .map((todo, index) => {
        if (filter && todo.status !== filter) {
          return null;
        }
        return `${index + 1}. [${todo.status}] ${todo.description}`;
      })
      .filter(Boolean)
      .join('\n');

    // Build statistics string
    const activeCount = stats.total - stats.cancelled;
    const progressPercent =
      activeCount > 0 ? Math.round((stats.completed / activeCount) * 100) : 0;

    let statsString = `\n\nStatistics: ${stats.completed}/${activeCount} completed (${progressPercent}%)`;
    if (stats.inProgress > 0) {
      const inProgressTask = todos.find((t) => t.status === 'in_progress');
      statsString += `\nCurrently working on: Task ${todos.indexOf(inProgressTask!) + 1}`;
    }
    if (stats.cancelled > 0) {
      statsString += `\n${stats.cancelled} task(s) cancelled`;
    }

    let llmContent: string;
    if (filter) {
      const filterCount = filteredTodos.length;
      llmContent =
        filterCount > 0
          ? `Showing ${filterCount} "${filter}" task(s):\n${todoListString}${statsString}`
          : `No tasks with status "${filter}".${statsString}`;
    } else {
      llmContent = `Current todo list:\n${todoListString}${statsString}`;
    }

    return {
      llmContent,
      returnDisplay: { todos },
    };
  }
}

export class ReadTodosTool extends BaseDeclarativeTool<
  ReadTodosToolParams,
  ToolResult
> {
  static readonly Name = READ_TODOS_TOOL_NAME;

  constructor(
    private readonly config: Config,
    messageBus?: MessageBus,
  ) {
    super(
      ReadTodosTool.Name,
      'ReadTodos',
      READ_TODOS_DESCRIPTION,
      Kind.Other,
      {
        type: 'object',
        properties: {
          filter_status: {
            type: 'string',
            description:
              'Optional: Filter to show only todos with a specific status.',
            enum: ['pending', 'in_progress', 'completed', 'cancelled'],
          },
        },
        additionalProperties: false,
      },
      true, // isOutputMarkdown
      false, // canUpdateOutput
      messageBus,
    );
  }

  protected override validateToolParamValues(
    params: ReadTodosToolParams,
  ): string | null {
    const validStatuses = ['pending', 'in_progress', 'completed', 'cancelled'];
    if (params.filter_status && !validStatuses.includes(params.filter_status)) {
      return `Invalid filter_status: "${params.filter_status}". Valid values are: ${validStatuses.join(', ')}.`;
    }
    return null;
  }

  protected createInvocation(
    params: ReadTodosToolParams,
    _messageBus?: MessageBus,
    _toolName?: string,
    _displayName?: string,
  ): ToolInvocation<ReadTodosToolParams, ToolResult> {
    return new ReadTodosToolInvocation(
      params,
      this.config,
      this.messageBus,
      _toolName,
      _displayName,
    );
  }
}
