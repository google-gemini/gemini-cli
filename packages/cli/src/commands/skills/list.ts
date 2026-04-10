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
import { z } from 'zod';

const listArgsSchema = z.object({
  all: z.boolean().default(false),
});

const configArgsSchema = z.object({
  debug: z.boolean().default(false),
});

export async function handleList(args: { all?: boolean }) {
  const workspaceDir = process.cwd();
  const settings = loadSettings(workspaceDir);

  const parsedConfigArgs = configArgsSchema.parse({ debug: false });
  const configArgs: CliArgs = {
    query: undefined,
    model: undefined,
    sandbox: undefined,
    debug: parsedConfigArgs.debug,
    prompt: undefined,
    promptInteractive: undefined,
    yolo: undefined,
    approvalMode: undefined,
    policy: undefined,
    adminPolicy: undefined,
    allowedMcpServerNames: undefined,
    allowedTools: undefined,
    acp: undefined,
    experimentalAcp: undefined,
    extensions: undefined,
    listExtensions: undefined,
    resume: undefined,
    listSessions: undefined,
    deleteSession: undefined,
    includeDirectories: undefined,
    screenReader: undefined,
    useWriteTodos: undefined,
    outputFormat: undefined,
    fakeResponses: undefined,
    recordResponses: undefined,
    startupMessages: undefined,
    rawOutput: undefined,
    acceptRawOutputRisk: undefined,
    isCommand: undefined,
  };

  const config = await loadCliConfig(
    settings.merged,
    'skills-list-session',
    configArgs,
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
    const status = skill.disabled
      ? chalk.red('[Disabled]')
      : chalk.green('[Enabled]');

    const builtinSuffix = skill.isBuiltin ? chalk.gray(' [Built-in]') : '';

    process.stdout.write(
      `${chalk.bold(skill.name)} ${status}${builtinSuffix}\n`,
    );
    process.stdout.write(`  Description: ${skill.description}\n`);
    process.stdout.write(`  Location:    ${skill.location}\n\n`);
  }
}

export const listCommand: CommandModule = {
  command: 'list [--all]',
  describe: 'Lists discovered agent skills.',
  builder: (yargs) =>
    yargs.option('all', {
      type: 'boolean',
      description: 'Show all skills, including built-in ones.',
      default: false,
    }),
  handler: async (argv) => {
    const parsedArgs = listArgsSchema.parse(argv);
    await handleList(parsedArgs);
    await exitCli();
  },
};
