/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { logger } from '@google/gemini-cli-core/dist/src/core/logger.js';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path'; // Import path module
import { MockGeminiAPI } from '../utils/mockGeminiAPI.js';

export async function listFiles(
  dirPath: string,
  filter: string = '',
): Promise<void> {
  logger.info(
    chalk.green('// Pyrmethus conjures the File Lister with Gemini’s aid!'),
  );

  const suggestion = await MockGeminiAPI.getSuggestion(
    'List directory contents in TypeScript.',
  );
  if (suggestion)
    logger.info(chalk.yellow(`// Gemini’s wisdom: ${suggestion}`));

  const targetPath = dirPath || '/data/data/com.termux/files/home';
  if (!fs.existsSync(targetPath)) {
    logger.error(chalk.red(`The path '${targetPath}' eludes the ether!`));
    const debug = await MockGeminiAPI.getSuggestion(
      `Debug path '${targetPath}' not found.`,
    );
    if (debug) logger.info(chalk.yellow(`// Gemini’s debug: ${debug}`));
    return;
  }

  try {
    logger.info(chalk.cyan(`// Listing contents of '${targetPath}'...`));
    const files = await fs.readdir(targetPath, { withFileTypes: true });

    const fileDetailsPromises = files.map(async (f) => {
      const fullPath = path.join(targetPath, f.name);
      try {
        const stats = await fs.stat(fullPath);
        const type = f.isDirectory() ? '[DIR]' : '[FILE]';
        const size = f.isDirectory() ? '' : ` (${formatBytes(stats.size)})`;
        const mtime = ` (${stats.mtime.toISOString().slice(0, 16).replace('T', ' ')})`; // Format modification time
        return `${type} ${f.name}${size}${mtime}`;
      } catch (statError) {
        // If stat fails (e.g., permission denied), still list the file name
        const type = f.isDirectory() ? '[DIR]' : '[FILE]';
        return `${type} ${f.name} (Error getting info)`;
      }
    });

    const fileDetails = await Promise.all(fileDetailsPromises);

    const filteredDetails = filter
      ? fileDetails.filter((detail) => detail.includes(filter))
      : fileDetails;

    const result = filteredDetails.join('\n');
    logger.info(chalk.yellow(result || 'No files found.'));
    logger.info(
      chalk.green(
        `Success! Listed ${filteredDetails.length} items in '${targetPath}'.`,
      ),
    );
  } catch (error: unknown) {
    let errorMessage = 'An unknown error occurred.';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    logger.error(chalk.red(`The spirits falter: ${errorMessage}`));
    const debug = await MockGeminiAPI.getSuggestion(
      `Debug error: ${errorMessage}`,
    );
    if (debug) logger.info(chalk.yellow(`// Gemini’s debug: ${debug}`));
  }
}

// Helper function to format bytes into human-readable format
function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
