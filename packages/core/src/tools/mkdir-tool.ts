/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'fs';
import { BaseTool, ToolResult } from './tools.js';
import { getErrorMessage } from '../utils/errors.js';

export interface MkdirToolParams {
  directory: string;
}

export class MkdirTool extends BaseTool<MkdirToolParams, ToolResult> {
  static readonly Name: string = 'mkdir';
  static readonly Description: string = 'Creates a directory.';

  constructor() {
    super(
      MkdirTool.Name,
      'Make Directory',
      MkdirTool.Description,
      {
        type: 'object',
        properties: {
          directory: {
            type: 'string',
            description: 'The path to the directory to create.',
          },
        },
        required: ['directory'],
      },
    );
  }

  validateToolParams(params: MkdirToolParams): string | null {
    if (!params.directory || params.directory.trim() === '') {
      return 'The "directory" parameter is required and must be a non-empty string.';
    }
    return null;
  }

  getDescription(params: MkdirToolParams): string {
    return `Will create the directory: ${params.directory}`;
  }

  async execute(params: MkdirToolParams, signal: AbortSignal): Promise<ToolResult> {
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
        returnDisplay: '## Tool Aborted\n\nMake directory operation was aborted.',
      };
    }

    try {
      await fs.mkdir(params.directory, { recursive: true });
      return {
        llmContent: `Created directory ${params.directory}`,
        returnDisplay: `## Make Directory Result\n\nSuccessfully created directory **${params.directory}**.`,
      };
    } catch (error) {
      return {
        llmContent: `Error creating directory ${params.directory}: ${getErrorMessage(error)}`,
        returnDisplay: `## Directory Creation Error\n\nAn error occurred while creating directory ${params.directory}:\n\n${getErrorMessage(error)}\n\n`,
      };
    }
  }
}

