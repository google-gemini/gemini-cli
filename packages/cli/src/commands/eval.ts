/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule, Argv, ArgumentsCamelCase } from 'yargs';
import { initializeOutputListenersAndFlush } from '../gemini.js';
import { setDeferredCommand } from '../deferred.js';
import { runEval } from './eval/run.js';
import { exitCli } from './utils.js';

export const evalCommand: CommandModule = {
  command: 'eval <path>',
  describe: 'Run behavioral evaluation test cases',
  builder: (yargs: Argv) =>
    yargs
      .middleware((argv) => {
        initializeOutputListenersAndFlush();
        argv['isCommand'] = true;
      })
      .positional('path', {
        describe: 'Path to a JSON file containing test case(s)',
        type: 'string',
        demandOption: true,
      })
      .version(false),
  handler: (argv) => {
    setDeferredCommand({
      handler: async (a: ArgumentsCamelCase) => {
        const success = await runEval(String(a['path']));
        await exitCli(success ? 0 : 1);
      },
      argv: argv as ArgumentsCamelCase,
      commandName: 'eval',
    });
  },
};
