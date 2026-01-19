/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import {
  debugLogger,
  getProviderManager,
  type ProviderId,
} from '@google/gemini-cli-core';
import { exitCli } from '../utils.js';

export const modelsCommand: CommandModule<
  object,
  { provider: string | undefined }
> = {
  command: 'models [provider]',
  describe: 'List models for a provider',
  builder: {
    provider: {
      type: 'string',
      description:
        'Provider to list models for (gemini, claude, openai, ollama)',
      demandOption: false,
    },
  },
  handler: async (argv) => {
    const manager = getProviderManager();
    const activeProvider = manager.getActiveProviderId();
    const providerId = (argv.provider ||
      activeProvider ||
      'gemini') as ProviderId;

    try {
      const models = await manager.listModels(providerId);
      const provider = manager.getProvider(providerId);
      const providerName = provider?.name || providerId;

      debugLogger.log(`\n🤖 Models for ${providerName}:\n`);

      for (const model of models) {
        const features = [
          model.supportsTools && '🔧 tools',
          model.supportsVision && '👁️ vision',
        ].filter(Boolean);

        debugLogger.log(`\n  ${model.id}`);
        if (model.name !== model.id) {
          debugLogger.log(`    Name: ${model.name}`);
        }
        if (model.description) {
          debugLogger.log(`    ${model.description}`);
        }
        debugLogger.log(
          `    Context: ${formatNumber(model.contextWindow)} tokens`,
        );
        if (model.maxOutputTokens) {
          debugLogger.log(
            `    Max output: ${formatNumber(model.maxOutputTokens)} tokens`,
          );
        }
        if (features.length > 0) {
          debugLogger.log(`    Features: ${features.join(', ')}`);
        }
      }

      debugLogger.log(
        `\n\nUse \`gemini --provider ${providerId} --model <model-id>\` to use a specific model.\n`,
      );
    } catch (error) {
      debugLogger.error(
        `Failed to list models: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    await exitCli();
  },
};

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(0)}K`;
  }
  return String(num);
}
