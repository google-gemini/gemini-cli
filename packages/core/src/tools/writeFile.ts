import fs from 'fs/promises';
import { Tool } from '../types/toolTypes';
import { logger } from '../utils/logger'; // Assuming logger path

export interface WriteFileArgs {
  filePath: string;
  content: string;
  overwrite?: boolean;
}

export const writeFileTool: Tool<WriteFileArgs, string> = {
  name: 'WriteFile',
  description: 'Writes content to a specified file. By default, it appends. Use overwrite: true to replace the file.',
  async execute(args: WriteFileArgs): Promise<string> {
    const { filePath, content, overwrite = false } = args;

    if (!filePath || content === undefined) {
      const errorMessage = 'filePath and content are required for WriteFile tool.';
      logger.error(`WriteFile: ${errorMessage}`);
      throw new Error(errorMessage);
    }

    const operation = overwrite ? 'overwriting' : 'appending to';
    logger.info(`WriteFile: Attempting to ${operation} file: ${filePath}`);

    try {
      if (overwrite) {
        await fs.writeFile(filePath, content, 'utf-8');
        logger.info(`WriteFile: Successfully overwrote file: ${filePath}`);
        return `Successfully overwrote file: ${filePath}`;
      } else {
        await fs.appendFile(filePath, content, 'utf-8');
        logger.info(`WriteFile: Successfully appended to file: ${filePath}`);
        return `Successfully appended to file: ${filePath}`;
      }
    } catch (error: any) {
      const errorMessage = `Failed to ${operation} file: ${filePath}. Reason: ${error.message}`;
      logger.error(`WriteFile: ${errorMessage}`, { error });
      throw new Error(errorMessage);
    }
  },
};
