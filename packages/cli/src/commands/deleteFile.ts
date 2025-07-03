/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import chalk from 'chalk';
import fs from 'fs-extra';
import { MockGeminiAPI } from '../utils/mockGeminiAPI.js';

export async function deleteFile(
  pathToDelete: string,
  confirm: string,
): Promise<void> {
  console.log(
    chalk.green('// Pyrmethus conjures the File Deleter with Gemini’s aid!'),
  );

  const suggestion = await MockGeminiAPI.getSuggestion(
    'Delete files in TypeScript.',
  );
  if (suggestion)
    console.log(chalk.yellow(`// Gemini’s wisdom: ${suggestion}`));

  if (!fs.existsSync(pathToDelete)) {
    console.log(chalk.red(`The path '${pathToDelete}' eludes the ether!`));
    const debug = await MockGeminiAPI.getSuggestion(
      `Debug path '${pathToDelete}' not found.`,
    );
    if (debug) console.log(chalk.yellow(`// Gemini’s debug: ${debug}`));
    return;
  }

  if (confirm.toLowerCase() !== 'yes') {
    console.log(chalk.yellow('Please confirm deletion with "yes".'));
    return;
  }

  try {
    console.log(chalk.cyan(`// Banishing '${pathToDelete}' from the realm...`));
    await fs.remove(pathToDelete);
    console.log(chalk.green(`Success! '${pathToDelete}' has been banished.`));
  } catch (error: unknown) {
    let errorMessage = 'An unknown error occurred.';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    console.log(chalk.red(`The spirits falter: ${errorMessage}`));
    const debug = await MockGeminiAPI.getSuggestion(
      `Debug error: ${errorMessage}`,
    );
    if (debug) console.log(chalk.yellow(`// Gemini’s debug: ${debug}`));
  }
}
