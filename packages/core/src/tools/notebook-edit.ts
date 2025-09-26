/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { promises as fs } from 'node:fs';
import { randomBytes } from 'node:crypto';
import * as path from 'node:path';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolInvocation,
  type ToolLocation,
  type ToolResult,
} from './tools.js';
import { isNodeError, getErrorMessage } from '../utils/errors.js';
import { ToolErrorType } from './tool-error.js';
import { Config } from '../config/config.js';
import { FileOperation } from '../telemetry/metrics.js';
import { logFileOperation } from '../telemetry/loggers.js';
import { FileOperationEvent } from '../telemetry/types.js';

interface NotebookCell {
  id?: string;
  cell_type: 'code' | 'markdown' | 'raw';
  source: string[];
  metadata: Record<string, unknown>;
  outputs?: unknown[];
  execution_count?: number | null;
}

interface NotebookDocument {
  cells: NotebookCell[];
  metadata: Record<string, unknown>;
  nbformat: number;
  nbformat_minor: number;
}

/**
 * Parameters for the NotebookEdit tool
 */
export interface NotebookEditToolParams {
  /** Absolute path to the notebook file */
  absolute_path: string;
  /** Operation to perform on the notebook */
  operation:
    | 'add_cell'
    | 'edit_cell'
    | 'delete_cell'
    | 'move_cell'
    | 'clear_outputs';
  /** Index of the cell to operate on (0-based) */
  cell_index?: number;
  /** ID of the cell to operate on (alternative to cell_index) */
  cell_id?: string;
  /** Content for the new or edited cell */
  cell_content?: string;
  /** Type of cell to create */
  cell_type?: 'code' | 'markdown' | 'raw';
  /** Position to insert new cell (0-based, defaults to end) */
  position?: number;
  /** Source index for move operation */
  source_index?: number;
  /** Destination index for move operation */
  destination_index?: number;
}

class NotebookEditToolInvocation extends BaseToolInvocation<
  NotebookEditToolParams,
  ToolResult
