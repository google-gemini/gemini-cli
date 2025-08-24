/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  BaseDeclarativeTool,
  Kind,
  ToolInvocation,
  ToolResult,
  BaseToolInvocation,
} from './tools.js';
import { ToolErrorType } from './tool-error.js';
import { Config } from '../config/config.js';
import { getErrorMessage, isNodeError } from '../utils/errors.js';
import { logFileOperation } from '../telemetry/loggers.js';
import { FileOperation } from '../telemetry/metrics.js';
import { FileOperationEvent } from '../telemetry/types.js';

/**
 * Represents a Jupyter notebook cell
 */
interface NotebookCell {
  id?: string;
  cell_type: 'code' | 'markdown' | 'raw';
  source: string | string[];
  metadata?: Record<string, unknown>;
  execution_count?: number | null;
  outputs?: unknown[];
}

/**
 * Represents a Jupyter notebook structure
 */
interface NotebookDocument {
  cells: NotebookCell[];
  metadata: Record<string, unknown>;
  nbformat: number;
  nbformat_minor: number;
}

/**
 * Parameters for notebook operations
 */
export interface NotebookEditToolParams {
  /**
   * The absolute path to the notebook file
   */
  file_path: string;

  /**
   * The operation to perform: 'add_cell', 'edit_cell', 'delete_cell', 'move_cell', 'clear_outputs'
   */
  operation: 'add_cell' | 'edit_cell' | 'delete_cell' | 'move_cell' | 'clear_outputs';

  /**
   * Cell index (0-based) for operations on existing cells
   */
  cell_index?: number;

  /**
   * New cell content (for add_cell and edit_cell operations)
   */
  cell_content?: string | string[];

  /**
   * Cell type (for add_cell operation)
   */
  cell_type?: 'code' | 'markdown' | 'raw';

  /**
   * Target index for move_cell operation
   */
  target_index?: number;

  /**
   * Insert position for add_cell: 'before', 'after', or 'end' (default)
   */
  insert_position?: 'before' | 'after' | 'end';
}

