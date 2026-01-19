/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import {
  debugLogger,
  getProviderManager,
  type ProviderModelInfo,
} from '@google/gemini-cli-core';
import { exitCli } from '../utils.js';

export const listCommand: CommandModule = {
  command: 'list',
  describe: 'List available AI providers',
  handler: async () => {
    const manager = getProviderManager();
    const providers = manager.listProviders();

    debugLogger.log('\n📋 Available AI Providers:\n');

    for (const provider of providers) {
      const requiresKey = provider.requiresApiKey ? '🔑' : '🏠';
      debugLogger.log(`\n${requiresKey} ${provider.name} (${provider.id})`);
      debugLogger.log(`   ${provider.description}`);
      debugLogger.log(`   Default model: ${provider.defaultModel}`);
      debugLogger.log(
        `   Features: ${[
          provider.supportsStreaming && 'streaming',
          provider.supportsTools && 'tools',
          provider.supportsVision && 'vision',
        ]
          .filter(Boolean)
          .join(', ')}`,
      );
      const modelIds = provider.models
        .slice(0, 5)
        .map((m: ProviderModelInfo) => m.id);
      debugLogger.log(
        `   Models: ${modelIds.join(', ')}${provider.models.length > 5 ? '...' : ''}`,
      );
    }

    debugLogger.log(
      '\n\nUse `gemini providers models <provider>` to see all models for a provider.',
    );
    debugLogger.log(
      'Use `gemini --provider <name>` to use a specific provider.\n',
    );
    await exitCli();
  },
};
