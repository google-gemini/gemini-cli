/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { logger } from '@google/gemini-cli-core/dist/src/core/logger.js';
import chalk from 'chalk';
import fs from 'fs-extra';
import { MockGeminiAPI } from '../utils/mockGeminiAPI.js';

export async function explainCode(codeOrPath: string): Promise<void> {
  logger.info(
    chalk.green('// Pyrmethus conjures the Code Explainer with Gemini’s aid!'),
  );

  const suggestion = await MockGeminiAPI.getSuggestion(
    'Explain code in TypeScript.',
  );
  if (suggestion)
    logger.info(chalk.yellow(`// Gemini’s wisdom: ${suggestion}`));

  let code: string;
  if (fs.existsSync(codeOrPath)) {
    code = await fs.readFile(codeOrPath, 'utf-8');
  } else {
    code = codeOrPath;
  }

  if (!code) {
    logger.error(
      chalk.red('The ether requires code or a valid file path!'),
    );
    return;
  }

  try {
    logger.info(
      chalk.cyan(`// Explaining code: ${code.substring(0, 50)}...`),
    );
    // Simulate Gemini API explanation
    const explanation = `This code appears to be a ${code.includes('console.log') ? 'JavaScript/TypeScript snippet' : 'generic script'}. It outputs content to the console.`;
    logger.info(chalk.yellow(explanation));
    logger.info(chalk.green('Explanation complete.'));
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
