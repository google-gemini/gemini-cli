/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import chalk from 'chalk';
import fs from 'fs-extra';
import { MockGeminiAPI } from '../utils/mockGeminiAPI.js';

export async function generateCode(prompt: string): Promise<void> {
  console.log(
    chalk.green('// Pyrmethus conjures the Code Generator with Gemini’s aid!'),
  );

  const suggestion = await MockGeminiAPI.getSuggestion(
    'Generate code in TypeScript.',
  );
  if (suggestion)
    console.log(chalk.yellow(`// Gemini’s wisdom: ${suggestion}`));

  if (!prompt) {
    console.log(chalk.red('The ether demands a prompt to weave code!'));
    return;
  }

  try {
    console.log(chalk.cyan(`// Forging code for prompt: '${prompt}'...`));
    // Simulate Gemini API response
    const code = `// Generated code for: ${prompt}\nconsole.log('Hello, Termux!');`;
    const outputPath = `/data/data/com.termux/files/home/generated_${Date.now()}.ts`;
    await fs.writeFile(outputPath, code);
    console.log(chalk.green(`Success! Code forged at '${outputPath}'.`));
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
