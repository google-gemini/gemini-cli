/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'fs';
import { BaseTool, ToolResult } from './tools.js';
import { getErrorMessage } from '../utils/errors.js';

export interface RmdirToolParams {
  directory: string;
}

export class RmdirTool extends BaseTool<RmdirToolParams, ToolResult> {
  static readonly Name: string = 'rmdir';
  static readonly Description: string = 'Removes a directory.';

  constructor() {
    super(
      RmdirTool.Name,
      'Remove Directory',
      RmdirTool.Description,
      {
        type: 'object',
        properties: {
          directory: {
            type: 'string',
            description: 'The path to the directory to remove.',
          },
        },
        required: ['directory'],
      },
    );
  }

  validateToolParams(params: RmdirToolParams): string | null {
    if (!params.directory || params.directory.trim() === '') {
      return 'The "directory" parameter is required and must be a non-empty string.';
    }
    return null;
  }

  getDescription(params: RmdirToolParams): string {
    return `Will remove the directory: ${params.directory}`;
  }

  async execute(params: RmdirToolParams, signal: AbortSignal): Promise<ToolResult> {
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
        returnDisplay: '## Tool Aborted\n\nRemove directory operation was aborted.',
      };
    }

    try {
      await fs.rmdir(params.directory);
      return {
        llmContent: `Removed directory ${params.directory}`,
        returnDisplay: `## Remove Directory Result\n\nSuccessfully removed directory **${params.directory}**.`,
      };
    } catch (error) {
      return {
        llmContent: `Error removing directory ${params.directory}: ${getErrorMessage(error)}`,
        returnDisplay: `## Directory Removal Error\n\nAn error occurred while removing directory ${params.directory}:\n\`\`\`\n${getErrorMessage(error)}\n\`\`\``,
      };
    }
  }
}

