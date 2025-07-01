import fs from 'fs/promises';
import { Tool } from '../types/toolTypes';
import { logger } from '../core/logger.js';
import { exec } from 'child_process';
import path from 'path';
import { execSync } from 'child_process';

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
      let dataToWrite = content;
      if (path.extname(filePath).toLowerCase() === '.json') {
        try {
          dataToWrite = JSON.stringify(JSON.parse(content), null, 2);
        } catch (jsonError) {
          logger.error(`WriteFile: Failed to parse JSON content for ${filePath}: ${jsonError.message}`);
          throw new Error(`Failed to parse JSON content for ${filePath}`);
        }
      }

      if (overwrite) {
        await fs.writeFile(filePath, dataToWrite, 'utf-8');
        if (filePath.startsWith('/sdcard')) {
          exec(`termux-toast 'Wrote to ${filePath} successfully'`);
        } else if (filePath === 'clipboard') {
          execSync(`echo '${dataToWrite}' | termux-clipboard-set`);
        }
        logger.info(`WriteFile: Successfully overwrote file: ${filePath}`);
        return `Successfully overwrote file: ${filePath}`;
      } else {
        await fs.appendFile(filePath, dataToWrite, 'utf-8');
        if (filePath.startsWith('/sdcard')) {
          exec(`termux-toast 'Wrote to ${filePath} successfully'`);
        } else if (filePath === 'clipboard') {
          execSync(`echo '${dataToWrite}' | termux-clipboard-set`);
        }
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
