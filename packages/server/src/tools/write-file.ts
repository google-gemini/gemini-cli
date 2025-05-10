/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import * as Diff from 'diff';
import {
  BaseTool,
  ToolResult,
  FileDiff,
  ToolEditConfirmationDetails,
  ToolConfirmationOutcome,
  ToolCallConfirmationDetails,
} from './tools.js';
import { SchemaValidator } from '../utils/schemaValidator.js'; // Updated import
import { makeRelative, shortenPath } from '../utils/paths.js'; // Updated import
import { isNodeError } from '../utils/errors.js';
/**
 * Parameters for the WriteFile tool
 */
export interface WriteFileToolParams {
  /**
   * The absolute path to the file to write to
   */
  file_path: string;

  /**
   * The content to write to the file
   */
  content: string;
}

/**
 * Implementation of the WriteFile tool logic
 */
export class WriteFileTool extends BaseTool<WriteFileToolParams, ToolResult> {
  static readonly Name: string = 'write_file';
  private shouldAlwaysWrite = false;

  constructor(private readonly rootDirectory: string) {
    super(
      WriteFileTool.Name,
      'WriteFile',
      'Writes content to a specified file in the local filesystem.',
      {
        properties: {
          file_path: {
            description:
              "The absolute path to the file to write to (e.g., '/home/user/project/file.txt'). Relative paths are not supported.",
            type: 'string',
          },
          content: {
            description: 'The content to write to the file.',
            type: 'string',
          },
        },
        required: ['file_path', 'content'],
        type: 'object',
      },
    );
    this.rootDirectory = path.resolve(rootDirectory);
  }

  private isWithinRoot(pathToCheck: string): boolean {
    const normalizedPath = path.normalize(pathToCheck);
    const normalizedRoot = path.normalize(this.rootDirectory);
    const rootWithSep = normalizedRoot.endsWith(path.sep)
      ? normalizedRoot
      : normalizedRoot + path.sep;
    return (
      normalizedPath === normalizedRoot ||
      normalizedPath.startsWith(rootWithSep)
    );
  }

  validateParams(params: WriteFileToolParams): string | null {
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
    if (!this.isWithinRoot(params.file_path)) {
      return `File path must be within the root directory (${this.rootDirectory}): ${params.file_path}`;
    }
    return null;
  }

  getDescription(params: WriteFileToolParams): string {
    const relativePath = makeRelative(params.file_path, this.rootDirectory);
    return `Writing to ${shortenPath(relativePath)}`;
  }

  /**
   * Handles the confirmation prompt for the WriteFile tool.
   */
  async shouldConfirmExecute(
    params: WriteFileToolParams,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.shouldAlwaysWrite) {
      return false;
    }

    const validationError = this.validateToolParams(params);
    if (validationError) {
      console.error(
        `[WriteFile Wrapper] Attempted confirmation with invalid parameters: ${validationError}`,
      );
      return false;
    }

    const relativePath = makeRelative(params.file_path, this.rootDirectory);
    const fileName = path.basename(params.file_path);

    let currentContent = '';
    try {
      currentContent = fs.readFileSync(params.file_path, 'utf8');
    } catch {
      // File might not exist, that's okay for write/create
    }

    const fileDiff = Diff.createPatch(
      fileName,
      currentContent,
      params.content,
      'Current',
      'Proposed',
      { context: 3 },
    );

    const confirmationDetails: ToolEditConfirmationDetails = {
      title: `Confirm Write: ${shortenPath(relativePath)}`,
      fileName,
      fileDiff,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          this.shouldAlwaysWrite = true;
        }
      },
    };
    return confirmationDetails;
  }

  async execute(
    params: WriteFileToolParams,
    _signal: AbortSignal,
  ): Promise<ToolResult> {
    const validationError = this.validateParams(params);
    if (validationError) {
      return {
        llmContent: `Error: Invalid parameters provided. Reason: ${validationError}`,
        returnDisplay: `Error: ${validationError}`,
      };
    }

    let currentContent = '';
    let isNewFile = false;
    try {
      currentContent = fs.readFileSync(params.file_path, 'utf8');
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') {
        isNewFile = true;
      } else {
        // Rethrow other read errors (permissions etc.)
        const errorMsg = `Error checking existing file: ${err instanceof Error ? err.message : String(err)}`;
        return {
          llmContent: `Error checking existing file ${params.file_path}: ${errorMsg}`,
          returnDisplay: `Error: ${errorMsg}`,
        };
      }
    }

    try {
      const dirName = path.dirname(params.file_path);
      if (!fs.existsSync(dirName)) {
        fs.mkdirSync(dirName, { recursive: true });
      }

      fs.writeFileSync(params.file_path, params.content, 'utf8');

      // Generate diff for display result
      const fileName = path.basename(params.file_path);
      const fileDiff = Diff.createPatch(
        fileName,
        currentContent, // Empty if it was a new file
        params.content,
        'Original',
        'Written',
        { context: 3 },
      );

      const llmSuccessMessage = isNewFile
        ? `Successfully created and wrote to new file: ${params.file_path}`
        : `Successfully overwrote file: ${params.file_path}`;

      const displayResult: FileDiff = { fileDiff };

      return {
        llmContent: llmSuccessMessage,
        returnDisplay: displayResult,
      };
    } catch (error) {
      const errorMsg = `Error writing to file: ${error instanceof Error ? error.message : String(error)}`;
      return {
        llmContent: `Error writing to file ${params.file_path}: ${errorMsg}`,
        returnDisplay: `Error: ${errorMsg}`,
      };
    }
  }
}
