/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render } from 'ink';
import { App } from './ui/App.js';
import { loadCliConfig } from './config/config.js';
import { readStdin } from './utils/readStdin.js';
import { GeminiClient } from '@gemini-code/server';
import { readPackageUp } from 'read-package-up';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { sandbox_command, start_sandbox } from './utils/sandbox.js';
import { loadSettings } from './config/settings.js';
import { themeManager } from './ui/themes/theme-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  const settings = loadSettings(process.cwd());
  const config = await loadCliConfig(settings.merged);
  if (settings.merged.theme) {
    themeManager.setActiveTheme(settings.merged.theme);
  }

  // hop into sandbox if we are outside and sandboxing is enabled
  if (!process.env.SANDBOX) {
    const sandbox = sandbox_command(config.getSandbox());
    if (sandbox) {
      console.log('hopping into sandbox ...');
      await start_sandbox(sandbox);
      process.exit(0);
    }
  }

  let input = config.getQuestion();

  // Render UI, passing necessary config values. Check that there is no command line question.
  if (process.stdin.isTTY && input?.length === 0) {
    const readUpResult = await readPackageUp({ cwd: __dirname });
    const cliVersion =
      process.env.CLI_VERSION || readUpResult?.packageJson.version || 'unknown';

    render(
      React.createElement(App, {
        config,
        settings,
        cliVersion,
      }),
    );
    return;
  }
  // If not a TTY, read from stdin
  // This is for cases where the user pipes input directly into the command
  if (!process.stdin.isTTY) {
    input += await readStdin();
  }
  if (!input) {
    console.error('No input provided via stdin.');
    process.exit(1);
  }

  // If not a TTY and we have initial input, process it directly
  const geminiClient = new GeminiClient(config);
  const chat = await geminiClient.startChat();
  try {
    for await (const event of geminiClient.sendMessageStream(chat, [
      { text: input },
    ])) {
      if (event.type === 'content') {
        process.stdout.write(event.value);
      }
      // We might need to handle other event types later, but for now, just content.
    }
    process.stdout.write('\n'); // Add a newline at the end
    process.exit(0);
  } catch (error) {
    console.error('Error processing piped input:', error);
    process.exit(1);
  }
}

// --- Global Unhandled Rejection Handler ---
process.on('unhandledRejection', (reason, _promise) => {
  // Log other unexpected unhandled rejections as critical errors
  console.error('=========================================');
  console.error('CRITICAL: Unhandled Promise Rejection!');
  console.error('=========================================');
  console.error('Reason:', reason);
  console.error('Stack trace may follow:');
  if (!(reason instanceof Error)) {
    console.error(reason);
  }
  // Exit for genuinely unhandled errors
  process.exit(1);
});

// --- Global Entry Point ---
main().catch((error) => {
  console.error('An unexpected critical error occurred:');
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(String(error));
  }
  process.exit(1);
});
