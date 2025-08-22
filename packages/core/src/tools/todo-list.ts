/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  ToolInvocation,
  ToolResult,
} from './tools.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { Config } from '../config/config.js';
import { makeRelative, shortenPath } from '../utils/paths.js';
import { ToolErrorType } from './tool-error.js';
import { isNodeError } from '../utils/errors.js';

/**
 * Parameters for the TodoListTool
 */
export interface TodoListToolParams {
  /**
   * The absolute path to the todo list file.
   */
  file_path: string;
}

class TodoListToolInvocation extends BaseToolInvocation<
  TodoListToolParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: TodoListToolParams,
  ) {
    super(params);
  }

  override getDescription(): string {
    const relativePath = makeRelative(
      this.params.file_path,
      this.config.getTargetDir(),
    );
    return `Listing todo items from ${shortenPath(relativePath)}`;
  }

  async execute(): Promise<ToolResult> {
    const { file_path } = this.params;

    try {
      const content = fs.readFileSync(file_path, 'utf8');
      const todoItems = content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('- [ ]') || line.startsWith('- [x]'));

      if (todoItems.length === 0) {
        return {
          llmContent: `No todo items found in ${file_path}`,
          returnDisplay: `No todo items found in ${shortenPath(makeRelative(file_path, this.config.getTargetDir()))}`,
        };
      }

      const llmContent = `Todo items from ${file_path}:\n${todoItems.join('\n')}`;
      const returnDisplay = `Todo items from ${shortenPath(makeRelative(file_path, this.config.getTargetDir()))}:\n${todoItems.join('\n')}`;

      return {
        llmContent,
        returnDisplay,
      };
    } catch (error) {
      let errorMsg: string;
      let errorType = ToolErrorType.READ_CONTENT_FAILURE;

      if (isNodeError(error)) {
        errorMsg = `Error reading todo list file '${file_path}': ${error.message} (${error.code})`;
        if (error.code === 'ENOENT') {
          errorMsg = `Todo list file not found: ${file_path}`;
          errorType = ToolErrorType.FILE_NOT_FOUND;
        } else if (error.code === 'EACCES') {
          errorMsg = `Permission denied reading todo list file: ${file_path}`;
          errorType = ToolErrorType.PERMISSION_DENIED;
        }
      } else if (error instanceof Error) {
        errorMsg = `Error reading todo list file: ${error.message}`;
      } else {
        errorMsg = `Error reading todo list file: ${String(error)}`;
      }

      return {
        llmContent: errorMsg,
        returnDisplay: errorMsg,
        error: {
          message: errorMsg,
          type: errorType,
        },
      };
    }
  }
}

/**
 * Implementation of the TodoListTool logic
 */
export class TodoListTool extends BaseDeclarativeTool<
  TodoListToolParams,
  ToolResult
> {
  static readonly Name: string = 'todo_list';

  constructor(private readonly config: Config) {
    super(
      TodoListTool.Name,
      'TodoList',
      `Lists todo items from a specified file. Todo items are lines starting with '- [ ]' or '- [x]'.`,
      Kind.Read,
      {
        properties: {
          file_path: {
            description:
              "The absolute path to the todo list file (e.g., '/home/user/project/todo.md').",
            type: 'string',
          },
        },
        required: ['file_path'],
        type: 'object',
      },
    );
  }

  protected override validateToolParams(
    params: TodoListToolParams,
  ): string | null {
    const errors = SchemaValidator.validate(
      this.schema.parametersJsonSchema,
      params,
    );
    if (errors) {
      return errors;
    }

    if (!path.isAbsolute(params.file_path)) {
      return `File path must be absolute: ${params.file_path}`;
    }

    const workspaceContext = this.config.getWorkspaceContext();
    if (!workspaceContext.isPathWithinWorkspace(params.file_path)) {
      const directories = workspaceContext.getDirectories();
      return `File path must be within one of the workspace directories: ${directories.join(
        ', ',
      )}`;
    }

    return null;
  }

  protected createInvocation(
    params: TodoListToolParams,
  ): ToolInvocation<TodoListToolParams, ToolResult> {
    return new TodoListToolInvocation(this.config, params);
  }
}
