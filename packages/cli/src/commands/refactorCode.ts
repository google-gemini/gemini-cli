/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from '@google/gemini-cli-core';
import chalk from 'chalk';

const logger = new Logger('refactor-code-command');

export async function refactorCodeCommand(
  filePath: string,
  refactoringType: string,
  oldName: string,
  newName: string,
): Promise<void> {
  logger.info(
    chalk.green('// Pyrmethus conjures the Code Refactorer with Gemini’s aid!'),
  );

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
    const diff = await default_api.refactorCode({
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
    await default_api.edit(filePath, diff);
    logger.info(chalk.green(`Success! Refactoring applied to '${filePath}'.`));
  } catch (error: unknown) {
    let errorMessage = 'An unknown error occurred.';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    logger.error(
      chalk.red(`The spirits falter during refactoring: ${errorMessage}`),
    );
  }
}
