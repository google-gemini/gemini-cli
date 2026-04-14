/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { loadSettings } from '../../config/settings.js';
import { loadCliConfig, type CliArgs } from '../../config/config.js';
import { exitCli } from '../utils.js';
import chalk from 'chalk';

interface SkillLoadMetadataView {
  duration_ms?: number;
}

export async function handleList(args: { all?: boolean; verbose?: boolean }) {
  const workspaceDir = process.cwd();
  const settings = loadSettings(workspaceDir);

  const config = await loadCliConfig(
    settings.merged,
    'skills-list-session',
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    {
      debug: false,
    } as Partial<CliArgs> as CliArgs,
    { cwd: workspaceDir },
  );

  // Initialize to trigger extension loading and skill discovery
  await config.initialize();

  const skillManager = config.getSkillManager();
  const skills = args.all
    ? skillManager.getAllSkills()
    : skillManager.getAllSkills().filter((s) => !s.isBuiltin);

  // Sort skills: non-built-in first, then alphabetically by name
  skills.sort((a, b) => {
    if (a.isBuiltin === b.isBuiltin) {
      return a.name.localeCompare(b.name);
    }
    return a.isBuiltin ? 1 : -1;
  });

  if (skills.length === 0) {
    process.stdout.write('No skills discovered.\n');
    return;
  }

  process.stdout.write(chalk.bold('Discovered Agent Skills:') + '\n\n');

  for (const skill of skills) {
    const loadMetadata = (skill as { loadMetadata?: SkillLoadMetadataView })
      .loadMetadata;
    const status = skill.disabled
      ? chalk.red('[Disabled]')
      : chalk.green('[Enabled]');

    const builtinSuffix = skill.isBuiltin ? chalk.gray(' [Built-in]') : '';

    process.stdout.write(
      `${chalk.bold(skill.name)} ${status}${builtinSuffix}\n`,
    );
    process.stdout.write(`  Description: ${skill.description}\n`);
    process.stdout.write(`  Location:    ${skill.location}\n\n`);
    if (args.verbose) {
      process.stdout.write(
        `  Load Time:   ${loadMetadata?.duration_ms ?? 'n/a'}ms\n`,
      );
      process.stdout.write('\n');
    }
  }
}

export const listCommand: CommandModule = {
  command: 'list [--all] [--verbose]',
  describe: 'Lists discovered agent skills.',
  builder: (yargs) =>
    yargs
      .option('all', {
        type: 'boolean',
        description: 'Show all skills, including built-in ones.',
        default: false,
      })
      .option('verbose', {
        type: 'boolean',
        description: 'Show skill load timings.',
        default: false,
      }),
  handler: async (argv) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    await handleList({
      all: argv['all'] as boolean,
      verbose: argv['verbose'] as boolean,
    });
    await exitCli();
  },
};
