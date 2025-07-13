/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'fs';
import { BaseTool, ToolResult } from './tools.js';
import { getErrorMessage } from '../utils/errors.js';

export interface LsToolParams {
  directory: string;
}

export class LsTool extends BaseTool<LsToolParams, ToolResult> {
  static readonly Name: string = 'ls';
  static readonly Description: string = 'Lists the contents of a directory.';

  constructor() {
    super(LsTool.Name, 'List Directory', LsTool.Description, {
      type: 'object',
      properties: {
        directory: {
          type: 'string',
          description: 'The path to the directory to list.',
        },
      },
      required: ['directory'],
    });
  }

  validateToolParams(params: LsToolParams): string | null {
    if (!params.directory || params.directory.trim() === '') {
      return 'The "directory" parameter is required and must be a non-empty string.';
    }
    return null;
  }

  getDescription(params: LsToolParams): string {
    return `Will list the contents of the directory: ${params.directory}`;
  }

  async execute(
    params: LsToolParams,
    signal: AbortSignal,
  ): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: [{ text: `Error: Invalid parameters for ${this.displayName}. Reason: ${validationError}` }],
        returnDisplay: `## Parameter Error\n\n${validationError}`,
      };
    }

    if (signal.aborted) {
      return {
        llmContent: [{ text: 'Tool execution aborted.' }],
        returnDisplay:
          '## Tool Aborted\n\nList directory operation was aborted.',
      };
    }

    try {
      const files = await fs.readdir(params.directory);
      return {
        llmContent: [{ text: files.join('\n') }],
        returnDisplay: `## List Directory Result

Successfully listed ${files.length} item(s) in **${params.directory}**.`,
      };
    } catch (error) {
      return {
        llmContent: [{ text: `Error reading directory ${params.directory}: ${getErrorMessage(error)}` }],
        returnDisplay: `## Directory Read Error\n\nAn error occurred while reading directory ${params.directory}:\n\n${getErrorMessage(error)}\n\n`,
      };
    }
  }
}
