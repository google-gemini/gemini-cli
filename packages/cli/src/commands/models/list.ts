/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { tokenLimit } from '@google/gemini-cli-core';
import { loadSettings } from '../../config/settings.js';
import { loadCliConfig, type CliArgs } from '../../config/config.js';
import { buildAvailableModels } from '../../acp/acpUtils.js';
import { exitCli } from '../utils.js';
import chalk from 'chalk';

export type ModelsListOutputFormat = 'text' | 'json';

export interface ListedModel {
  id: string;
  name: string;
  description: string;
  inputTokenLimit: number;
}

export async function handleList(args: {
  outputFormat?: ModelsListOutputFormat;
}) {
  const workspaceDir = process.cwd();
  const settings = loadSettings(workspaceDir);

  const config = await loadCliConfig(
    settings.merged,
    'models-list-session',
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    {
      debug: false,
    } as Partial<CliArgs> as CliArgs,
    { cwd: workspaceDir },
  );

  await config.initialize();

  const { availableModels, currentModelId } = buildAvailableModels(
    config,
    settings,
  );

  const models: ListedModel[] = availableModels.map((m) => ({
    id: m.modelId,
    name: m.name,
    description: m.description ?? '',
    inputTokenLimit: tokenLimit(m.modelId),
  }));

  if (args.outputFormat === 'json') {
    process.stdout.write(
      JSON.stringify({ currentModel: currentModelId, models }, null, 2) + '\n',
    );
    return;
  }

  process.stdout.write(chalk.bold('Available Models:') + '\n\n');
  for (const model of models) {
    const current =
      model.id === currentModelId ? chalk.green(' (current)') : '';
    process.stdout.write(`${chalk.bold(model.id)}${current}\n`);
    process.stdout.write(`  Name:        ${model.name}\n`);
    if (model.description) {
      process.stdout.write(`  Description: ${model.description}\n`);
    }
    process.stdout.write(
      `  Input limit: ${model.inputTokenLimit.toLocaleString('en-US')} tokens\n\n`,
    );
  }
}

export const listCommand: CommandModule = {
  command: 'list',
  describe:
    'Lists the models available for use with the -m/--model flag, based on your current configuration.',
  builder: (yargs) =>
    yargs.option('output-format', {
      alias: 'o',
      type: 'string',
      choices: ['text', 'json'],
      default: 'text',
      description: 'The format of the output.',
    }),
  handler: async (argv) => {
    await handleList({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      outputFormat: argv['outputFormat'] as ModelsListOutputFormat,
    });
    await exitCli();
  },
};
