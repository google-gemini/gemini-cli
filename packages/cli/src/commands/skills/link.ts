/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { debugLogger } from '@google/gemini-cli-core';
import chalk from 'chalk';

import { getErrorMessage } from '../../utils/errors.js';
import { exitCli } from '../utils.js';
import {
  requestConsentNonInteractive,
  skillsConsentString,
} from '../../config/extensions/consent.js';
import { linkSkill } from '../../utils/skillUtils.js';

interface LinkArgs {
  path: string;
  scope?: 'user' | 'workspace';
  consent?: boolean;
}

export async function handleLink(args: LinkArgs) {
  try {
    const { scope = 'user', consent } = args;

    await linkSkill(
      args.path,
      scope,
      (msg) => debugLogger.log(msg),
      async (skills, targetDir) => {
        const consentString = await skillsConsentString(
          skills,
          args.path,
          targetDir,
          true,
        );
        if (consent) {
          debugLogger.log('You have consented to the following:');
          debugLogger.log(consentString);
          return true;
        }
        return requestConsentNonInteractive(consentString);
      },
    );

    debugLogger.log(chalk.green('\nSuccessfully linked skills.'));
  } catch (error) {
    debugLogger.error(getErrorMessage(error));
    await exitCli(1);
  }
}

export const linkCommand: CommandModule = {
  command: 'link <path>',
  describe:
    'Links an agent skill from a local path. Updates to the source will be reflected immediately.',
  builder: (yargs) =>
    yargs
      .positional('path', {
        describe: 'The local path of the skill to link.',
        type: 'string',
        demandOption: true,
      })
      .option('scope', {
        describe:
          'The scope to link the skill into. Defaults to "user" (global).',
        choices: ['user', 'workspace'],
        default: 'user',
      })
      .option('consent', {
        describe:
          'Acknowledge the security risks of linking a skill and skip the confirmation prompt.',
        type: 'boolean',
        default: false,
      })
      .check((argv) => {
        if (!argv.path) {
          throw new Error('The path argument must be provided.');
        }
        return true;
      }),
  handler: async (argv) => {
    await handleLink({
      path: argv['path'] as string,
      scope: argv['scope'] as 'user' | 'workspace',
      consent: argv['consent'] as boolean | undefined,
    });
    await exitCli();
  },
};
