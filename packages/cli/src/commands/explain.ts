/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from '@google/gemini-cli-core';
import chalk from 'chalk';
import fs from 'fs-extra';
import { MockGeminiAPI } from '../utils/mockGeminiAPI.js';

export async function explainCode(codeOrPath: string): Promise<void> {
  new Logger().info(
    chalk.green('// Pyrmethus conjures the Code Explainer with Gemini’s aid!'),
  );

  const suggestion = await MockGeminiAPI.getSuggestion(
    'Explain code in TypeScript.',
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
    new Logger().info(chalk.cyan(`// Explaining code: ${code.substring(0, 50)}...`));
    // Simulate Gemini API explanation
    const explanation = `This code appears to be a ${code.includes('console.log') ? 'JavaScript/TypeScript snippet' : 'generic script'}. It outputs content to the console.`;
    new Logger().info(chalk.yellow(explanation));
    new Logger().info(chalk.green('Explanation complete.'));
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
