/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseDeclarativeTool,
  ToolResult,
  Icon,
  BaseToolInvocation,
} from './tools.js';
import { ToolErrorType } from './tool-error.js';
import { Type } from '@google/genai';
import * as fs from 'fs/promises';
import * as path from 'path';
import { homedir } from 'os';

const GEMINI_CONFIG_DIR = '.gemini';
const TODO_FILENAME = 'todos.md';

export interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  id: string;
}

export interface TodoWriteParams {
  todos: TodoItem[];
}

function getTodoFilePath(): string {
  return path.join(homedir(), GEMINI_CONFIG_DIR, TODO_FILENAME);
}

function formatTodoForMarkdown(todo: TodoItem): string {
  const checkbox = todo.status === 'completed' ? '[x]' : 
                   todo.status === 'in_progress' ? '[⏳]' : 
                   '[ ]';
  return `- ${checkbox} ${todo.content}`;
}

function formatTodosForDisplay(todos: TodoItem[]): string {
  if (todos.length === 0) {
    return 'No todos currently tracked.';
  }
  
  return todos.map(formatTodoForMarkdown).join('\n');
}

class TodoWriteInvocation extends BaseToolInvocation<TodoWriteParams, ToolResult> {
  constructor(params: TodoWriteParams) {
    super(params);
  }

  getDescription(): string {
    const todoCount = this.params.todos.length;
    const statusCounts = {
      pending: this.params.todos.filter(t => t.status === 'pending').length,
      in_progress: this.params.todos.filter(t => t.status === 'in_progress').length,
      completed: this.params.todos.filter(t => t.status === 'completed').length,
    };
    
    return `Update todo list with ${todoCount} items (${statusCounts.completed} completed, ${statusCounts.in_progress} in progress, ${statusCounts.pending} pending)`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    try {
      const todoFilePath = getTodoFilePath();
      const todoDir = path.dirname(todoFilePath);
      
      // Ensure the .gemini directory exists
      try {
        await fs.access(todoDir);
      } catch {
        await fs.mkdir(todoDir, { recursive: true });
      }
      
      // Format todos as markdown
      const markdownContent = this.params.todos.length > 0 
        ? `# Todo List\n\n${this.params.todos.map(formatTodoForMarkdown).join('\n')}\n`
        : '# Todo List\n\nNo todos currently tracked.\n';
      
      // Write to file
      await fs.writeFile(todoFilePath, markdownContent, 'utf-8');
      
      // Create user-friendly display
      const displayContent = formatTodosForDisplay(this.params.todos);
      
      const summary = `Updated todo list with ${this.params.todos.length} items`;
      
      return {
        summary,
        llmContent: `Todo list updated successfully. Current todos:\n${this.params.todos.map(t => `- ${t.status}: ${t.content}`).join('\n')}`,
        returnDisplay: displayContent,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        summary: 'Failed to update todo list',
        llmContent: `Error updating todo list: ${errorMessage}`,
        returnDisplay: `**Error:** Failed to update todo list - ${errorMessage}`,
        error: {
          message: errorMessage,
          type: ToolErrorType.UNHANDLED_EXCEPTION,
        },
      };
    }
  }
}

export class TodoWriteTool extends BaseDeclarativeTool<TodoWriteParams, ToolResult> {
  static readonly Name: string = 'todo_write';

  constructor() {
    super(
      TodoWriteTool.Name,
      'TodoWrite',
      `Manages a todo list for tracking task progress. Creates and updates todos with three states: pending (unchecked), in_progress (⏳), and completed (✓). 

Use this tool to:
- Create a todo list for complex multi-step tasks (3+ steps)
- Update task status in real-time as you work
- Show current progress to the user
- Maintain task tracking across conversation sessions

The tool displays the current todo list to the user each time it's used, providing transparency into task management and progress.`,
      Icon.LightBulb,
      {
        type: Type.OBJECT,
        properties: {
          todos: {
            type: Type.ARRAY,
            description: 'Array of todo items to track',
            items: {
              type: Type.OBJECT,
              properties: {
                content: {
                  type: Type.STRING,
                  description: 'The todo item description',
                },
                status: {
                  type: Type.STRING,
                  description: 'Status of the todo item',
                  enum: ['pending', 'in_progress', 'completed'],
                },
                id: {
                  type: Type.STRING,
                  description: 'Unique identifier for the todo item',
                },
              },
              required: ['content', 'status', 'id'],
            },
          },
        },
        required: ['todos'],
      },
      true, // isOutputMarkdown
      false, // canUpdateOutput
    );
  }

  protected validateToolParams(params: TodoWriteParams): string | null {
    if (!Array.isArray(params.todos)) {
      return 'todos must be an array';
    }

    for (const [index, todo] of params.todos.entries()) {
      if (!todo.content || typeof todo.content !== 'string') {
        return `todo at index ${index} must have a content string`;
      }
      if (!todo.id || typeof todo.id !== 'string') {
        return `todo at index ${index} must have an id string`;
      }
      if (!['pending', 'in_progress', 'completed'].includes(todo.status)) {
        return `todo at index ${index} must have status 'pending', 'in_progress', or 'completed'`;
      }
    }

    return null;
  }

  protected createInvocation(params: TodoWriteParams): TodoWriteInvocation {
    return new TodoWriteInvocation(params);
  }
}