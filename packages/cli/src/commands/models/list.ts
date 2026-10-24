/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import {
  type Config,
  tokenLimit,
  DEFAULT_TOKEN_LIMIT,
} from '@google/gemini-cli-core';
import chalk from 'chalk';
import { loadSettings, type LoadedSettings } from '../../config/settings.js';
import { loadCliConfig, type CliArgs } from '../../config/config.js';
import { buildAvailableModels } from '../../acp/acpUtils.js';
import { exitCli } from '../utils.js';
import { initializeOutputListenersAndFlush } from '../../gemini.js';

export interface ModelListing {
  modelId: string;
  id: string;
  name: string;
  displayName: string;
  description: string;
  tier?: string;
  contextLimits: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface HandleListModelsOptions {
  outputFormat?: 'text' | 'json';
  loadedSettings?: LoadedSettings;
  argv?: Partial<CliArgs>;
}

const DEFAULT_CLI_ARGS: CliArgs = {
  model: undefined,
  sandbox: undefined,
  debug: false,
  prompt: undefined,
  promptInteractive: undefined,
  query: undefined,
  yolo: undefined,
  approvalMode: undefined,
  policy: undefined,
  adminPolicy: undefined,
  allowedMcpServerNames: undefined,
  allowedTools: undefined,
  extensions: undefined,
  listExtensions: undefined,
  listModels: undefined,
  resume: undefined,
  sessionId: undefined,
  listSessions: undefined,
  deleteSession: undefined,
  includeDirectories: undefined,
  screenReader: undefined,
  useWriteTodos: undefined,
  outputFormat: undefined,
  fakeResponses: undefined,
  recordResponses: undefined,
  rawOutput: undefined,
  acceptRawOutputRisk: undefined,
  skipTrust: undefined,
  isCommand: true,
};

export function getModelListings(
  config: Config,
  settings: LoadedSettings,
): ModelListing[] {
  const { availableModels } = buildAvailableModels(config, settings);

  return (availableModels ?? []).map((m) => {
    const inputTokens = tokenLimit(m.modelId) ?? DEFAULT_TOKEN_LIMIT;
    const outputTokens = 8192;
    return {
      modelId: m.modelId,
      id: m.modelId,
      name: m.name ?? m.modelId,
      displayName: m.name ?? m.modelId,
      description: m.description ?? '',
      contextLimits: {
        inputTokens,
        outputTokens,
      },
    };
  });
}

export async function handleList(
  options?: HandleListModelsOptions,
): Promise<void> {
  const workspaceDir = process.cwd();
  const settings = options?.loadedSettings ?? loadSettings(workspaceDir);
  const argv: CliArgs = {
    ...DEFAULT_CLI_ARGS,
    ...options?.argv,
  };

  const config = await loadCliConfig(
    settings.merged,
    'models-list-session',
    argv,
    {
      cwd: workspaceDir,
      skipExtensions: true,
      loadedSettings: settings,
    },
  );

  initializeOutputListenersAndFlush(config);

  await config.storage.initialize();

  const models = getModelListings(config, settings);

  if (options?.outputFormat === 'json') {
    process.stdout.write(JSON.stringify(models, null, 2) + '\n');
    return;
  }

  process.stdout.write(chalk.bold('Available Gemini Models:') + '\n\n');
  for (const model of models) {
    process.stdout.write(`${chalk.bold(model.modelId)} (${model.name})\n`);
    if (model.description) {
      process.stdout.write(`  Description:   ${model.description}\n`);
    }
    process.stdout.write(
      `  Context limit: ${model.contextLimits.inputTokens.toLocaleString()} input tokens / ${model.contextLimits.outputTokens.toLocaleString()} output tokens\n\n`,
    );
  }
}

interface ListArgs extends Partial<CliArgs> {
  'output-format'?: string;
  loadedSettings?: LoadedSettings;
}

export const listCommand: CommandModule<object, ListArgs> = {
  command: ['$0', 'list'],
  describe: 'Lists available Gemini models.',
  builder: (yargs) =>
    yargs.option('output-format', {
      alias: 'o',
      type: 'string',
      describe: 'The format of the CLI output.',
      choices: ['text', 'json'],
      default: 'text',
    }),
  handler: async (argv) => {
    const outputFormat = argv['output-format'] === 'json' ? 'json' : 'text';
    try {
      await handleList({
        outputFormat,
        loadedSettings: argv.loadedSettings,
        argv,
      });
    } catch (error) {
      process.stderr.write(
        'Error: ' +
          (error instanceof Error
            ? error.stack || error.message
            : String(error)) +
          '\n',
      );
      process.exitCode = 1;
    } finally {
      await exitCli();
    }
  },
};
