/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { execSync } from 'node:child_process';
import process from 'node:process';
import { coreEvents } from '@google/gemini-cli-core';
import { getInstallationInfo } from '../utils/installationInfo.js';
import { initializeOutputListenersAndFlush } from '../gemini.js';
import { runExitCleanup } from '../utils/cleanup.js';

export const updateCommand: CommandModule = {
  command: 'update',
  describe: 'Updates the Gemini CLI to the latest version.',
  builder: (yargs) =>
    yargs.middleware((argv) => {
      initializeOutputListenersAndFlush();
      argv['isCommand'] = true;
    }),
  handler: async () => {
    coreEvents.emitFeedback('info', 'Checking installation method...');

    const installInfo = getInstallationInfo(process.cwd(), true);

    if (!installInfo.isGlobal || !installInfo.updateCommand) {
      coreEvents.emitFeedback(
        'error',
        installInfo.updateMessage ||
          'Could not determine a global installation method. Please update manually.',
      );
      await runExitCleanup();
      process.exit(1);
      return; // For tests
    }

    try {
      coreEvents.emitFeedback(
        'info',
        `Detected global installation via: ${installInfo.packageManager}. Upgrading...`,
      );
      coreEvents.emitFeedback(
        'info',
        `Executing: ${installInfo.updateCommand}`,
      );
      execSync(installInfo.updateCommand, { stdio: 'inherit' });

      coreEvents.emitFeedback('info', 'Gemini CLI successfully updated!');
      await runExitCleanup();
      process.exit(0);
    } catch (error) {
      if (error instanceof Error && error.message.includes('EACCES')) {
        const isWindows = process.platform === 'win32';
        const suggestion = isWindows
          ? 'Try running this command in a terminal with Administrator privileges.'
          : `Try running the command with sudo: sudo ${installInfo.updateCommand}`;
        coreEvents.emitFeedback('error', `Permission denied. ${suggestion}`);
      } else {
        coreEvents.emitFeedback(
          'error',
          `Update failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      await runExitCleanup();
      process.exit(1);
    }
  },
};
