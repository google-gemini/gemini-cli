/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'fs';
import { BaseTool, ToolResult } from './tools.js';
import { getErrorMessage } from '../utils/errors.js';

export interface CpToolParams {
  source: string;
  destination: string;
}

export class CpTool extends BaseTool<CpToolParams, ToolResult> {
  static readonly Name: string = 'cp';
  static readonly Description: string = 'Copies a file from source to destination.';

  constructor() {
    super(
      CpTool.Name,
      'Copy File',
      CpTool.Description,
      {
        type: 'object',
        properties: {
          source: {
            type: 'string',
            description: 'The path to the source file.',
          },
          destination: {
            type: 'string',
            description: 'The path to the destination file.',
          },
        },
        required: ['source', 'destination'],
      },
    );
  }

  validateToolParams(params: CpToolParams): string | null {
    if (!params.source || params.source.trim() === '') {
      return 'The "source" parameter is required and must be a non-empty string.';
    }
    if (!params.destination || params.destination.trim() === '') {
      return 'The "destination" parameter is required and must be a non-empty string.';
    }
    return null;
  }

  getDescription(params: CpToolParams): string {
    return `Will copy file from ${params.source} to ${params.destination}.`;
  }

  async execute(params: CpToolParams, signal: AbortSignal): Promise<ToolResult> {
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
        returnDisplay: '## Tool Aborted\n\nCopy file operation was aborted.',
      };
    }

    try {
      await fs.copyFile(params.source, params.destination);
      return {
        llmContent: `Copied ${params.source} to ${params.destination}`,
        returnDisplay: `## Copy File Result\n\nSuccessfully copied **${params.source}** to **${params.destination}**.`,
      };
    } catch (error) {
      return {
        llmContent: `Error copying file from ${params.source} to ${params.destination}: ${getErrorMessage(error)}`,
        returnDisplay: `## Copy File Error\n\nAn error occurred while copying file from ${params.source} to ${params.destination}:\n\`\`\`\n${getErrorMessage(error)}\n\`\`\``,
      };
    }
  }
}

