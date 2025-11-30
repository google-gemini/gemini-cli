/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { migrateCommand } from './migrate.js';
import { listCommand } from './list.js';
import { enableCommand } from './enable.js';
import { disableCommand } from './disable.js';
import { installCommand } from './install.js';
import { uninstallCommand } from './uninstall.js';

export const hooksCommand: CommandModule = {
  command: 'hooks <command>',
  describe: 'Manage hooks',
  builder: (yargs) =>
    yargs
      .command(migrateCommand)
      .command(listCommand)
      .command(enableCommand)
      .command(disableCommand)
      .command(installCommand)
      .command(uninstallCommand)
      .demandCommand(),
  handler: () => {},
};
