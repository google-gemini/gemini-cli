/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ArgumentsCamelCase, CommandModule } from 'yargs';
import { loadSettings, SettingScope } from '../../config/settings.js';

interface EnableArgs {
  name: string;
  global: boolean;
}

export const enableCommand: CommandModule<object, EnableArgs> = {
  command: 'enable <name>',
  describe: 'Enable an extension',
  builder: (yargs) =>
    yargs
      .positional('name', {
        describe: 'Name of the extension to enable',
        type: 'string',
        demandOption: true,
      })
      .option('global', {
        describe: 'Enable the extension globally',
        type: 'boolean',
        default: false,
      }),
  handler: async (argv: ArgumentsCamelCase<EnableArgs>) => {
    const { name, global } = argv;
    const workspaceRoot = process.cwd();
    const settings = loadSettings(workspaceRoot);
    const scope = global ? SettingScope.User : SettingScope.Workspace;

    const settingsFile = settings.forScope(scope);
    const disabled = settingsFile.settings.extensions?.disabled || [];

    if (!disabled.includes(name)) {
      console.log(`Extension "${name}" is not disabled.`);
      return;
    }

    const newDisabled = disabled.filter((ext) => ext !== name);
    const newExtensions = {
      ...settingsFile.settings.extensions,
      disabled: newDisabled,
    };
    settings.setValue(scope, 'extensions', newExtensions);

    console.log(`Extension "${name}" has been enabled.`);
  },
};
