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
 * Parameters for the InsertLines tool
 */
export interface InsertLinesToolParams {
  /**
   * The absolute path to the file to modify
   */
  file_path: string;

  /**
   * The 0-based line number to insert content at.
   */
  line_number: number;

  /**
   * The content to insert.
   */
  content: string;
}

/**
 * Implementation of the InsertLines tool logic
 */
export class InsertLinesTool extends BaseTool<
  InsertLinesToolParams,
  ToolResult
> {
  static readonly Name: string = 'insert_lines';

  constructor(
    private rootDirectory: string,
    private config: Config,
  ) {
    super(
      InsertLinesTool.Name,
      'InsertLines',
      'Inserts content at a specific line number in a file.',
      {
        properties: {
          file_path: {
            description:
              "The absolute path to the file to modify. Must start with '/'.",
            type: 'string',
          },
          line_number: {
            description: 'The 0-based line number to insert content at.',
            type: 'number',
          },
          content: {
            description: 'The content to insert.',
            type: 'string',
          },
        },
        required: ['file_path', 'line_number', 'content'],
        type: 'object',
      },
    );
    this.rootDirectory = path.resolve(rootDirectory);
  }

  override validateToolParams(params: InsertLinesToolParams): string | null {
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

    if (params.line_number < 0) {
      return 'Line number must be a non-negative number';
    }

    return null;
  }

  override getDescription(params: InsertLinesToolParams): string {
    if (
      !params.file_path ||
      params.line_number === undefined ||
      !params.content
    ) {
      return `Model did not provide valid parameters for insert_lines tool`;
    }
    const relativePath = makeRelative(params.file_path, this.rootDirectory);
    return `Insert content into ${shortenPath(relativePath)} at line ${params.line_number}`;
  }

  async execute(
    params: InsertLinesToolParams,
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

      if (params.line_number > lines.length) {
        return {
          llmContent: `Error: Line number ${params.line_number} is out of bounds for file ${params.file_path}. File has ${lines.length} lines.`,
          returnDisplay: `Error: Line number ${params.line_number} is out of bounds.`,
        };
      }

      lines.splice(params.line_number, 0, params.content);
      await fs.writeFile(params.file_path, lines.join('\n'));

      recordFileOperationMetric(
        this.config,
        FileOperation.UPDATE,
        lines.length,
        'text/plain',
        path.extname(params.file_path),
      );

      return {
        llmContent: `Successfully inserted content into ${params.file_path} at line ${params.line_number}.`,
        returnDisplay: `Inserted content at line ${params.line_number} in ${shortenPath(makeRelative(params.file_path, this.rootDirectory))}`,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error inserting content into file ${params.file_path}: ${errorMsg}`,
        returnDisplay: `Error inserting content: ${errorMsg}`,
      };
    }
  }
}
