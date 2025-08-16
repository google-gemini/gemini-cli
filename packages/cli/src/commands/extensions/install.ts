/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule, Argv } from 'yargs';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { simpleGit } from 'simple-git';
import {
  EXTENSIONS_DIRECTORY_NAME,
  loadExtension,
  loadExtensionsFromDir,
} from '../../config/extension.js';

export const INSTALL_METADATA_FILENAME = '.gemini-extension-install.json';

export interface ExtensionInstallMetadata {
  source: string;
  type: 'git' | 'local';
}

/**
 * Clones a Git repository to a specified local path.
 * @param gitUrl The Git URL to clone.
 * @param destination The destination path to clone the repository to.
 */
async function cloneFromGit(
  gitUrl: string,
  destination: string,
): Promise<void> {
  try {
    await simpleGit().clone(gitUrl, destination, ['--depth', '1']);
  } catch (error) {
    throw new Error(`Failed to clone Git repository from ${gitUrl}`, {
      cause: error,
    });
  }
}

/**
 * Copies an extension from a source to a destination path.
 * @param source The source path of the extension.
 * @param destination The destination path to copy the extension to.
 */
async function copyExtension(
  source: string,
  destination: string,
): Promise<void> {
  await fs.cp(source, destination, { recursive: true });
}

export const installCommand: CommandModule = {
  command: 'install [source] [args...]',
  describe:
    'Install an extension from a Git URL or local path to the user-level extensions directory (~/.gemini/extensions). The source must contain a valid gemini-extension.json file.',
  builder: (yargs: Argv) =>
    yargs
      .positional('source', {
        describe:
          'Git URL of the extension to install (e.g. https://github.com/user/my-gemini-extension.git)',
        type: 'string',
      })
      .option('path', {
        describe:
          'Path to a local extension directory to install (e.g. /path/to/my-local-extension). Cannot specify both `source` and --path.',
        type: 'string',
      })
      .check((argv) => {
        if (!argv.source && !argv.path) {
          throw new Error('You must specify a source Git URL or a local path.');
        }
        if (argv.source && argv.path) {
          throw new Error(
            'You cannot specify both a source Git URL and a local path.',
          );
        }
        return true;
      }),
  handler: async (argv) => {
    // Get the path to the user-level extensions directory, and create the
    // directory if it doesn't already exist.
    const extensionsDirectoryPath = path.join(
      os.homedir(),
      EXTENSIONS_DIRECTORY_NAME,
    );
    await fs.mkdir(extensionsDirectoryPath, { recursive: true });

    // Track the original source of each user-installed extension.
    const installMetadata: ExtensionInstallMetadata = {
      source: (argv.source || argv.path) as string,
      type: argv.source ? 'git' : 'local',
    };

    // Convert relative paths to absolute paths for the metadata file.
    if (
      installMetadata.type === 'local' &&
      !path.isAbsolute(installMetadata.source)
    ) {
      installMetadata.source = path.resolve(
        process.cwd(),
        installMetadata.source,
      );
    }

    // If a Git URL is provided, clone it to a temporary directory.
    // Otherwise, use the local path.
    let localSourcePath: string;
    let tempDir: string | undefined;
    if (installMetadata.type === 'git') {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-extension-'));
      await cloneFromGit(installMetadata.source, tempDir);
      localSourcePath = tempDir;
    } else {
      localSourcePath = installMetadata.source;
    }

    try {
      // Validate the extension and get its configuration.
      const newExtension = loadExtension(localSourcePath);
      if (!newExtension) {
        throw new Error(
          `Invalid extension at ${installMetadata.source}. Please make sure it has a valid gemini-extension.json file.`,
        );
      }

      // Set the new extension's file path to
      // ~/.gemini/extensions/{ExtensionConfig.name}.
      const newExtensionName = newExtension.config.name;
      const destinationPath = path.join(
        extensionsDirectoryPath,
        newExtensionName,
      );

      // Check if the extension is already installed by comparing
      // ExtensionConfig.name. This is more robust than checking for file path
      // uniqueness.
      const installedExtensions = loadExtensionsFromDir(os.homedir());
      if (
        installedExtensions.some(
          (installed) => installed.config.name === newExtensionName,
        )
      ) {
        // Since an extension with the same name exists, the command fails and                                                                                                    │
        // informs the user they need to uninstall it first or use the update
        // command.
        throw new Error(
          `Error: Extension "${newExtensionName}" is already installed. Please uninstall it first.`,
        );
      }

      // Copy the local extension copy to the user-level extensions directory.
      await copyExtension(localSourcePath, destinationPath);

      // Write the installation metadata to the new extension directory. If the
      // source already contains a metadata file, this will overwrite that file.
      const metadataString = JSON.stringify(installMetadata, null, 2);
      const metadataPath = path.join(
        destinationPath,
        INSTALL_METADATA_FILENAME,
      );
      await fs.writeFile(metadataPath, metadataString);

      console.log(`Extension "${newExtensionName}" installed successfully.`);
    } finally {
      // Clean up the temporary directory if one was created.
      if (tempDir) {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    }
  },
};
