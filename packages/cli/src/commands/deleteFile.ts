/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { logger } from '@google/gemini-cli-core';
import chalk from 'chalk';
import fs from 'fs-extra';
import { MockGeminiAPI } from '../utils/mockGeminiAPI.js';

export async function deleteFile(
  pathToDelete: string,
  confirm: string,
): Promise<void> {
  logger.info(
    chalk.green('// Pyrmethus conjures the File Deleter with Gemini’s aid!'),
  );

  const suggestion = await MockGeminiAPI.getSuggestion(
    'Delete files in TypeScript.',
  );
  if (suggestion)
    logger.info(chalk.yellow(`// Gemini’s wisdom: ${suggestion}`));

  if (!fs.existsSync(pathToDelete)) {
    logger.error(
      chalk.red(`The path '${pathToDelete}' eludes the ether!`),
    );
    const debug = await MockGeminiAPI.getSuggestion(
      `Debug path '${pathToDelete}' not found.`,
    );
    if (debug) logger.info(chalk.yellow(`// Gemini’s debug: ${debug}`));
    return;
  }

  if (confirm.toLowerCase() !== 'yes') {
    logger.warn(chalk.yellow('Please confirm deletion with "yes".'));
    return;
  }

  try {
    logger.info(
      chalk.cyan(`// Banishing '${pathToDelete}' from the realm...`),
    );
    await fs.remove(pathToDelete);
    logger.info(
      chalk.green(`Success! '${pathToDelete}' has been banished.`),
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
