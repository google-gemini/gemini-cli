/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Todo, TodoStatus } from './tools.js';

const TODO_FILE_NAME = 'todos.json';

/**
 * Persistent state for todos with metadata.
 */
export interface TodoState {
  todos: Todo[];
  lastUpdated: string;
  sessionId?: string;
}

/**
 * Result of a todo operation.
 */
export interface TodoOperationResult {
  success: boolean;
  message: string;
  todos: Todo[];
  affectedIndex?: number;
}

/**
 * Centralized state manager for todos with persistence support.
 *
 * This manager provides:
 * - In-memory state management
 * - Persistence to disk (survives session restarts)
 * - Granular operations (add, update, complete, cancel, remove)
 * - Validation (e.g., only one in_progress at a time)
 */
export class TodoStateManager {
  private todos: Todo[] = [];
  private persistPath: string | null = null;
  private sessionId: string | undefined;
  private initialized = false;

  /**
   * Initialize the state manager with a persistence directory.
   * This should be called with the project temp directory.
   *
   * @param persistDir Directory where todos.json will be stored
   * @param sessionId Optional session ID for tracking
   */
  async initialize(persistDir: string, sessionId?: string): Promise<void> {
    this.persistPath = path.join(persistDir, TODO_FILE_NAME);
    this.sessionId = sessionId;

    // Ensure directory exists
    try {
      await fs.promises.mkdir(persistDir, { recursive: true });
    } catch {
      // Directory may already exist
    }

    // Load existing state if available
    await this.loadState();
    this.initialized = true;
  }

  /**
   * Check if the state manager is initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get the current list of todos.
   */
  getTodos(): Todo[] {
    return [...this.todos];
  }

  /**
   * Set the entire todo list (for compatibility with write_todos).
   */
  async setTodos(todos: Todo[]): Promise<TodoOperationResult> {
    const validationError = this.validateTodos(todos);
    if (validationError) {
      return {
        success: false,
        message: validationError,
        todos: this.todos,
      };
    }

    this.todos = [...todos];
    await this.saveState();

    return {
      success: true,
      message:
        todos.length > 0
          ? `Successfully updated the todo list with ${todos.length} item(s).`
          : 'Successfully cleared the todo list.',
      todos: this.todos,
    };
  }

  /**
   * Add a new todo to the list.
   */
  async addTodo(
    description: string,
    status: TodoStatus = 'pending',
  ): Promise<TodoOperationResult> {
    if (!description.trim()) {
      return {
        success: false,
        message: 'Todo description cannot be empty.',
        todos: this.todos,
      };
    }

    // Check if setting to in_progress would violate the constraint
    if (status === 'in_progress') {
      const existingInProgress = this.todos.findIndex(
        (t) => t.status === 'in_progress',
      );
      if (existingInProgress !== -1) {
        return {
          success: false,
          message: `Cannot add a new task as in_progress. Task ${existingInProgress + 1} is already in progress. Complete or cancel it first.`,
          todos: this.todos,
        };
      }
    }

    const newTodo: Todo = { description: description.trim(), status };
    this.todos.push(newTodo);
    await this.saveState();

    return {
      success: true,
      message: `Added new todo: "${description}" with status "${status}".`,
      todos: this.todos,
      affectedIndex: this.todos.length - 1,
    };
  }

