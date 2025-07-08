/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'fs';
import { BaseTool, ToolResult } from './tools.js';
import { getErrorMessage } from '../utils/errors.js';

export interface RmToolParams {
  file: string;
}

export class RmTool extends BaseTool<RmToolParams, ToolResult> {
  static readonly Name: string = 'rm';
  static readonly Description: string = 'Removes a file.';

  constructor() {
    super(
      RmTool.Name,
      'Remove File',
      RmTool.Description,
      {
        type: 'object',
        properties: {
          file: {
            type: 'string',
            description: 'The path to the file to remove.',
          },
        },
        required: ['file'],
      },
    );
  }

  validateToolParams(params: RmToolParams): string | null {
    if (!params.file || params.file.trim() === '') {
      return 'The "file" parameter is required and must be a non-empty string.';
    }
    return null;
  }

  getDescription(params: RmToolParams): string {
    return `Will remove the file: ${params.file}`;
  }

  async execute(params: RmToolParams, signal: AbortSignal): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `Error: Invalid parameters for ${this.displayName}. Reason: ${validationError}`,
        returnDisplay: `## Parameter Error\n\n${validationError}`,
      };
    }

    if (signal.aborted) {
      return {
        llmContent: 'Tool execution aborted.',
        returnDisplay: '## Tool Aborted\n\nRemove file operation was aborted.',
      };
    }

    try {
      await fs.unlink(params.file);
      return {
        llmContent: `Removed ${params.file}`,
        returnDisplay: `## Remove File Result

Successfully removed file **${params.file}**.`,
      };
    } catch (error) {
      return {
        llmContent: `Error removing file ${params.file}: ${getErrorMessage(error)}`,
        returnDisplay: `## File Removal Error\n\nAn error occurred while removing file ${params.file}:\n\n${getErrorMessage(error)}\n\n`,
      };
    }
  }
}

