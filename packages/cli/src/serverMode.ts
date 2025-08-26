/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { loadCliConfig, parseArguments } from './config/config.js';
import { loadSettings, SettingScope } from './config/settings.js';
import { loadExtensions } from './config/extension.js';
import { runNonInteractive } from './nonInteractiveCli.js';
import { sessionId, AuthType } from '@google/gemini-cli-core';
import { validateNonInteractiveAuth } from './validateNonInterActiveAuth.js';
import * as readline from 'node:readline';

const PROMPT_DELIMITER = '---GEMINI_CLI_PROMPT_END---';
const RESPONSE_DELIMITER = '---GEMINI_CLI_RESPONSE_END---';

/**
 * Runs the CLI in a persistent server mode.
 * It initializes everything once, then reads prompts from stdin in a loop.
 */
export async function runServerMode() {
  const workspaceRoot = process.cwd();
  const settings = loadSettings(workspaceRoot);
  const argv = await parseArguments(settings.merged);
  const extensions = loadExtensions(workspaceRoot);
  const config = await loadCliConfig(
    settings.merged,
    extensions,
    sessionId,
    argv,
  );

  // Set a default auth type if one isn't set.
  if (!settings.merged.selectedAuthType) {
    if (process.env['CLOUD_SHELL'] === 'true') {
      settings.setValue(SettingScope.User, 'selectedAuthType', AuthType.CLOUD_SHELL);
    }
  }

  await config.initialize();

  const nonInteractiveConfig = await validateNonInteractiveAuth(
    settings.merged.selectedAuthType,
    settings.merged.useExternalAuth,
    config,
  );

  const rl = readline.createInterface({
    input: process.stdin,
    terminal: false,
  });

  let promptBuffer = '';

  rl.on('line', async (line) => {
    if (line.trim() === PROMPT_DELIMITER) {
      const currentPrompt = promptBuffer;
      promptBuffer = ''; // Reset buffer for the next prompt

      try {
        // We can reuse the existing non-interactive runner for this.
        // It's already set up to take a config and a prompt string.
        await runNonInteractive(nonInteractiveConfig, currentPrompt, 'server-mode-prompt');
      } catch (e) {
        // If the runner throws, we need to report it.
        console.error(`Error processing prompt: ${e}`);
      } finally {
        // IMPORTANT: Always write the delimiter so the parent process isn't blocked.
        process.stdout.write(`\n${RESPONSE_DELIMITER}\n`);
      }
    } else {
      promptBuffer += line + '\n';
    }
  });
}