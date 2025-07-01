import fs from 'fs/promises';
import { Tool } from '../types/toolTypes';
import { logger } from '../core/logger.js';
import fetch from 'node-fetch';
import { execSync } from 'child_process';
import path from 'path';

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
      if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
        const response = await fetch(filePath);
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        return await response.text();
      } else if (filePath === 'clipboard') {
        return execSync('termux-clipboard-get').toString();
      }
      const content = await fs.readFile(filePath, 'utf-8');
      if (filePath.startsWith('/sdcard')) {
        exec(`termux-toast 'Read ${filePath} successfully'`);
      }
      if (path.extname(filePath).toLowerCase() === '.json') {
        try {
          return JSON.stringify(JSON.parse(content), null, 2);
        } catch (jsonError) {
          logger.error(`ReadFile: Failed to parse JSON from ${filePath}: ${jsonError.message}`);
          throw new Error(`Failed to parse JSON from ${filePath}`);
        }
      }
      logger.info(`ReadFile: Successfully read file: ${filePath}`);
      return content;
    } catch (error: any) {
      const errorMessage = `Failed to read file: ${filePath}. Reason: ${error.message}`;
      logger.error(`ReadFile: ${errorMessage}`, { error });
      throw new Error(errorMessage);
    }
  },
};
