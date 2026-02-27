/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import chalk from 'chalk';
import {
  debugLogger,
  FolderTrustDiscoveryService,
  getRealPath,
} from '@google/gemini-cli-core';
import { getErrorMessage } from '../../utils/errors.js';
import {
  INSTALL_WARNING_MESSAGE,
  promptForConsentNonInteractive,
  requestConsentNonInteractive,
} from '../../config/extensions/consent.js';
import {
  ExtensionManager,
  inferInstallMetadata,
} from '../../config/extension-manager.js';
import { loadSettings } from '../../config/settings.js';
import {
  isWorkspaceTrusted,
  loadTrustedFolders,
  TrustLevel,
} from '../../config/trustedFolders.js';
import { promptForSetting } from '../../config/extensions/extensionSettings.js';
import { exitCli } from '../utils.js';
import { z } from 'zod';

const installArgsSchema = z.object({
  source: z.string(),
  ref: z.string().optional(),
  'auto-update': z.boolean().optional(),
  'pre-release': z.boolean().optional(),
  consent: z.boolean().optional(),
});

interface InstallArgs {
  source: string;
  ref?: string;
  autoUpdate?: boolean;
  allowPreRelease?: boolean;
  consent?: boolean;
}

export async function handleInstall(args: InstallArgs) {
  try {
    const { source } = args;
    const installMetadata = await inferInstallMetadata(source, {
      ref: args.ref,
      autoUpdate: args.autoUpdate,
      allowPreRelease: args.allowPreRelease,
    });

    const workspaceDir = process.cwd();
    const settings = loadSettings(workspaceDir).merged;

    if (installMetadata.type === 'local' || installMetadata.type === 'link') {
      const resolvedPath = getRealPath(source);
      installMetadata.source = resolvedPath;
      const trustResult = isWorkspaceTrusted(settings, resolvedPath);
      if (trustResult.isTrusted !== true) {
        const discoveryResults =
          await FolderTrustDiscoveryService.discover(resolvedPath);

        const hasDiscovery =
          discoveryResults.commands.length > 0 ||
          discoveryResults.mcps.length > 0 ||
          discoveryResults.hooks.length > 0 ||
          discoveryResults.skills.length > 0 ||
          discoveryResults.settings.length > 0;

        const promptLines = [
          '',
          chalk.bold('Do you trust the files in this folder?'),
          '',
          `The extension source at "${resolvedPath}" is not trusted.`,
          '',
          'Trusting a folder allows Gemini CLI to load its local configurations,',
          'including custom commands, hooks, MCP servers, agent skills, and',
          'settings. These configurations could execute code on your behalf or',
          'change the behavior of the CLI.',
          '',
        ];

        if (discoveryResults.discoveryErrors.length > 0) {
          promptLines.push(chalk.red('❌ Discovery Errors:'));
          for (const error of discoveryResults.discoveryErrors) {
            promptLines.push(chalk.red(`  • ${error}`));
          }
          promptLines.push('');
        }

        if (discoveryResults.securityWarnings.length > 0) {
          promptLines.push(chalk.yellow('⚠️  Security Warnings:'));
          for (const warning of discoveryResults.securityWarnings) {
            promptLines.push(chalk.yellow(`  • ${warning}`));
          }
          promptLines.push('');
        }

        if (hasDiscovery) {
          promptLines.push(chalk.bold('This folder contains:'));
          const groups = [
            { label: 'Commands', items: discoveryResults.commands },
            { label: 'MCP Servers', items: discoveryResults.mcps },
            { label: 'Hooks', items: discoveryResults.hooks },
            { label: 'Skills', items: discoveryResults.skills },
            { label: 'Setting overrides', items: discoveryResults.settings },
          ].filter((g) => g.items.length > 0);

          for (const group of groups) {
            promptLines.push(
              `  • ${chalk.bold(group.label)} (${group.items.length}):`,
            );
            for (const item of group.items) {
              promptLines.push(`    - ${item}`);
            }
          }
          promptLines.push('');
        }

        promptLines.push(
          chalk.yellow(
            'Do you want to trust this folder and continue with the installation? [y/N]: ',
          ),
        );

        const confirmed = await promptForConsentNonInteractive(
          promptLines.join('\n'),
          false,
        );
        if (confirmed) {
          const trustedFolders = loadTrustedFolders();
          await trustedFolders.setValue(resolvedPath, TrustLevel.TRUST_FOLDER);
        } else {
          throw new Error(
            `Installation aborted: Folder "${resolvedPath}" is not trusted.`,
          );
        }
      }
    }

    const requestConsent = args.consent
      ? () => Promise.resolve(true)
      : requestConsentNonInteractive;
    if (args.consent) {
      debugLogger.log('You have consented to the following:');
      debugLogger.log(INSTALL_WARNING_MESSAGE);
    }

    const extensionManager = new ExtensionManager({
      workspaceDir,
      requestConsent,
      requestSetting: promptForSetting,
      settings,
    });
    await extensionManager.loadExtensions();
    const extension =
      await extensionManager.installOrUpdateExtension(installMetadata);
    debugLogger.log(
      `Extension "${extension.name}" installed successfully and enabled.`,
    );
  } catch (error) {
    debugLogger.error(getErrorMessage(error));
    process.exit(1);
  }
}

export const installCommand: CommandModule = {
  command: 'install <source> [--auto-update] [--pre-release]',
  describe: 'Installs an extension from a git repository URL or a local path.',
  builder: (yargs) =>
    yargs
      .positional('source', {
        describe: 'The github URL or local path of the extension to install.',
        type: 'string',
        demandOption: true,
      })
      .option('ref', {
        describe: 'The git ref to install from.',
        type: 'string',
      })
      .option('auto-update', {
        describe: 'Enable auto-update for this extension.',
        type: 'boolean',
      })
      .option('pre-release', {
        describe: 'Enable pre-release versions for this extension.',
        type: 'boolean',
      })
      .option('consent', {
        describe:
          'Acknowledge the security risks of installing an extension and skip the confirmation prompt.',
        type: 'boolean',
        default: false,
      })
      .check((argv) => {
        if (!argv.source) {
          throw new Error('The source argument must be provided.');
        }
        return true;
      }),
  handler: async (argv) => {
    const parsedArgs = installArgsSchema.parse(argv);
    await handleInstall({
      source: parsedArgs.source,
      ref: parsedArgs.ref,
      autoUpdate: parsedArgs['auto-update'],
      allowPreRelease: parsedArgs['pre-release'],
      consent: parsedArgs.consent,
    });
    await exitCli();
  },
};
