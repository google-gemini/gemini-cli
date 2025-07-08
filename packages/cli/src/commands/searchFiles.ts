/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from '@google/gemini-cli-core';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { MockGeminiAPI } from '../utils/mockGeminiAPI.js';

export async function searchFiles(
  dirPath: string,
  searchTerm: string,
  searchContent: string,
): Promise<void> {
  new Logger('cli-command').info(
    chalk.green('// Pyrmethus conjures the File Searcher with Gemini’s aid!'),
  );

  const suggestion = await MockGeminiAPI.getSuggestion(
    'Search files in TypeScript.',
  );
  if (suggestion)
    new Logger('cli-command').info(
      chalk.yellow(`// Gemini’s wisdom: ${suggestion}`),
    );

  const targetPath = dirPath || '/data/data/com.termux/files/home';
  if (!fs.existsSync(targetPath)) {
    new Logger('cli-command').error(
      chalk.red(`The path '${targetPath}' eludes the ether!`),
    );
    const debug = await MockGeminiAPI.getSuggestion(
      `Debug path '${targetPath}' not found.`,
    );
    if (debug)
      new Logger('cli-command').info(
        chalk.yellow(`// Gemini’s debug: ${debug}`),
      );
    return;
  }

  try {
    new Logger('cli-command').info(
      chalk.cyan(`// Searching '${targetPath}' for '${searchTerm}'...`),
    );
    const results: string[] = [];
    const searchDir = async (currentPath: string) => {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        if (entry.isDirectory()) {
          await searchDir(fullPath);
        } else if (entry.name.includes(searchTerm)) {
          results.push(`[FILE] ${fullPath}`);
        } else if (searchContent.toLowerCase() === 'yes') {
          const content = await fs.readFile(fullPath, 'utf-8');
          if (content.includes(searchTerm))
            results.push(`[CONTENT] ${fullPath}`);
        }
      }
    };
    await searchDir(targetPath);
    new Logger('cli-command').info(
      chalk.yellow(results.join('\n') || 'No matches found.'),
    );
    new Logger('cli-command').info(
      chalk.green(
        `Success! Found ${results.length} matches in '${targetPath}'.`,
      ),
    );
  } catch (error: unknown) {
    let errorMessage = 'An unknown error occurred.';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    new Logger('cli-command').error(
      chalk.red(`The spirits falter: ${errorMessage}`),
    );
    const debug = await MockGeminiAPI.getSuggestion(
      `Debug error: ${errorMessage}`,
    );
    if (debug)
      new Logger('cli-command').info(
        chalk.yellow(`// Gemini’s debug: ${debug}`),
      );
  }
}
