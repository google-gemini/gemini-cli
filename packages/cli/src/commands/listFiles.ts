/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { logger } from '@google/gemini-cli-core/dist/src/core/logger.js';
import chalk from 'chalk';
import fs from 'fs-extra';
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
    const filteredFiles = filter
      ? files.filter((f) => f.name.includes(filter))
      : files;
    const result = filteredFiles
      .map((f) => {
        const type = f.isDirectory() ? '[DIR]' : '[FILE]';
        return `${type} ${f.name}`;
      })
      .join('\n');
    logger.info(chalk.yellow(result || 'No files found.'));
    logger.info(
      chalk.green(
        `Success! Listed ${filteredFiles.length} items in '${targetPath}'.`,
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
