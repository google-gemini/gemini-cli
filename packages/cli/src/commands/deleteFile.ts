/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from '@google/gemini-cli-core';
import chalk from 'chalk';
import fs from 'fs-extra';
import { MockGeminiAPI } from '../utils/mockGeminiAPI.js';

export async function deleteFile(
  pathToDelete: string,
  confirm: string,
): Promise<void> {
  new Logger().info(
    chalk.green('// Pyrmethus conjures the File Deleter with Gemini’s aid!'),
  );

  const suggestion = await MockGeminiAPI.getSuggestion(
    'Delete files in TypeScript.',
  );
  if (suggestion)
    new Logger().info(chalk.yellow(`// Gemini’s wisdom: ${suggestion}`));

  if (!fs.existsSync(pathToDelete)) {
    new Logger().error(chalk.red(`The path '${pathToDelete}' eludes the ether!`));
    const debug = await MockGeminiAPI.getSuggestion(
      `Debug path '${pathToDelete}' not found.`,
    );
    if (debug) new Logger().info(chalk.yellow(`// Gemini’s debug: ${debug}`));
    return;
  }

  if (confirm.toLowerCase() !== 'yes') {
    new Logger().warn(chalk.yellow('Please confirm deletion with "yes".'));
    return;
  }

  try {
    new Logger().info(chalk.cyan(`// Banishing '${pathToDelete}' from the realm...`));
    await fs.remove(pathToDelete);
    new Logger().info(chalk.green(`Success! '${pathToDelete}' has been banished.`));
  } catch (error: unknown) {
    let errorMessage = 'An unknown error occurred.';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    new Logger().error(chalk.red(`The spirits falter: ${errorMessage}`));
    const debug = await MockGeminiAPI.getSuggestion(
      `Debug error: ${errorMessage}`,
    );
    if (debug) new Logger().info(chalk.yellow(`// Gemini’s debug: ${debug}`));
  }
}