class NotebookEditToolInvocation extends BaseToolInvocation<
  NotebookEditToolParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: NotebookEditToolParams,
  ) {
    super(params);
  }

  getDescription(): string {
    const { operation, file_path, cell_index } = this.params;
    const fileName = path.basename(file_path);
    
    switch (operation) {
      case 'add_cell':
        return `Adding ${this.params.cell_type || 'code'} cell to notebook ${fileName}`;
      case 'edit_cell':
        return `Editing cell ${cell_index} in notebook ${fileName}`;
      case 'delete_cell':
        return `Deleting cell ${cell_index} from notebook ${fileName}`;
      case 'move_cell':
        return `Moving cell ${cell_index} to position ${this.params.target_index} in notebook ${fileName}`;
      case 'clear_outputs':
        return `Clearing outputs from notebook ${fileName}`;
      default:
        return `Performing ${operation} on notebook ${fileName}`;
    }
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const { file_path, operation } = this.params;

    try {
      // Validate file path
      if (!path.isAbsolute(file_path)) {
        const errorMsg = `Error: file_path must be an absolute path, got: ${file_path}`;
        return {
          llmContent: errorMsg,
          returnDisplay: errorMsg,
          error: {
            message: 'Invalid file path: must be absolute',
            type: ToolErrorType.INVALID_TOOL_PARAMS,
          },
        };
      }

      // Check if file exists
      if (!fs.existsSync(file_path)) {
        const errorMsg = `Error: Notebook file does not exist: ${file_path}`;
        return {
          llmContent: errorMsg,
          returnDisplay: errorMsg,
          error: {
            message: 'File not found',
            type: ToolErrorType.FILE_NOT_FOUND,
          },
        };
      }

      // Read and parse notebook
      const notebookContent = fs.readFileSync(file_path, 'utf-8');
      let notebook: NotebookDocument;
      
      try {
        notebook = JSON.parse(notebookContent);
      } catch (parseError) {
        const errorMsg = `Error: Invalid JSON in notebook file: ${getErrorMessage(parseError)}`;
        return {
          llmContent: errorMsg,
          returnDisplay: errorMsg,
          error: {
            message: 'Invalid notebook JSON',
            type: ToolErrorType.INVALID_FILE_FORMAT,
          },
        };
      }

      // Validate notebook structure
      if (!this.isValidNotebook(notebook)) {
        const errorMsg = `Error: Invalid notebook structure in ${file_path}`;
        return {
          llmContent: errorMsg,
          returnDisplay: errorMsg,
          error: {
            message: 'Invalid notebook structure',
            type: ToolErrorType.INVALID_FILE_FORMAT,
          },
        };
      }

      // Perform the requested operation
      const result = this.performOperation(notebook, this.params);
      if (result.error) {
        return result;
      }

      // Write the modified notebook back
      const updatedNotebookContent = JSON.stringify(notebook, null, 2) + '\n';
      fs.writeFileSync(file_path, updatedNotebookContent, 'utf-8');

      // Log the operation
      const lines = updatedNotebookContent.split('\n').length;
      logFileOperation(
        this.config,
        new FileOperationEvent(
          NotebookEditTool.Name,
          FileOperation.UPDATE,
          lines,
          'application/json',
          '.ipynb',
          undefined,
          'jupyter',
        ),
      );

      const fileName = path.basename(file_path);
      const successMsg = `Successfully performed ${operation} on notebook ${fileName}. The notebook now has ${notebook.cells.length} cells.`;
      return {
        llmContent: successMsg,
        returnDisplay: successMsg,
      };

    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const errorMsg = `Error performing notebook operation: ${errorMessage}`;
      return {
        llmContent: errorMsg,
        returnDisplay: errorMsg,
        error: {
          message: errorMessage,
          type: isNodeError(error) && error.code === 'EACCES' 
            ? ToolErrorType.PERMISSION_DENIED 
            : ToolErrorType.EXECUTION_FAILED,
        },
      };
    }
  }

  private isValidNotebook(obj: unknown): obj is NotebookDocument {
    if (!obj || typeof obj !== 'object') return false;
    const notebook = obj as Record<string, unknown>;
    
    return (
      Array.isArray(notebook['cells']) &&
      typeof notebook['metadata'] === 'object' &&
      typeof notebook['nbformat'] === 'number' &&
      typeof notebook['nbformat_minor'] === 'number'
    );
  }

  private performOperation(notebook: NotebookDocument, params: NotebookEditToolParams): ToolResult | { error?: undefined } {
    const { operation, cell_index, cell_content, cell_type, target_index, insert_position } = params;

    switch (operation) {
      case 'add_cell': {
        const newCell: NotebookCell = {
          id: this.generateCellId(),
          cell_type: cell_type || 'code',
          source: this.normalizeSource(cell_content || ''),
          metadata: {},
          ...(cell_type !== 'markdown' && cell_type !== 'raw' && { 
            execution_count: null, 
            outputs: [] 
          }),
        };

        let insertIndex = notebook.cells.length; // Default to end
        
        if (cell_index !== undefined && insert_position) {
          if (cell_index < 0 || cell_index >= notebook.cells.length) {
            const errorMsg = `Error: Invalid cell_index ${cell_index}. Must be between 0 and ${notebook.cells.length - 1}`;
            return {
              llmContent: errorMsg,
              returnDisplay: errorMsg,
              error: { message: 'Invalid cell index', type: ToolErrorType.INVALID_TOOL_PARAMS },
            };
          }
          
          if (insert_position === 'before') {
            insertIndex = cell_index;
          } else if (insert_position === 'after') {
            insertIndex = cell_index + 1;
          }
        }

        notebook.cells.splice(insertIndex, 0, newCell);
        break;
      }

      case 'edit_cell': {
        if (cell_index === undefined || cell_content === undefined) {
          const errorMsg = 'Error: cell_index and cell_content are required for edit_cell operation';
          return {
            llmContent: errorMsg,
            returnDisplay: errorMsg,
            error: { message: 'Missing required parameters', type: ToolErrorType.INVALID_TOOL_PARAMS },
          };
        }

        if (cell_index < 0 || cell_index >= notebook.cells.length) {
          const errorMsg = `Error: Invalid cell_index ${cell_index}. Must be between 0 and ${notebook.cells.length - 1}`;
          return {
            llmContent: errorMsg,
            returnDisplay: errorMsg,
            error: { message: 'Invalid cell index', type: ToolErrorType.INVALID_TOOL_PARAMS },
          };
        }

        notebook.cells[cell_index].source = this.normalizeSource(cell_content);
        break;
      }

      case 'delete_cell': {
        if (cell_index === undefined) {
          const errorMsg = 'Error: cell_index is required for delete_cell operation';
          return {
            llmContent: errorMsg,
            returnDisplay: errorMsg,
            error: { message: 'Missing cell_index parameter', type: ToolErrorType.INVALID_TOOL_PARAMS },
          };
        }

        if (cell_index < 0 || cell_index >= notebook.cells.length) {
          const errorMsg = `Error: Invalid cell_index ${cell_index}. Must be between 0 and ${notebook.cells.length - 1}`;
          return {
            llmContent: errorMsg,
            returnDisplay: errorMsg,
            error: { message: 'Invalid cell index', type: ToolErrorType.INVALID_TOOL_PARAMS },
          };
        }

        if (notebook.cells.length === 1) {
          const errorMsg = 'Error: Cannot delete the last remaining cell in the notebook';
          return {
            llmContent: errorMsg,
            returnDisplay: errorMsg,
            error: { message: 'Cannot delete last cell', type: ToolErrorType.INVALID_OPERATION },
          };
        }

        notebook.cells.splice(cell_index, 1);
        break;
      }

      case 'move_cell': {
        if (cell_index === undefined || target_index === undefined) {
          const errorMsg = 'Error: cell_index and target_index are required for move_cell operation';
          return {
            llmContent: errorMsg,
            returnDisplay: errorMsg,
            error: { message: 'Missing required parameters', type: ToolErrorType.INVALID_TOOL_PARAMS },
          };
        }

        if (cell_index < 0 || cell_index >= notebook.cells.length || 
            target_index < 0 || target_index >= notebook.cells.length) {
          const errorMsg = `Error: Invalid indices. cell_index: ${cell_index}, target_index: ${target_index}. Must be between 0 and ${notebook.cells.length - 1}`;
          return {
            llmContent: errorMsg,
            returnDisplay: errorMsg,
            error: { message: 'Invalid indices', type: ToolErrorType.INVALID_TOOL_PARAMS },
          };
        }

        const [movedCell] = notebook.cells.splice(cell_index, 1);
        notebook.cells.splice(target_index, 0, movedCell);
        break;
      }

      case 'clear_outputs': {
        notebook.cells.forEach(cell => {
          if (cell.cell_type === 'code') {
            cell.execution_count = null;
            cell.outputs = [];
          }
        });
        break;
      }

      default: {
        const errorMsg = `Error: Unknown operation: ${operation}`;
        return {
          llmContent: errorMsg,
          returnDisplay: errorMsg,
          error: { message: 'Unknown operation', type: ToolErrorType.INVALID_TOOL_PARAMS },
        };
      }
    }

    return {};
  }

  private normalizeSource(content: string | string[]): string[] {
    if (Array.isArray(content)) {
      return content;
    }
    
    // Split content into lines, preserving line endings
    const lines = content.split('\n');
    return lines.map((line, index) => {
      // Add \n to all lines except the last one (if it's empty)
      if (index === lines.length - 1 && line === '') {
        return line;
      }
      return line + '\n';
    }).filter((line, index, arr) => !(index === arr.length - 1 && line === ''));
  }

  private generateCellId(): string {
    // Generate a simple unique ID (similar to Jupyter's format)
    return Math.random().toString(36).substr(2, 8);
  }
}

