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
  type TodoStatus,
  type ToolResult,
} from './tools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { MANAGE_TODOS_TOOL_NAME } from './tool-names.js';
import { getTodoStateManager } from './todo-state-manager.js';
import type { Config } from '../config/config.js';

const TODO_STATUSES = [
  'pending',
  'in_progress',
  'completed',
  'cancelled',
] as const;

const MANAGE_TODOS_DESCRIPTION = `Perform granular operations on the todo list without rewriting the entire list.

This tool allows you to efficiently modify specific todos:
- add: Add a new todo at the end of the list
- update_status: Change the status of a specific todo (by index)
- update_description: Change the description of a specific todo (by index)
- start: Mark a todo as in_progress (equivalent to update_status with in_progress)
- complete: Mark a todo as completed
- cancel: Mark a todo as cancelled
- remove: Remove a todo from the list
- insert: Insert a new todo at a specific position
- clear: Clear all todos

Use this tool for incremental updates instead of write_todos when you only need to modify one or a few items.

## Task Index
Task indices are 1-based (first task is 1, second is 2, etc.).

## Task State Rules
- Only one task can be "in_progress" at a time
- You must complete or cancel the current in_progress task before starting another

## Examples

Add a new task:
\`\`\`json
{"operation": "add", "description": "Implement user authentication"}
\`\`\`

Start working on task 2:
\`\`\`json
{"operation": "start", "index": 2}
\`\`\`

Complete task 1:
\`\`\`json
{"operation": "complete", "index": 1}
\`\`\`

Update description of task 3:
\`\`\`json
{"operation": "update_description", "index": 3, "description": "Implement OAuth2 authentication (updated scope)"}
\`\`\`
`;

type ManageTodosOperation =
  | 'add'
  | 'update_status'
  | 'update_description'
  | 'start'
  | 'complete'
  | 'cancel'
  | 'remove'
  | 'insert'
  | 'clear';

export interface ManageTodosToolParams {
  operation: ManageTodosOperation;
  /** Task index (1-based). Required for update_status, update_description, start, complete, cancel, remove. */
  index?: number;
  /** Task description. Required for add, update_description, insert. */
  description?: string;
  /** Task status. Required for update_status, optional for add and insert. */
  status?: TodoStatus;
}

class ManageTodosToolInvocation extends BaseToolInvocation<
  ManageTodosToolParams,
  ToolResult
> {
  constructor(
    params: ManageTodosToolParams,
    private readonly config: Config,
    messageBus?: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
  }

  getDescription(): string {
    const { operation, index, description, status } = this.params;
    switch (operation) {
      case 'add':
        return `Add todo: "${description}"`;
      case 'update_status':
        return `Update task ${index} status to ${status}`;
      case 'update_description':
        return `Update task ${index} description`;
      case 'start':
        return `Start task ${index}`;
      case 'complete':
        return `Complete task ${index}`;
      case 'cancel':
        return `Cancel task ${index}`;
      case 'remove':
        return `Remove task ${index}`;
      case 'insert':
        return `Insert todo at position ${index}`;
      case 'clear':
        return 'Clear all todos';
      default:
        return `Todo operation: ${operation}`;
    }
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

    const { operation, index, description, status } = this.params;
    let result;

    switch (operation) {
      case 'add':
        result = await stateManager.addTodo(description!, status);
        break;
      case 'update_status':
        result = await stateManager.updateStatus(index!, status!);
        break;
      case 'update_description':
        result = await stateManager.updateDescription(index!, description!);
        break;
      case 'start':
        result = await stateManager.startTodo(index!);
        break;
      case 'complete':
        result = await stateManager.completeTodo(index!);
        break;
      case 'cancel':
        result = await stateManager.cancelTodo(index!);
        break;
      case 'remove':
        result = await stateManager.removeTodo(index!);
        break;
      case 'insert':
        result = await stateManager.insertTodo(index!, description!, status);
        break;
      case 'clear':
        result = await stateManager.clearTodos();
        break;
      default:
        return {
          llmContent: `Unknown operation: ${operation}`,
          returnDisplay: { todos: stateManager.getTodos() },
        };
    }

    if (!result.success) {
      return {
        llmContent: `Operation failed: ${result.message}`,
        returnDisplay: { todos: result.todos },
      };
    }

    const todoListString = stateManager.formatTodosForLLM();
    const llmContent = `${result.message}\n\nCurrent todo list:\n${todoListString}`;

    return {
      llmContent,
      returnDisplay: { todos: result.todos },
    };
  }
}

