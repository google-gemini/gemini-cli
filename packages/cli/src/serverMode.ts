/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { runNonInteractive } from './nonInteractiveCli.js';
import { initializeCli } from './init.js';
import * as readline from 'node:readline';

const PROMPT_DELIMITER = '---GEMINI_CLI_PROMPT_END---';
const RESPONSE_DELIMITER = '---GEMINI_CLI_RESPONSE_END---';

/**
 * Runs the CLI in a persistent server mode.
 */
export async function runServerMode() {
  // All initialization is now handled by the shared function.
  const config = await initializeCli();

  const rl = readline.createInterface({
    input: process.stdin,
    terminal: false,
  });

  let promptBuffer = '';

  rl.on('line', async (line) => {
    if (line.trim() === PROMPT_DELIMITER) {
      rl.pause();
      const currentPrompt = promptBuffer;
      promptBuffer = '';

      try {
        // The config object is already validated for non-interactive use.
        await runNonInteractive(config, currentPrompt, 'server-mode-prompt');
      } catch (e) {
        console.error(`Error processing prompt: ${e}`);
      } finally {
        process.stdout.write(`\n${RESPONSE_DELIMITER}\n`);
        rl.resume();
      }
    } else {
      promptBuffer += line + '\n';
    }
  });
}