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

export const switchCommand: CommandModule<
  object,
  { provider: string; model?: string }
> = {
  command: 'switch <provider>',
  describe: 'Switch to a different AI provider',
  builder: {
    provider: {
      type: 'string',
      description: 'Provider to switch to (gemini, claude, openai, ollama)',
      choices: ['gemini', 'claude', 'openai', 'ollama'],
      demandOption: true,
    },
    model: {
      type: 'string',
      alias: 'm',
      description: 'Model to use with the provider',
    },
  },
  handler: async (argv) => {
    const providerId = argv.provider as ProviderId;
    const model = argv.model;

    try {
      const manager = getProviderManager();
      const credentialManager = getCredentialManager();

      // Get API key for the provider
      const apiKey = await credentialManager.getApiKey(providerId);

      if (!apiKey && providerId !== 'ollama') {
        debugLogger.error(`No API key found for ${providerId}.`);
        debugLogger.log(`\nSet one of these environment variables:`);
        debugLogger.log(
          `  - ${credentialManager.getPhoenixEnvVar(providerId)}`,
        );
        debugLogger.log(
          `  - ${credentialManager.getStandardEnvVar(providerId)}`,
        );
        debugLogger.log(
          `\nOr use \`gemini providers auth ${providerId}\` to save a key.\n`,
        );
        await exitCli(1);
        return;
      }

      // Switch provider
      await manager.switchProvider(providerId, {
        apiKey: apiKey || undefined,
        model,
      });

      // Validate credentials
      const valid = await manager.validateCredentials();
      if (!valid) {
        debugLogger.error(`Failed to validate credentials for ${providerId}.`);
        await exitCli(1);
        return;
      }

      const provider = manager.getProvider(providerId);
      const activeModel = model || provider?.defaultModel;

      debugLogger.log(`\n✅ Switched to ${provider?.name || providerId}`);
      debugLogger.log(`   Model: ${activeModel}\n`);
    } catch (error) {
      debugLogger.error(
        `Failed to switch provider: ${error instanceof Error ? error.message : String(error)}`,
      );
      await exitCli(1);
      return;
    }

    await exitCli();
  },
};