export class NotebookEditTool extends BaseDeclarativeTool<
  NotebookEditToolParams,
  ToolResult
> {
  static readonly Name = 'notebook_edit';

  constructor(private readonly config: Config) {
    super(
      NotebookEditTool.Name,
      'Edit Jupyter Notebook',
      'Edit Jupyter notebook files by adding, editing, deleting, or moving cells, or clearing outputs',
      Kind.Edit,
      {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'The absolute path to the notebook file (.ipynb)',
          },
          operation: {
            type: 'string',
            enum: ['add_cell', 'edit_cell', 'delete_cell', 'move_cell', 'clear_outputs'],
            description: 'The operation to perform on the notebook',
          },
          cell_index: {
            type: 'integer',
            description: 'The index of the cell to operate on (0-based, required for edit_cell, delete_cell, move_cell)',
            minimum: 0,
          },
          cell_content: {
            oneOf: [
              { type: 'string' },
              { type: 'array', items: { type: 'string' } }
            ],
            description: 'The content for the cell (required for add_cell and edit_cell)',
          },
          cell_type: {
            type: 'string',
            enum: ['code', 'markdown', 'raw'],
            description: 'The type of cell to create (for add_cell operation, defaults to "code")',
          },
          target_index: {
            type: 'integer',
            description: 'The target index for move_cell operation (0-based)',
            minimum: 0,
          },
          insert_position: {
            type: 'string',
            enum: ['before', 'after', 'end'],
            description: 'Where to insert the new cell relative to cell_index (for add_cell, defaults to "end")',
          },
        },
        required: ['file_path', 'operation'],
        additionalProperties: false,
      },
      true, // isOutputMarkdown
      false, // canUpdateOutput
    );
  }

  protected createInvocation(params: NotebookEditToolParams): ToolInvocation<NotebookEditToolParams, ToolResult> {
    return new NotebookEditToolInvocation(this.config, params);
  }
}
