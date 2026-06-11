/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import {
  debugLogger,
  getErrorMessage,
  ModelConfigService,
  DEFAULT_MODEL_CONFIGS,
  tokenLimit,
} from '@google/gemini-cli-core';
import { loadSettings } from '../config/settings.js';
import { exitCli } from './utils.js';

/**
 * Handles the 'models' command to list available Gemini models.
 */
export async function handleModelsList(options?: {
  outputFormat?: 'text' | 'json';
}) {
  try {
    const workspaceDir = process.cwd();
    const settings = loadSettings(workspaceDir).merged;

    const modelConfigService = new ModelConfigService(
      settings.modelConfigs ?? DEFAULT_MODEL_CONFIGS,
    );

    const context = {
      hasAccessToPreview: true,
      useGemini3_1: true,
      useGemini3_5Flash: true,
    };

    const models = modelConfigService
      .getAvailableModelOptions(context)
      .map((m) => ({
        modelId: m.modelId,
        displayName: m.name,
        description: m.description,
        contextWindow: tokenLimit(m.modelId),
        tier: m.tier,
      }));

    if (options?.outputFormat === 'json') {
      debugLogger.log(JSON.stringify(models, null, 2));
    } else {
      debugLogger.log('Available Gemini Models:');
      debugLogger.log('');
      for (const m of models) {
        debugLogger.log(`${m.displayName} (${m.modelId})`);
        if (m.description) {
          debugLogger.log(`  Description: ${m.description}`);
        }
        debugLogger.log(
          `  Context Window: ${m.contextWindow.toLocaleString()} tokens`,
        );
        debugLogger.log(`  Tier: ${m.tier}`);
        debugLogger.log('');
      }
    }
  } catch (error) {
    debugLogger.error(getErrorMessage(error));
    process.exit(1);
  }
}

export const modelsCommand: CommandModule = {
  command: 'models',
  describe: 'Lists available Gemini models in a structured format.',
  builder: (yargs) =>
    yargs.option('output-format', {
      alias: 'o',
      type: 'string',
      describe: 'The format of the CLI output.',
      choices: ['text', 'json'],
      default: 'text',
    }),
  handler: async (argv) => {
    await handleModelsList({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      outputFormat: argv['output-format'] as 'text' | 'json',
    });
    await exitCli();
  },
};
