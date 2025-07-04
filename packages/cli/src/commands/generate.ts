/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from '@google/gemini-cli-core';
import chalk from 'chalk';
import fs from 'fs-extra';
import { MockGeminiAPI } from '../utils/mockGeminiAPI.js';

export async function generateCode(prompt: string): Promise<void> {
  new Logger().info(
    chalk.green('// Pyrmethus conjures the Code Generator with Gemini’s aid!'),
  );

  const suggestion = await MockGeminiAPI.getSuggestion(
    'Generate code in TypeScript.',
  );
  if (suggestion)
    new Logger().info(chalk.yellow(`// Gemini’s wisdom: ${suggestion}`));

  if (!prompt) {
    new Logger().error(chalk.red('The ether demands a prompt to weave code!'));
    return;
  }

  try {
    new Logger().info(chalk.cyan(`// Forging code for prompt: '${prompt}'...`));
    // Simulate Gemini API response
    const code = `// Generated code for: ${prompt}\nconsole.log('Hello, Termux!');`;
    const outputPath = `/data/data/com.termux/files/home/generated_${Date.now()}.ts`;
    await fs.writeFile(outputPath, code);
    new Logger().info(chalk.green(`Success! Code forged at '${outputPath}'.`));
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
