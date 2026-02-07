/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import readline from 'node:readline';
import { CoreEvent, coreEvents } from './events.js';
import { FatalAuthenticationError } from './errors.js';
import { createWorkingStdio, writeToStdout } from './stdio.js';

/**
 * Requests consent from the user for OAuth login.
 * Handles both TTY and non-TTY environments.
 */
export async function getConsentForOauth(prompt: string): Promise<boolean> {
  const finalPrompt = prompt + ' Opening authentication page in your browser. ';

  if (coreEvents.listenerCount(CoreEvent.ConsentRequest) === 0) {
    if (!process.stdin.isTTY) {
      throw new FatalAuthenticationError(
        'Interactive consent could not be obtained.\n' +
          'Please run Gemini CLI in an interactive terminal to authenticate, or use NO_BROWSER=true for manual authentication.',
      );
    }
    return getOauthConsentNonInteractive(finalPrompt);
  }

  return getOauthConsentInteractive(finalPrompt);
}

async function getOauthConsentNonInteractive(prompt: string) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: createWorkingStdio().stdout,
    terminal: true,
  });

  const fullPrompt = prompt + 'Do you want to continue? [Y/n]: ';
  writeToStdout(`\n${fullPrompt}`);

  return new Promise<boolean>((resolve) => {
    rl.on('line', (answer) => {
      rl.close();
      resolve(['y', ''].includes(answer.trim().toLowerCase()));
    });
  });
}

async function getOauthConsentInteractive(prompt: string) {
  const fullPrompt = prompt + '\n\nDo you want to continue?';
  return new Promise<boolean>((resolve) => {
    coreEvents.emitConsentRequest({
      prompt: fullPrompt,
      onConfirm: (confirmed: boolean) => {
        resolve(confirmed);
      },
    });
  });
}