> {
  constructor(
    private config: Config,
    params: NotebookEditToolParams,
  ) {
    super(params);
  }

  getDescription(): string {
    const filename = path.basename(this.params.absolute_path);
    return `${this.params.operation} on notebook ${filename}`;
  }

  override toolLocations(): ToolLocation[] {
    return [{ path: this.params.absolute_path }];
  }

  async execute(): Promise<ToolResult> {
    try {
      // Validate file path
      if (!path.isAbsolute(this.params.absolute_path)) {
        const errorMsg = `Error: absolute_path must be an absolute path, got: ${this.params.absolute_path}`;
        return {
          llmContent: errorMsg,
          returnDisplay: errorMsg,
          error: {
            message: 'Invalid file path: must be absolute',
            type: ToolErrorType.INVALID_TOOL_PARAMS,
          },
        };
      }

      // Read and parse notebook
      let notebookContent: string;
      try {
        notebookContent = await fs.readFile(this.params.absolute_path, 'utf-8');
      } catch (error) {
        if (isNodeError(error) && error.code === 'ENOENT') {
          const errorMsg = `Error: Notebook file does not exist: ${this.params.absolute_path}`;
          return {
            llmContent: errorMsg,
            returnDisplay: errorMsg,
            error: {
              message: 'File not found',
              type: ToolErrorType.FILE_NOT_FOUND,
            },
          };
        }
        // Re-throw other read errors to be caught by the outer catch block
        throw error;
      }

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
        const errorMsg = `Error: Invalid notebook structure in ${this.params.absolute_path}`;
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

      // Write the modified notebook back with proper formatting
      const updatedNotebookContent = JSON.stringify(notebook, null, 2) + '\n';
      await fs.writeFile(
        this.params.absolute_path,
        updatedNotebookContent,
        'utf-8',
      );

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
          'jupyter',
        ),
      );

      const fileName = path.basename(this.params.absolute_path);
      const successMsg = `Successfully performed ${this.params.operation} on notebook ${fileName}. The notebook now has ${notebook.cells.length} cells.`;
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
          type:
            isNodeError(error) && error.code === 'EACCES'
              ? ToolErrorType.PERMISSION_DENIED
              : ToolErrorType.EXECUTION_FAILED,
        },
      };
    }
  }

  private isValidNotebook(notebook: any): notebook is NotebookDocument {
    return (
      notebook &&
      typeof notebook === 'object' &&
      Array.isArray(notebook.cells) &&
      typeof notebook.nbformat === 'number' &&
      typeof notebook.nbformat_minor === 'number' &&
      typeof notebook.metadata === 'object'
    );
  }

  private performOperation(
    notebook: NotebookDocument,
    params: NotebookEditToolParams,
  ): ToolResult {
    const {
      operation,
      cell_index,
      cell_id,
      cell_content,
      cell_type,
      position,
      source_index,
      destination_index,
    } = params;

    switch (operation) {
      case 'add_cell':
        return this.addCell(
          notebook,
          cell_content,
          cell_type as 'code' | 'markdown' | 'raw',
          position,
        );

      case 'edit_cell':
        return this.editCell(notebook, cell_index, cell_id, cell_content);

      case 'delete_cell':
        return this.deleteCell(notebook, cell_index, cell_id);

      case 'move_cell':
        return this.moveCell(notebook, source_index, destination_index);

      case 'clear_outputs':
        return this.clearOutputs(notebook);

      default:
        return {
          llmContent: `Unsupported notebook operation: ${operation}`,
          returnDisplay: `Unsupported notebook operation: ${operation}`,
          error: {
            message: `Unsupported notebook operation: ${operation}`,
            type: ToolErrorType.INVALID_OPERATION,
          },
        };
    }
  }

  private addCell(
    notebook: NotebookDocument,
    content?: string,
    cellType: 'code' | 'markdown' | 'raw' = 'code',
    position?: number,
  ): ToolResult {
    const newCell: NotebookCell = {
      id: this.generateCellId(),
      cell_type: cellType,
      source: content ? content.split('\n').map((line) => line + '\n') : [''],
      metadata: {},
    };

    if (cellType === 'code') {
      newCell.outputs = [];
      newCell.execution_count = null;
    }

    const insertPosition =
      position !== undefined ? position : notebook.cells.length;

    if (insertPosition < 0 || insertPosition > notebook.cells.length) {
      return {
        llmContent: `Invalid position ${insertPosition}. Must be between 0 and ${notebook.cells.length}`,
        returnDisplay: `Invalid position ${insertPosition}. Must be between 0 and ${notebook.cells.length}`,
        error: {
          message: `Invalid position ${insertPosition}. Must be between 0 and ${notebook.cells.length}`,
          type: ToolErrorType.INVALID_OPERATION,
        },
      };
    }

    notebook.cells.splice(insertPosition, 0, newCell);
    return {
      llmContent: 'Cell added successfully',
      returnDisplay: 'Cell added successfully',
    };
  }

  private editCell(
    notebook: NotebookDocument,
    cellIndex?: number,
    cellId?: string,
    content?: string,
  ): ToolResult {
    let targetIndex = -1;

    if (cellId) {
      targetIndex = notebook.cells.findIndex((cell) => cell.id === cellId);
      if (targetIndex === -1) {
        return {
          llmContent: `Cell with ID '${cellId}' not found`,
          returnDisplay: `Cell with ID '${cellId}' not found`,
          error: {
            message: `Cell with ID '${cellId}' not found`,
            type: ToolErrorType.INVALID_OPERATION,
          },
        };
      }
    } else if (cellIndex !== undefined) {
      if (cellIndex < 0 || cellIndex >= notebook.cells.length) {
        return {
          llmContent: `Invalid cell index ${cellIndex}. Must be between 0 and ${notebook.cells.length - 1}`,
          returnDisplay: `Invalid cell index ${cellIndex}. Must be between 0 and ${notebook.cells.length - 1}`,
          error: {
            message: `Invalid cell index ${cellIndex}. Must be between 0 and ${notebook.cells.length - 1}`,
            type: ToolErrorType.INVALID_OPERATION,
          },
        };
      }
      targetIndex = cellIndex;
    } else {
      return {
        llmContent:
          'Either cell_index or cell_id must be provided for edit operation',
        returnDisplay:
          'Either cell_index or cell_id must be provided for edit operation',
        error: {
          message:
            'Either cell_index or cell_id must be provided for edit operation',
          type: ToolErrorType.INVALID_TOOL_PARAMS,
        },
      };
    }

    if (content !== undefined) {
      notebook.cells[targetIndex].source = content
        .split('\n')
        .map((line) => line + '\n');
    }

    return {
      llmContent: 'Cell edited successfully',
      returnDisplay: 'Cell edited successfully',
    };
  }

  private deleteCell(
    notebook: NotebookDocument,
    cellIndex?: number,
    cellId?: string,
  ): ToolResult {
    if (notebook.cells.length === 1) {
      return {
        llmContent: 'Cannot delete the last cell in the notebook',
        returnDisplay: 'Cannot delete the last cell in the notebook',
        error: {
          message: 'Cannot delete the last cell in the notebook',
          type: ToolErrorType.INVALID_OPERATION,
        },
      };
    }

    let targetIndex = -1;

    if (cellId) {
      targetIndex = notebook.cells.findIndex((cell) => cell.id === cellId);
      if (targetIndex === -1) {
        return {
          llmContent: `Cell with ID '${cellId}' not found`,
          returnDisplay: `Cell with ID '${cellId}' not found`,
          error: {
            message: `Cell with ID '${cellId}' not found`,
            type: ToolErrorType.INVALID_OPERATION,
          },
        };
      }
    } else if (cellIndex !== undefined) {
      if (cellIndex < 0 || cellIndex >= notebook.cells.length) {
        return {
          llmContent: `Invalid cell index ${cellIndex}. Must be between 0 and ${notebook.cells.length - 1}`,
          returnDisplay: `Invalid cell index ${cellIndex}. Must be between 0 and ${notebook.cells.length - 1}`,
          error: {
            message: `Invalid cell index ${cellIndex}. Must be between 0 and ${notebook.cells.length - 1}`,
            type: ToolErrorType.INVALID_OPERATION,
          },
        };
      }
      targetIndex = cellIndex;
    } else {
      return {
        llmContent:
          'Either cell_index or cell_id must be provided for delete operation',
        returnDisplay:
          'Either cell_index or cell_id must be provided for delete operation',
        error: {
          message:
            'Either cell_index or cell_id must be provided for delete operation',
          type: ToolErrorType.INVALID_TOOL_PARAMS,
        },
      };
    }

    notebook.cells.splice(targetIndex, 1);
    return {
      llmContent: 'Cell deleted successfully',
      returnDisplay: 'Cell deleted successfully',
    };
  }

  private moveCell(
    notebook: NotebookDocument,
    sourceIndex?: number,
    destinationIndex?: number,
  ): ToolResult {
    if (sourceIndex === undefined || destinationIndex === undefined) {
      return {
        llmContent:
          'Both source_index and destination_index must be provided for move operation',
        returnDisplay:
          'Both source_index and destination_index must be provided for move operation',
        error: {
          message:
            'Both source_index and destination_index must be provided for move operation',
          type: ToolErrorType.INVALID_TOOL_PARAMS,
        },
      };
    }

    if (sourceIndex < 0 || sourceIndex >= notebook.cells.length) {
      return {
        llmContent: `Invalid source index ${sourceIndex}. Must be between 0 and ${notebook.cells.length - 1}`,
        returnDisplay: `Invalid source index ${sourceIndex}. Must be between 0 and ${notebook.cells.length - 1}`,
        error: {
          message: `Invalid source index ${sourceIndex}. Must be between 0 and ${notebook.cells.length - 1}`,
          type: ToolErrorType.INVALID_OPERATION,
        },
      };
    }

    if (destinationIndex < 0 || destinationIndex > notebook.cells.length) {
      return {
        llmContent: `Invalid destination index ${destinationIndex}. Must be between 0 and ${notebook.cells.length}`,
        returnDisplay: `Invalid destination index ${destinationIndex}. Must be between 0 and ${notebook.cells.length}`,
        error: {
          message: `Invalid destination index ${destinationIndex}. Must be between 0 and ${notebook.cells.length}`,
          type: ToolErrorType.INVALID_OPERATION,
        },
      };
    }

    if (sourceIndex === destinationIndex) {
      return {
        llmContent: 'No movement needed - source and destination are the same',
        returnDisplay:
          'No movement needed - source and destination are the same',
      };
    }

    const [cell] = notebook.cells.splice(sourceIndex, 1);
    // Adjust destination index if necessary
    const adjustedDestination =
      destinationIndex > sourceIndex ? destinationIndex - 1 : destinationIndex;
    notebook.cells.splice(adjustedDestination, 0, cell);

    return {
      llmContent: 'Cell moved successfully',
      returnDisplay: 'Cell moved successfully',
    };
  }

  private clearOutputs(notebook: NotebookDocument): ToolResult {
    let clearedCount = 0;

    notebook.cells.forEach((cell) => {
      if (
        cell.cell_type === 'code' &&
        cell.outputs &&
        cell.outputs.length > 0
      ) {
        cell.outputs = [];
        cell.execution_count = null;
        clearedCount++;
      }
    });

    return {
      llmContent: `Cleared outputs from ${clearedCount} code cells`,
      returnDisplay: `Cleared outputs from ${clearedCount} code cells`,
    };
  }

  private generateCellId(): string {
    // Generate a cryptographically secure unique ID (similar to Jupyter's format)
    return randomBytes(4).toString('hex');
  }
}

