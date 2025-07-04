/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from '@google/gemini-cli-core';
import chalk from 'chalk';
import fs from 'fs-extra';
import { MockGeminiAPI } from '../utils/mockGeminiAPI.js';

export async function fileInfo(filePath: string): Promise<void> {
  new Logger().info(
    chalk.green('// Pyrmethus conjures the File Inspector with Gemini’s aid!'),
  );

  const suggestion = await MockGeminiAPI.getSuggestion(
    'Get file metadata in TypeScript.',
  );
  if (suggestion)
    new Logger().info(chalk.yellow(`// Gemini’s wisdom: ${suggestion}`));

  if (!fs.existsSync(filePath)) {
    new Logger().error(chalk.red(`The path '${filePath}' eludes the ether!`));
    const debug = await MockGeminiAPI.getSuggestion(
      `Debug path '${filePath}' not found.`,
    );
    if (debug) new Logger().info(chalk.yellow(`// Gemini’s debug: ${debug}`));
    return;
  }

  try {
    new Logger().info(chalk.cyan(`// Inspecting '${filePath}'...`));
    const stats = await fs.lstat(filePath);
    const info = [
      `Path: ${filePath}`,
      `Type: ${stats.isDirectory() ? 'Directory' : 'File'}`,
      `Size: ${stats.size} bytes`,
      `Permissions: ${stats.mode.toString(8)}`,
      `Last Modified: ${stats.mtime.toISOString()}`,
    ].join('\n');
    new Logger().info(chalk.yellow(info));
    new Logger().info(chalk.green(`Success! Metadata retrieved for '${filePath}'.`));
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

