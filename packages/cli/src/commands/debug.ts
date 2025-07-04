/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from '@google/gemini-cli-core';
import chalk from 'chalk';
import fs from 'fs-extra';
import { MockGeminiAPI } from '../utils/mockGeminiAPI.js';

export async function debugCode(
  codeOrPath: string,
  errorMsg?: string,
): Promise<void> {
  new Logger().info(
    chalk.green('// Pyrmethus conjures the Code Debugger with Gemini’s aid!'),
  );

  const suggestion = await MockGeminiAPI.getSuggestion(
    'Debug code in TypeScript.',
  );
  if (suggestion)
    new Logger().info(chalk.yellow(`// Gemini’s wisdom: ${suggestion}`));

  let code: string;
  if (fs.existsSync(codeOrPath)) {
    code = await fs.readFile(codeOrPath, 'utf-8');
  } else {
    code = codeOrPath;
  }

  if (!code) {
    new Logger().error(chalk.red('The ether requires code or a valid file path!'));
    return;
  }

  try {
    new Logger().info(chalk.cyan(`// Analyzing code: ${code.substring(0, 50)}...`));
    // Simulate Gemini API debug response
    const debugOutput = errorMsg
      ? `Debugging error: ${errorMsg}\nSuggestion: Check syntax and variable declarations.`
      : 'No errors found. Code appears syntactically correct.';
    new Logger().info(chalk.yellow(debugOutput));
    new Logger().info(chalk.green('Debugging complete.'));
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
