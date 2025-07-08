import { promises as fs } from 'fs';
import { BaseTool, ToolResult } from './tools.js';
import { getErrorMessage } from '../utils/errors.js';

export interface TouchToolParams {
  file: string;
}

export class TouchTool extends BaseTool<TouchToolParams, ToolResult> {
  static readonly Name: string = 'touch';
  static readonly Description: string =
    'Creates an empty file or updates its timestamp.';

  constructor() {
    super(TouchTool.Name, 'Touch File', TouchTool.Description, {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'The path to the file to touch.',
        },
      },
      required: ['file'],
    });
  }

  validateToolParams(params: TouchToolParams): string | null {
    if (!params.file || params.file.trim() === '') {
      return 'The "file" parameter is required and must be a non-empty string.';
    }
    return null;
  }

  getDescription(params: TouchToolParams): string {
    return `Will create or update the timestamp of the file: ${params.file}`;
  }

  async execute(
    params: TouchToolParams,
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
        returnDisplay: '## Tool Aborted\n\nTouch file operation was aborted.',
      };
    }

    try {
      // Use fs.utimes to update timestamp, or create if not exists
      const now = new Date();
      await fs.utimes(params.file, now, now);
      return {
        llmContent: `Touched ${params.file}`,
        returnDisplay: `## Touch File Result\n\nSuccessfully touched file **${params.file}**.`,
      };
    } catch (error) {
      // If utimes fails because file doesn't exist, try creating it with writeFile
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        try {
          await fs.writeFile(params.file, '');
          return {
            llmContent: `Created empty file ${params.file}`,
            returnDisplay: `## Touch File Result\n\nSuccessfully created empty file **${params.file}**.`,
          };
        } catch (writeError) {
          return {
            llmContent: `Error creating file ${params.file}: ${getErrorMessage(writeError)}`,
            returnDisplay: `## File Creation Error\n\nAn error occurred while creating file ${params.file}:\n\n${getErrorMessage(writeError)}\n\n`,
          };
        }
      }
      return {
        llmContent: `Error touching file ${params.file}: ${getErrorMessage(error)}`,
        returnDisplay: `## File Touch Error\n\nAn error occurred while touching file ${params.file}:\n\n${getErrorMessage(error)}\n\n`,
      };
    }
  }
}
