/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import process from 'node:process';
import {
  Config,
  loadEnvironment,
  createServerConfig,
} from '@gemini-code/server';

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash-preview-04-17';

// Keep CLI-specific argument parsing
interface CliArgs {
  model: string | undefined;
  debug_mode: boolean | undefined;
  question: string | undefined;
}

function parseArguments(): CliArgs {
  const argv = yargs(hideBin(process.argv))
    .option('model', {
      alias: 'm',
      type: 'string',
      description: `The Gemini model to use. Defaults to ${DEFAULT_GEMINI_MODEL}.`,
      default: process.env.GEMINI_CODE_MODEL || DEFAULT_GEMINI_MODEL,
    })
    .option('debug_mode', {
      alias: 'z',
      type: 'boolean',
      description: 'Whether to run in debug mode. Defaults to false.',
      default: false,
    })
    .option('question', {
      alias: 'q',
      type: 'string',
      description:
        'The question to pass to the command when using piped input.',
    })
    .help()
    .alias('h', 'help')
    .strict().argv;
  return argv as unknown as CliArgs;
}

// Renamed function for clarity
export function loadCliConfig(): Config {
  // Load .env file using logic from server package
  loadEnvironment();

  // Check API key (CLI responsibility)
  if (!process.env.GEMINI_API_KEY) {
    console.log(
      'GEMINI_API_KEY is not set. See https://ai.google.dev/gemini-api/docs/api-key to obtain one. ' +
        'Please set it in your .env file or as an environment variable.',
    );
    process.exit(1);
  }

  // Parse CLI arguments
  const argv = parseArguments();

  // Create config using factory from server package
  return createServerConfig(
    process.env.GEMINI_API_KEY,
    argv.model || DEFAULT_GEMINI_MODEL,
    process.cwd(),
    argv.debug_mode || false,
    argv.question || '',
    // TODO: load passthroughCommands from .env file
  );
}
