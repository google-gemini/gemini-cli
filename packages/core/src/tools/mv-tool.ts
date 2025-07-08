/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'fs';
import { BaseTool, ToolResult } from './tools.js';
import { getErrorMessage } from '../utils/errors.js';

export interface MvToolParams {
  source: string;
  destination: string;
}

export class MvTool extends BaseTool<MvToolParams, ToolResult> {
  static readonly Name: string = 'mv';
  static readonly Description: string =
    'Moves a file from source to destination.';

  constructor() {
    super(MvTool.Name, 'Move File', MvTool.Description, {
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
    });
  }

  validateToolParams(params: MvToolParams): string | null {
    if (!params.source || params.source.trim() === '') {
      return 'The "source" parameter is required and must be a non-empty string.';
    }
    if (!params.destination || params.destination.trim() === '') {
      return 'The "destination" parameter is required and must be a non-empty string.';
    }
    return null;
  }

  getDescription(params: MvToolParams): string {
    return `Will move file from ${params.source} to ${params.destination}.`;
  }

  async execute(
    params: MvToolParams,
    signal: AbortSignal,
  ): Promise<ToolResult> {
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
        returnDisplay: '## Tool Aborted\n\nMove file operation was aborted.',
      };
    }

    try {
      await fs.rename(params.source, params.destination);
      return {
        llmContent: `Moved ${params.source} to ${params.destination}`,
        returnDisplay: `## Move File Result\n\nSuccessfully moved **${params.source}** to **${params.destination}**.`,
      };
    } catch (error) {
      return {
        llmContent: `Error moving file from ${params.source} to ${params.destination}: ${getErrorMessage(error)}`,
        returnDisplay: `## Move File Error\n\nAn error occurred while moving file from ${params.source} to ${params.destination}:\n\`\`\`\n${getErrorMessage(error)}\n\`\`\``,
      };
    }
  }
}