  /**
   * Update the status of a specific todo by index (1-based for user-facing operations).
   */
  async updateStatus(
    index: number,
    status: TodoStatus,
  ): Promise<TodoOperationResult> {
    const zeroBasedIndex = index - 1;

    if (zeroBasedIndex < 0 || zeroBasedIndex >= this.todos.length) {
      return {
        success: false,
        message: `Invalid todo index: ${index}. Valid range is 1 to ${this.todos.length}.`,
        todos: this.todos,
      };
    }

    // Check if setting to in_progress would violate the constraint
    if (status === 'in_progress') {
      const existingInProgress = this.todos.findIndex(
        (t) => t.status === 'in_progress',
      );
      if (existingInProgress !== -1 && existingInProgress !== zeroBasedIndex) {
        return {
          success: false,
          message: `Cannot set task ${index} to in_progress. Task ${existingInProgress + 1} is already in progress. Complete or cancel it first.`,
          todos: this.todos,
        };
      }
    }

    const oldStatus = this.todos[zeroBasedIndex].status;
    this.todos[zeroBasedIndex].status = status;
    await this.saveState();

    return {
      success: true,
      message: `Updated task ${index} from "${oldStatus}" to "${status}".`,
      todos: this.todos,
      affectedIndex: zeroBasedIndex,
    };
  }

  /**
   * Update the description of a specific todo by index (1-based).
   */
  async updateDescription(
    index: number,
    description: string,
  ): Promise<TodoOperationResult> {
    const zeroBasedIndex = index - 1;

    if (zeroBasedIndex < 0 || zeroBasedIndex >= this.todos.length) {
      return {
        success: false,
        message: `Invalid todo index: ${index}. Valid range is 1 to ${this.todos.length}.`,
        todos: this.todos,
      };
    }

    if (!description.trim()) {
      return {
        success: false,
        message: 'Todo description cannot be empty.',
        todos: this.todos,
      };
    }

    const oldDescription = this.todos[zeroBasedIndex].description;
    this.todos[zeroBasedIndex].description = description.trim();
    await this.saveState();

    return {
      success: true,
      message: `Updated task ${index} description from "${oldDescription}" to "${description}".`,
      todos: this.todos,
      affectedIndex: zeroBasedIndex,
    };
  }

  /**
   * Mark a todo as completed by index (1-based).
   */
  async completeTodo(index: number): Promise<TodoOperationResult> {
    return this.updateStatus(index, 'completed');
  }

  /**
   * Mark a todo as cancelled by index (1-based).
   */
  async cancelTodo(index: number): Promise<TodoOperationResult> {
    return this.updateStatus(index, 'cancelled');
  }

  /**
   * Start working on a todo (set to in_progress) by index (1-based).
   */
  async startTodo(index: number): Promise<TodoOperationResult> {
    return this.updateStatus(index, 'in_progress');
  }

  /**
   * Remove a todo from the list by index (1-based).
   */
  async removeTodo(index: number): Promise<TodoOperationResult> {
    const zeroBasedIndex = index - 1;

    if (zeroBasedIndex < 0 || zeroBasedIndex >= this.todos.length) {
      return {
        success: false,
        message: `Invalid todo index: ${index}. Valid range is 1 to ${this.todos.length}.`,
        todos: this.todos,
      };
    }

    const removed = this.todos.splice(zeroBasedIndex, 1)[0];
    await this.saveState();

    return {
      success: true,
      message: `Removed task ${index}: "${removed.description}".`,
      todos: this.todos,
      affectedIndex: zeroBasedIndex,
    };
  }

  /**
   * Insert a todo at a specific position (1-based).
   */
  async insertTodo(
    index: number,
    description: string,
    status: TodoStatus = 'pending',
  ): Promise<TodoOperationResult> {
    const zeroBasedIndex = index - 1;

    if (zeroBasedIndex < 0 || zeroBasedIndex > this.todos.length) {
      return {
        success: false,
        message: `Invalid insert position: ${index}. Valid range is 1 to ${this.todos.length + 1}.`,
        todos: this.todos,
      };
    }

    if (!description.trim()) {
      return {
        success: false,
        message: 'Todo description cannot be empty.',
        todos: this.todos,
      };
    }

    // Check if setting to in_progress would violate the constraint
    if (status === 'in_progress') {
      const existingInProgress = this.todos.findIndex(
        (t) => t.status === 'in_progress',
      );
      if (existingInProgress !== -1) {
        return {
          success: false,
          message: `Cannot insert a task as in_progress. Task ${existingInProgress + 1} is already in progress.`,
          todos: this.todos,
        };
      }
    }

    const newTodo: Todo = { description: description.trim(), status };
    this.todos.splice(zeroBasedIndex, 0, newTodo);
    await this.saveState();

    return {
      success: true,
      message: `Inserted new todo at position ${index}: "${description}".`,
      todos: this.todos,
      affectedIndex: zeroBasedIndex,
    };
  }

