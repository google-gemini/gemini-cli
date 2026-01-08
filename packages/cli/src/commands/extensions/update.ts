/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import {
  updateAllUpdatableExtensions,
  type ExtensionUpdateInfo,
  checkForAllExtensionUpdates,
  updateExtension,
} from '../../config/extensions/update.js';
import { checkForExtensionUpdate } from '../../config/extensions/github.js';
import { getErrorMessage } from '../../utils/errors.js';
import { ExtensionUpdateState } from '../../ui/state/extensions.js';
import { debugLogger } from '@google/gemini-cli-core';
import { ExtensionManager } from '../../config/extension-manager.js';
import { requestConsentNonInteractive } from '../../config/extensions/consent.js';
import { loadSettings } from '../../config/settings.js';
import { promptForSetting } from '../../config/extensions/extensionSettings.js';
import { exitCli } from '../utils.js';

interface UpdateArgs {
  name?: string;
  all?: boolean;
}

const updateOutput = (info: ExtensionUpdateInfo) =>
  `Extension "${info.name}" successfully updated: ${info.originalVersion} → ${info.updatedVersion}.`;

export async function handleUpdate(args: UpdateArgs) {
  const workspaceDir = process.cwd();
  const settings = loadSettings(workspaceDir).merged;
  const extensionManager = new ExtensionManager({
    workspaceDir,
    requestConsent: requestConsentNonInteractive,
    requestSetting: promptForSetting,
    settings,
  });

  const extensions = await extensionManager.loadExtensions();
  if (args.name) {
    try {
      const extension = extensions.find(
        (extension) => extension.name === args.name,
      );
      if (!extension) {
        debugLogger.log(`Extension "${args.name}" not found.`);
        return;
      }
      if (!extension.installMetadata) {
        debugLogger.log(
          `Unable to install extension "${args.name}" due to missing install metadata`,
        );
        return;
      }
      const updateState = await checkForExtensionUpdate(
        extension,
        extensionManager,
      );
      if (updateState !== ExtensionUpdateState.UPDATE_AVAILABLE) {
        debugLogger.log(`Extension "${args.name}" is already up to date.`);
        return;
      }
      // TODO(chrstnb): we should list extensions if the requested extension is not installed.
      const updatedExtensionInfo = (await updateExtension(
        extension,
        extensionManager,
        updateState,
        () => {},
        settings.experimental?.extensionReloading,
      ))!;
      if (
        updatedExtensionInfo.originalVersion !==
        updatedExtensionInfo.updatedVersion
      ) {
        debugLogger.log(
          `Extension "${args.name}" successfully updated: ${updatedExtensionInfo.originalVersion} → ${updatedExtensionInfo.updatedVersion}.`,
        );
      } else {
        debugLogger.log(`Extension "${args.name}" is already up to date.`);
      }
    } catch (error) {
      debugLogger.error(getErrorMessage(error));
    }
  }
  if (args.all) {
    try {
      const extensionState = new Map();
      await checkForAllExtensionUpdates(
        extensions,
        extensionManager,
        (action) => {
          if (action.type === 'SET_STATE') {
            extensionState.set(action.payload.name, {
              status: action.payload.state,
            });
          }
        },
      );
      let updateInfos = await updateAllUpdatableExtensions(
        extensions,
        extensionState,
        extensionManager,
        () => {},
      );
      updateInfos = updateInfos.filter(
        (info) => info.originalVersion !== info.updatedVersion,
      );
      if (updateInfos.length === 0) {
        debugLogger.log('No extensions to update.');
        return;
      }
      debugLogger.log(updateInfos.map((info) => updateOutput(info)).join('\n'));
    } catch (error) {
      debugLogger.error(getErrorMessage(error));
    }
  }
}

export const updateCommand: CommandModule = {
  command: 'update [<name>] [--all]',
  describe:
    'Updates all extensions or a named extension to the latest version.',
  builder: (yargs) =>
    yargs
      .positional('name', {
        describe: 'The name of the extension to update.',
        type: 'string',
      })
      .option('all', {
        describe: 'Update all extensions.',
        type: 'boolean',
      })
      .conflicts('name', 'all')
      .check((argv) => {
        if (!argv.all && !argv.name) {
          throw new Error('Either an extension name or --all must be provided');
        }
        return true;
      }),
  handler: async (argv) => {
    await handleUpdate({
      name: argv['name'] as string | undefined,
      all: argv['all'] as boolean | undefined,
    });
    await exitCli();
  },
};