export class ManageTodosTool extends BaseDeclarativeTool<
  ManageTodosToolParams,
  ToolResult
> {
  static readonly Name = MANAGE_TODOS_TOOL_NAME;

  constructor(
    private readonly config: Config,
    messageBus?: MessageBus,
  ) {
    super(
      ManageTodosTool.Name,
      'ManageTodos',
      MANAGE_TODOS_DESCRIPTION,
      Kind.Other,
      {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            description: 'The operation to perform on the todo list.',
            enum: [
              'add',
              'update_status',
              'update_description',
              'start',
              'complete',
              'cancel',
              'remove',
              'insert',
              'clear',
            ],
          },
          index: {
            type: 'integer',
            description:
              'The 1-based index of the task to operate on. Required for: update_status, update_description, start, complete, cancel, remove, insert.',
            minimum: 1,
          },
          description: {
            type: 'string',
            description:
              'The description of the task. Required for: add, update_description, insert.',
          },
          status: {
            type: 'string',
            description:
              'The status to set. Required for: update_status. Optional for: add, insert (defaults to pending).',
            enum: TODO_STATUSES,
          },
        },
        required: ['operation'],
        additionalProperties: false,
      },
      true, // isOutputMarkdown
      false, // canUpdateOutput
      messageBus,
    );
  }

  protected override validateToolParamValues(
    params: ManageTodosToolParams,
  ): string | null {
    const { operation, index, description, status } = params;

    // Validate operation-specific requirements
    switch (operation) {
      case 'add':
        if (!description?.trim()) {
          return 'The "description" parameter is required for the "add" operation.';
        }
        if (status && !TODO_STATUSES.includes(status)) {
          return `Invalid status: "${status}". Valid statuses are: ${TODO_STATUSES.join(', ')}.`;
        }
        break;

      case 'update_status':
        if (index === undefined || index < 1) {
          return 'The "index" parameter must be a positive integer for the "update_status" operation.';
        }
        if (!status || !TODO_STATUSES.includes(status)) {
          return `The "status" parameter is required and must be one of: ${TODO_STATUSES.join(', ')}.`;
        }
        break;

      case 'update_description':
        if (index === undefined || index < 1) {
          return 'The "index" parameter must be a positive integer for the "update_description" operation.';
        }
        if (!description?.trim()) {
          return 'The "description" parameter is required for the "update_description" operation.';
        }
        break;

      case 'start':
      case 'complete':
      case 'cancel':
      case 'remove':
        if (index === undefined || index < 1) {
          return `The "index" parameter must be a positive integer for the "${operation}" operation.`;
        }
        break;

      case 'insert':
        if (index === undefined || index < 1) {
          return 'The "index" parameter must be a positive integer for the "insert" operation.';
        }
        if (!description?.trim()) {
          return 'The "description" parameter is required for the "insert" operation.';
        }
        if (status && !TODO_STATUSES.includes(status)) {
          return `Invalid status: "${status}". Valid statuses are: ${TODO_STATUSES.join(', ')}.`;
        }
        break;

      case 'clear':
        // No additional parameters required
        break;

      default:
        return `Unknown operation: "${operation}". Valid operations are: add, update_status, update_description, start, complete, cancel, remove, insert, clear.`;
    }

    return null;
  }

  protected createInvocation(
    params: ManageTodosToolParams,
    _messageBus?: MessageBus,
    _toolName?: string,
    _displayName?: string,
  ): ToolInvocation<ManageTodosToolParams, ToolResult> {
    return new ManageTodosToolInvocation(
      params,
      this.config,
      this.messageBus,
      _toolName,
      _displayName,
    );
  }
}
