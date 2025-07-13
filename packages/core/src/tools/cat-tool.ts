/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'fs';
import { BaseTool, ToolResult } from './tools.js';
import { getErrorMessage } from '../utils/errors.js';

export interface CatToolParams {
  files: string[];
}

export class CatTool extends BaseTool<CatToolParams, ToolResult> {
  static readonly Name: string = 'cat';
  static readonly Description: string =
    'Reads the contents of one or more files and returns them as a single string.';

  constructor() {
    super(CatTool.Name, 'Cat', CatTool.Description, {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'An array of file paths to read.',
        },
      },
      required: ['files'],
    });
  }

  validateToolParams(params: CatToolParams): string | null {
    if (
      !params.files ||
      !Array.isArray(params.files) ||
      params.files.length === 0
    ) {
      return 'The "files" parameter is required and must be a non-empty array of strings.';
    }
    for (const file of params.files) {
      if (typeof file !== 'string' || file.trim() === '') {
        return 'Each item in "files" must be a non-empty string.';
      }
    }
    return null;
  }

  getDescription(params: CatToolParams): string {
    return `Will read the contents of the following files: ${params.files.join(', ')}`;
  }

  async execute(
    params: CatToolParams,
    signal: AbortSignal,
  ): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: [{ text: `Error: Invalid parameters for ${this.displayName}. Reason: ${validationError}` }],
        returnDisplay: `## Parameter Error\n\n${validationError}`,
      };
    }

    const contents: string[] = [];
    for (const file of params.files) {
      if (signal.aborted) {
        return {
          llmContent: [{ text: 'Tool execution aborted.' }],
          returnDisplay: '## Tool Aborted\n\nCat tool execution was aborted.',
        };
      }
      try {
        const content = await fs.readFile(file, 'utf-8');
        contents.push(content);
      } catch (error) {
        return {
          llmContent: [{ text: `Error reading file ${file}: ${getErrorMessage(error)}` }],
          returnDisplay: `## File Read Error\n\nAn error occurred while reading file ${file}:\n\n${getErrorMessage(error)}\n`,
        };
      }
    }

    return {
      llmContent: [{ text: contents.join('\n') }],
      returnDisplay: `## Cat Tool Result\n\nSuccessfully read ${params.files.length} file(s).`,
    };
  }
}