  /**
   * Clear all todos.
   */
  async clearTodos(): Promise<TodoOperationResult> {
    this.todos = [];
    await this.saveState();

    return {
      success: true,
      message: 'Cleared all todos.',
      todos: this.todos,
    };
  }

  /**
   * Get statistics about the current todo list.
   */
  getStats(): {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    cancelled: number;
  } {
    return {
      total: this.todos.length,
      pending: this.todos.filter((t) => t.status === 'pending').length,
      inProgress: this.todos.filter((t) => t.status === 'in_progress').length,
      completed: this.todos.filter((t) => t.status === 'completed').length,
      cancelled: this.todos.filter((t) => t.status === 'cancelled').length,
    };
  }

  /**
   * Validate a list of todos.
   */
  private validateTodos(todos: Todo[]): string | null {
    if (!Array.isArray(todos)) {
      return 'Todos must be an array.';
    }

    const validStatuses: TodoStatus[] = [
      'pending',
      'in_progress',
      'completed',
      'cancelled',
    ];

    for (const todo of todos) {
      if (typeof todo !== 'object' || todo === null) {
        return 'Each todo must be an object.';
      }
      if (typeof todo.description !== 'string' || !todo.description.trim()) {
        return 'Each todo must have a non-empty description.';
      }
      if (!validStatuses.includes(todo.status)) {
        return `Invalid status: "${todo.status}". Valid statuses are: ${validStatuses.join(', ')}.`;
      }
    }

    const inProgressCount = todos.filter(
      (t) => t.status === 'in_progress',
    ).length;
    if (inProgressCount > 1) {
      return 'Only one todo can be in_progress at a time.';
    }

    return null;
  }

  /**
   * Load state from disk.
   */
  private async loadState(): Promise<void> {
    if (!this.persistPath) return;

    try {
      const data = await fs.promises.readFile(this.persistPath, 'utf-8');
      const state: TodoState = JSON.parse(data);
      this.todos = state.todos || [];
    } catch {
      // File doesn't exist or is invalid, start with empty list
      this.todos = [];
    }
  }

  /**
   * Save state to disk.
   */
  private async saveState(): Promise<void> {
    if (!this.persistPath) return;

    const state: TodoState = {
      todos: this.todos,
      lastUpdated: new Date().toISOString(),
      sessionId: this.sessionId,
    };

    try {
      await fs.promises.writeFile(
        this.persistPath,
        JSON.stringify(state, null, 2),
        'utf-8',
      );
    } catch (error) {
      // Log error but don't fail the operation
      console.error('Failed to persist todo state:', error);
    }
  }

  /**
   * Format todos as a string for LLM output.
   */
  formatTodosForLLM(): string {
    if (this.todos.length === 0) {
      return 'No todos in the list.';
    }

    return this.todos
      .map(
        (todo, index) => `${index + 1}. [${todo.status}] ${todo.description}`,
      )
      .join('\n');
  }
}

// Singleton instance for shared state across tools
let globalStateManager: TodoStateManager | null = null;

/**
 * Get the global TodoStateManager instance.
 * Creates a new instance if one doesn't exist.
 */
export function getTodoStateManager(): TodoStateManager {
  if (!globalStateManager) {
    globalStateManager = new TodoStateManager();
  }
  return globalStateManager;
}

/**
 * Reset the global state manager (useful for testing).
 */
export function resetTodoStateManager(): void {
  globalStateManager = null;
}
