/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import {
  debugLogger,
  getProviderManager,
  getCredentialManager,
  type ProviderId,
} from '@google/gemini-cli-core';
import { exitCli } from '../utils.js';
import * as readline from 'node:readline';

export const authCommand: CommandModule<
  object,
  { provider: string; clear?: boolean }
> = {
  command: 'auth <provider>',
  describe: 'Configure API key for a provider',
  builder: {
    provider: {
      type: 'string',
      description: 'Provider to configure (gemini, claude, openai)',
      choices: ['gemini', 'claude', 'openai'],
      demandOption: true,
    },
    clear: {
      type: 'boolean',
      description: 'Clear stored API key for the provider',
      default: false,
    },
  },
  handler: async (argv) => {
    const providerId = argv.provider as ProviderId;
    const credentialManager = getCredentialManager();

    if (argv.clear) {
      await credentialManager.clearApiKey(providerId);
      debugLogger.log(`\n✅ Cleared stored API key for ${providerId}.\n`);
      await exitCli();
      return;
    }

    // Check if key already exists
    const existingKey = await credentialManager.getApiKey(providerId);
    if (existingKey) {
      const masked = `${existingKey.slice(0, 8)}...${existingKey.slice(-4)}`;
      debugLogger.log(
        `\n⚠️  An API key already exists for ${providerId}: ${masked}`,
      );
      debugLogger.log(`Use --clear to remove it first.\n`);
      await exitCli();
      return;
    }

    // Prompt for API key
    const provider = getProviderManager().getProvider(providerId);
    const providerName = provider?.name || providerId;

    debugLogger.log(`\n🔑 Configure API key for ${providerName}\n`);
    debugLogger.log(getApiKeyInstructions(providerId));

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question('\nEnter your API key: ', async (apiKey) => {
      rl.close();

      if (!apiKey || apiKey.trim() === '') {
        debugLogger.error('No API key provided.');
        await exitCli(1);
        return;
      }

      try {
        // Save the key
        await credentialManager.setApiKey(providerId, apiKey.trim());

        // Validate the key
        const manager = getProviderManager();
        await manager.switchProvider(providerId, { apiKey: apiKey.trim() });
        const valid = await manager.validateCredentials();

        if (valid) {
          debugLogger.log(
            `\n✅ API key saved and validated for ${providerName}.\n`,
          );
        } else {
          debugLogger.warn(
            `\n⚠️  API key saved but validation failed. The key may be invalid.\n`,
          );
        }
      } catch (error) {
        debugLogger.error(
          `Failed to save API key: ${error instanceof Error ? error.message : String(error)}`,
        );
        await exitCli(1);
        return;
      }

      await exitCli();
    });
  },
};

function getApiKeyInstructions(providerId: ProviderId): string {
  switch (providerId) {
    case 'gemini':
      return `Get your API key from Google AI Studio:
   https://aistudio.google.com/apikey`;
    case 'claude':
      return `Get your API key from Anthropic Console:
   https://console.anthropic.com/settings/keys`;
    case 'openai':
      return `Get your API key from OpenAI Platform:
   https://platform.openai.com/api-keys`;
    default:
      return '';
  }
}
