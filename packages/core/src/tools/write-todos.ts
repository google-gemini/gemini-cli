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
import {
  TaskStatus,
  TaskType,
  type TrackerTask,
} from '../services/trackerTypes.js';
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
   * Persists todos via the TrackerService using a reconciliation strategy
   * that preserves existing task IDs, types, parent-child relationships,
   * and dependencies. Only status is updated for matched tasks; new tasks
   * are created; tasks absent from the list are removed.
   */
  private async executeWithPersistence(todos: Todo[]): Promise<ToolResult> {
    const service = this.trackerService!;
    const existingTasks = await service.listTasks();

    if (todos.length === 0 && existingTasks.length === 0) {
      return {
        llmContent: 'Todo list is already empty.',
        returnDisplay: { todos: [] },
      };
    }

    // Group existing tasks by trimmed title to handle duplicate titles
    const existingByTitle = new Map<string, TrackerTask[]>();
    for (const task of existingTasks) {
      const title = task.title.trim().toLowerCase();
      if (!existingByTitle.has(title)) {
        existingByTitle.set(title, []);
      }
      existingByTitle.get(title)!.push(task);
    }

    const preservedIds = new Set<string>();
    const warnings: string[] = [];

    for (const todo of todos) {
      const originalTitle = todo.description.trim();
      const lookupKey = originalTitle.toLowerCase();
      const candidates = existingByTitle.get(lookupKey);
      const targetStatus = mapTodoStatusToTaskStatus(todo.status);

      if (candidates && candidates.length > 0) {
        // Shift one match off the array so duplicate titles each get their own match
        const existing = candidates.shift()!;
        preservedIds.add(existing.id);
        if (existing.status !== targetStatus) {
          try {
            await service.updateTask(existing.id, { status: targetStatus });
          } catch (e) {
            warnings.push(
              `Could not update "${originalTitle}" (${existing.id}): ${e instanceof Error ? e.message : String(e)}`,
            );
          }
        }
      } else {
        // New task: create it (use original casing for the stored title)
        try {
          const created = await service.createTask({
            title: originalTitle,
            description: originalTitle,
            type: TaskType.TASK,
            status: targetStatus,
            dependencies: [],
          });
          preservedIds.add(created.id);
        } catch (e) {
          warnings.push(
            `Could not create task "${originalTitle}": ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    }

    // Remove tasks that are no longer in the todo list. Use depth-sorted
    // deletion (deepest children first) so the service-layer child guard
    // doesn't block parent deletion. Skip any task whose subtree still
    // contains a preserved task (to avoid orphaning active work).
    //
    // Pre-index by id and parentId for O(1) lookups instead of O(N) scans.
    const tasksById = new Map<string, TrackerTask>(
      existingTasks.map((t) => [t.id, t]),
    );
    const childrenByParent = new Map<string, TrackerTask[]>();
    for (const t of existingTasks) {
      if (t.parentId) {
        if (!childrenByParent.has(t.parentId)) {
          childrenByParent.set(t.parentId, []);
        }
        childrenByParent.get(t.parentId)!.push(t);
      }
    }

    const getDepth = (task: TrackerTask): number => {
      let depth = 0;
      let current = task;
      const visited = new Set<string>();
      while (current.parentId) {
        if (visited.has(current.id)) break;
        visited.add(current.id);
        const parent = tasksById.get(current.parentId);
        if (!parent) break;
        depth++;
        current = parent;
      }
      return depth;
    };

    const hasPreservedDescendants = (
      id: string,
      visited = new Set<string>(),
    ): boolean => {
      if (visited.has(id)) return false;
      visited.add(id);
      const children = childrenByParent.get(id) ?? [];
      const result = children.some(
        (c) => preservedIds.has(c.id) || hasPreservedDescendants(c.id, visited),
      );
      visited.delete(id); // backtrack for sibling subtrees
      return result;
    };

    const tasksToDelete = existingTasks
      .filter(
        (task) =>
          !preservedIds.has(task.id) && !hasPreservedDescendants(task.id),
      )
      .map((task) => ({ task, depth: getDepth(task) }))
      .sort((a, b) => b.depth - a.depth)
      .map((item) => item.task);

    for (const task of tasksToDelete) {
      try {
        await service.deleteTask(task.id);
      } catch (e) {
        warnings.push(
          `Could not remove "${task.title}" (${task.id}): ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    const todoListString = todos
      .map(
        (todo, index) => `${index + 1}. [${todo.status}] ${todo.description}`,
      )
      .join('\n');

    let llmContent = `Successfully updated the todo list (persisted to disk). The current list is now:\n${todoListString}`;
    if (warnings.length > 0) {
      llmContent += `\n\nWarnings (${warnings.length}):\n${warnings.map((w) => `- ${w}`).join('\n')}`;
    }

    return {
      llmContent,
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
