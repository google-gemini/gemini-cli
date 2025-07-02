/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'fs';
import path from 'path';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { makeRelative, shortenPath } from '../utils/paths.js';
import { BaseTool, ToolResult } from './tools.js';
import { isWithinRoot } from '../utils/fileUtils.js';
import { Config } from '../config/config.js';
import {
  recordFileOperationMetric,
  FileOperation,
} from '../telemetry/metrics.js';

/**
 * Parameters for the DeleteLines tool
 */
export interface DeleteLinesToolParams {
  /**
   * The absolute path to the file to modify
   */
  file_path: string;

  /**
   * The 0-based line number to start deleting from (inclusive).
   */
  start_line: number;

  /**
   * The 0-based line number to end deleting at (inclusive).
   */
  end_line: number;
}

/**
 * Implementation of the DeleteLines tool logic
 */
export class DeleteLinesTool extends BaseTool<
  DeleteLinesToolParams,
  ToolResult
> {
  static readonly Name: string = 'delete_lines';

  constructor(
    private rootDirectory: string,
    private config: Config,
  ) {
    super(
      DeleteLinesTool.Name,
      'DeleteLines',
      'Deletes a range of lines from a file.',
      {
        properties: {
          file_path: {
            description:
              "The absolute path to the file to modify. Must start with '/'.",
            type: 'string',
          },
          start_line: {
            description:
              'The 0-based line number to start deleting from (inclusive).',
            type: 'number',
          },
          end_line: {
            description:
              'The 0-based line number to end deleting at (inclusive).',
            type: 'number',
          },
        },
        required: ['file_path', 'start_line', 'end_line'],
        type: 'object',
      },
    );
    this.rootDirectory = path.resolve(rootDirectory);
  }

  override validateToolParams(params: DeleteLinesToolParams): string | null {
    if (
      this.schema.parameters &&
      !SchemaValidator.validate(
        this.schema.parameters as Record<string, unknown>,
        params,
      )
    ) {
      return 'Parameters failed schema validation.';
    }

    if (!path.isAbsolute(params.file_path)) {
      return `File path must be absolute: ${params.file_path}`;
    }

    if (!isWithinRoot(params.file_path, this.rootDirectory)) {
      return `File path must be within the root directory (${this.rootDirectory}): ${params.file_path}`;
    }

    if (params.start_line < 0) {
      return 'Start line must be a non-negative number';
    }
    if (params.end_line < 0) {
      return 'End line must be a non-negative number';
    }
    if (params.start_line > params.end_line) {
      return 'Start line cannot be greater than end line';
    }

    return null;
  }

  override getDescription(params: DeleteLinesToolParams): string {
    if (
      !params.file_path ||
      params.start_line === undefined ||
      params.end_line === undefined
    ) {
      return `Model did not provide valid parameters for delete_lines tool`;
    }
    const relativePath = makeRelative(params.file_path, this.rootDirectory);
    return `Delete lines ${params.start_line} to ${params.end_line} from ${shortenPath(relativePath)}`;
  }

  async execute(
    params: DeleteLinesToolParams,
    _signal: AbortSignal,
  ): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `Error: Invalid parameters provided. Reason: ${validationError}`,
        returnDisplay: `Error: ${validationError}`,
      };
    }

    try {
      const fileContent = await fs.readFile(params.file_path, 'utf8');
      const lines = fileContent.split('\n');

      if (
        params.start_line >= lines.length ||
        params.end_line >= lines.length
      ) {
        return {
          llmContent: `Error: Line range [${params.start_line}, ${params.end_line}] is out of bounds for file ${params.file_path}. File has ${lines.length} lines.`,
          returnDisplay: `Error: Line range out of bounds.`,
        };
      }

      lines.splice(params.start_line, params.end_line - params.start_line + 1);
      await fs.writeFile(params.file_path, lines.join('\n'));

      recordFileOperationMetric(
        this.config,
        FileOperation.UPDATE,
        lines.length,
        'text/plain',
        path.extname(params.file_path),
      );

      return {
        llmContent: `Successfully deleted lines ${params.start_line} to ${params.end_line} from ${params.file_path}.`,
        returnDisplay: `Deleted lines ${params.start_line} to ${params.end_line} from ${shortenPath(makeRelative(params.file_path, this.rootDirectory))}`,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error deleting lines from file ${params.file_path}: ${errorMsg}`,
        returnDisplay: `Error deleting lines: ${errorMsg}`,
      };
    }
  }
}
