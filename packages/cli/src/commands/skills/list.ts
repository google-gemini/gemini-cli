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
import {
  getDiscoveryReportForSkill,
  type SkillDiscoveryTiming,
} from '../../utils/skillDiscovery.js';

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
  const reports = (
    skillManager as {
      getLatestDiscoveryReport?: () => SkillDiscoveryTiming[];
    }
  ).getLatestDiscoveryReport?.();

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
    const report = getDiscoveryReportForSkill(skill.location, reports);
    const status = skill.disabled
      ? chalk.red('[Disabled]')
      : chalk.green('[Enabled]');

    const builtinSuffix = skill.isBuiltin ? chalk.gray(' [Built-in]') : '';

    process.stdout.write(
      `${chalk.bold(skill.name)} ${status}${builtinSuffix}\n`,
    );
    process.stdout.write(`  Description: ${skill.description}\n`);
    if (args.verbose) {
      process.stdout.write(`  Location:    ${skill.location}\n`);
      process.stdout.write(
        `  Load Time:   ${skill.loadMetadata?.duration_ms ?? 'n/a'}ms\n`,
      );
      if (report) {
        process.stdout.write(
          `  Discovery:   total ${report.total_duration_ms}ms, glob ${report.glob_duration_ms}ms\n`,
        );
      }
    } else {
      process.stdout.write(`  Location:    ${skill.location}\n`);
    }
    process.stdout.write('\n');
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
        description: 'Show per-directory and per-skill load timings.',
        default: false,
      }),
  handler: async (argv) => {
    await handleList({
      all: argv['all'] === true,
      verbose: argv['verbose'] === true,
    });
    await exitCli();
  },
};
