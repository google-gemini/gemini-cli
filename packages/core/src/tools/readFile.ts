import fs from 'fs/promises';
import { Tool } from '../types/toolTypes';
import { logger } from '../core/logger.js';

export interface ReadFileArgs {
  filePath: string;
}

export const readFileTool: Tool<ReadFileArgs, string> = {
  name: 'ReadFile',
  description: 'Reads the content of a specified file.',
  async execute(args: ReadFileArgs): Promise<string> {
    const { filePath } = args;

    if (!filePath) {
      const errorMessage = 'filePath is required for ReadFile tool.';
      logger.error(`ReadFile: ${errorMessage}`);
      throw new Error(errorMessage);
    }

    logger.info(`ReadFile: Attempting to read file at path: ${filePath}`);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      logger.info(`ReadFile: Successfully read file: ${filePath}`);
      return content;
    } catch (error: any) {
      const errorMessage = `Failed to read file: ${filePath}. Reason: ${error.message}`;
      logger.error(`ReadFile: ${errorMessage}`, { error });
      throw new Error(errorMessage);
    }
  },
};
