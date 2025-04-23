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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  const config = loadCliConfig();
  let input = config.getQuestion();

  // Render UI, passing necessary config values. Check that there is no command line question.
  if (process.stdin.isTTY && input?.length === 0) {
    const readUpResult = await readPackageUp({ cwd: __dirname });
    const cliVersion =
      process.env.NODE_ENV === 'development'
        ? 'local'
        : (readUpResult?.packageJson.version ?? 'unknown');

    render(
      React.createElement(App, {
        config,
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
  // Check if this is the known 429 ClientError that sometimes escapes
  // this is a workaround for a specific issue with the way we are calling gemini
  // where a 429 error is thrown but not caught, causing an unhandled rejection
  // TODO(adh): Remove this when the race condition is fixed
  const isKnownEscaped429 =
    reason instanceof Error &&
    reason.name === 'ClientError' &&
    reason.message.includes('got status: 429');

  if (isKnownEscaped429) {
    // Log it differently and DON'T exit, as it's likely already handled visually
    console.warn('-----------------------------------------');
    console.warn(
      'WORKAROUND: Suppressed known escaped 429 Unhandled Rejection.',
    );
    console.warn('-----------------------------------------');
    console.warn('Reason:', reason);
    return;
    // No process.exit(1); Don't exit.
  }

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
