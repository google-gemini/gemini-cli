/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { logger } from '@google/gemini-cli-core';
import chalk from 'chalk';
import fs from 'fs-extra';
import { MockGeminiAPI } from '../utils/mockGeminiAPI.js';

export async function fileInfo(filePath: string): Promise<void> {
  logger.info(
    chalk.green('// Pyrmethus conjures the File Inspector with Gemini’s aid!'),
  );

  const suggestion = await MockGeminiAPI.getSuggestion(
    'Get file metadata in TypeScript.',
  );
  if (suggestion)
    logger.info(chalk.yellow(`// Gemini’s wisdom: ${suggestion}`));

  if (!fs.existsSync(filePath)) {
    logger.error(chalk.red(`The path '${filePath}' eludes the ether!`));
    const debug = await MockGeminiAPI.getSuggestion(
      `Debug path '${filePath}' not found.`,
    );
    if (debug) logger.info(chalk.yellow(`// Gemini’s debug: ${debug}`));
    return;
  }

  try {
    logger.info(chalk.cyan(`// Inspecting '${filePath}'...`));
    const stats = await fs.lstat(filePath);
    const info = [
      `Path: ${filePath}`,
      `Type: ${stats.isDirectory() ? 'Directory' : 'File'}`,
      `Size: ${stats.size} bytes`,
      `Permissions: ${stats.mode.toString(8)}`,
      `Last Modified: ${stats.mtime.toISOString()}`,
    ].join('\n');
    logger.info(chalk.yellow(info));
    logger.info(chalk.green(`Success! Metadata retrieved for '${filePath}'.`));
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