export class NotebookEditTool extends BaseDeclarativeTool<
  NotebookEditToolParams,
  ToolResult
> {
  static readonly Name = 'notebook_edit';

  constructor(private config: Config) {
    super(
      NotebookEditTool.Name,
      'Notebook Edit',
      'Edit Jupyter notebook files by adding, editing, deleting, moving cells, or clearing outputs. Use this tool for all Jupyter notebook (.ipynb) file modifications to ensure proper JSON structure and data integrity.',
      Kind.Edit,
      {
        type: 'object' as const,
        properties: {
          absolute_path: {
            type: 'string' as const,
            description: 'Absolute path to the notebook file',
          },
          operation: {
            type: 'string' as const,
            enum: [
              'add_cell',
              'edit_cell',
              'delete_cell',
              'move_cell',
              'clear_outputs',
            ],
            description: 'Operation to perform on the notebook',
          },
          cell_index: {
            type: 'number' as const,
            description: 'Index of the cell to operate on (0-based)',
          },
          cell_id: {
            type: 'string' as const,
            description:
              'ID of the cell to operate on (alternative to cell_index)',
          },
          cell_content: {
            type: 'string' as const,
            description: 'Content for the new or edited cell',
          },
          cell_type: {
            type: 'string' as const,
            enum: ['code', 'markdown', 'raw'],
            description: 'Type of cell to create (default: code)',
          },
          position: {
            type: 'number' as const,
            description:
              'Position to insert new cell (0-based, defaults to end)',
          },
          source_index: {
            type: 'number' as const,
            description: 'Source index for move operation',
          },
          destination_index: {
            type: 'number' as const,
            description: 'Destination index for move operation',
          },
        },
        required: ['absolute_path', 'operation'],
      },
    );
  }

  protected createInvocation(
    params: NotebookEditToolParams,
  ): ToolInvocation<NotebookEditToolParams, ToolResult> {
    return new NotebookEditToolInvocation(this.config, params);
  }
}
