/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from '@google/gemini-cli-core';
import chalk from 'chalk';
import { refactorCode } from '../../packages/core/src/tools/refactor-code.js'; // Adjust path as needed
import { MockGeminiAPI } from '../utils/mockGeminiAPI.js';
import { edit } from '@google/gemini-cli-core'; // Assuming edit tool is available

export async function refactorCodeCommand(
  filePath: string,
  refactoringType: string,
  oldName: string,
  newName: string,
): Promise<void> {
  const logger = new Logger();
  logger.info(
    chalk.green('// Pyrmethus conjures the Code Refactorer with Gemini’s aid!'),
  );

  const suggestion = await MockGeminiAPI.getSuggestion(
    `Refactor code: ${refactoringType} in ${filePath}`,
  );
  if (suggestion)
    logger.info(chalk.yellow(`// Gemini’s wisdom: ${suggestion}`));

  if (refactoringType !== 'rename-symbol') {
    logger.error(
      chalk.red(`// Refactoring type '${refactoringType}' not yet supported.`),
    );
    return;
  }

  if (!filePath || !oldName || !newName) {
    logger.error(
      chalk.red('// Missing required parameters: filePath, oldName, newName.'),
    );
    return;
  }

  try {
    logger.info(
      chalk.cyan(
        `// Attempting to refactor '${oldName}' to '${newName}' in '${filePath}'...`,
      ),
    );
    const diff = await refactorCode({
      filePath,
      refactoringType: 'rename-symbol',
      oldName,
      newName,
    });

    if (diff.includes('No changes made')) {
      logger.warn(chalk.yellow(diff));
      return;
    }

    logger.info(chalk.blue('// Proposed changes (diff):'));
    logger.info(chalk.white(diff)); // Display the diff

    // Automatically apply the diff for now. In a full interactive-edit, this would be a prompt.
    await edit(filePath, diff);
    logger.info(chalk.green(`Success! Refactoring applied to '${filePath}'.`));
  } catch (error: unknown) {
    let errorMessage = 'An unknown error occurred.';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    logger.error(
      chalk.red(`The spirits falter during refactoring: ${errorMessage}`),
    );
    const debug = await MockGeminiAPI.getSuggestion(
      `Debug refactoring error: ${errorMessage}`,
    );
    if (debug) logger.info(chalk.yellow(`// Gemini’s debug: ${debug}`));
  }
}
