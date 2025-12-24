/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { getErrorMessage } from '../../utils/errors.js';
import { debugLogger, Storage } from '@google/gemini-cli-core';
import {
  SettingScope,
  type LoadableSettingScope,
} from '../../config/settings.js';
import { exitCli } from '../utils.js';
import { stat, mkdir, cp, rm, readdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { extractFile } from '../../config/extensions/github.js';

interface InstallArgs {
  source: string;
  scope: SettingScope;
}

export async function handleInstall(args: InstallArgs) {
  const { source, scope } = args;
  const workspaceDir = process.cwd();

  const destinationBase =
    scope === SettingScope.Workspace
      ? new Storage(workspaceDir).getProjectSkillsDir()
      : Storage.getUserSkillsDir();

  try {
    await stat(source);
  } catch {
    throw new Error(`Install source not found: ${source}`);
  }

  await mkdir(destinationBase, { recursive: true });

  const isZip = source.endsWith('.skill') || source.endsWith('.zip');
  const sourceName = path.basename(source, isZip ? path.extname(source) : '');
  const destinationPath = path.join(destinationBase, sourceName);

  if (existsSync(destinationPath)) {
    // For now, we'll just fail if it exists.
    // We could offer an --overwrite flag in the future.
    throw new Error(
      `Skill "${sourceName}" is already installed at ${destinationPath}. Please remove it first.`,
    );
  }

  if (isZip) {
    const tempDir = path.join(
      destinationBase,
      `.tmp_${sourceName}_${Date.now()}`,
    );
    await mkdir(tempDir, { recursive: true });
    try {
      await extractFile(source, tempDir);

      // Check for a single directory inside (common in zips)
      const entries = await readdir(tempDir, { withFileTypes: true });
      let sourceToMove = tempDir;
      if (entries.length === 1 && entries[0].isDirectory()) {
        sourceToMove = path.join(tempDir, entries[0].name);
      }

      // If it's a directory, move its contents or the directory itself.
      // But we want the destinationPath to be the directory.
      await rename(sourceToMove, destinationPath);
    } finally {
      if (existsSync(tempDir)) {
        await rm(tempDir, { recursive: true, force: true });
      }
    }
  } else {
    // It's a directory
    const s = await stat(source);
    if (!s.isDirectory()) {
      throw new Error(`Source ${source} is not a directory or a .skill file.`);
    }
    await cp(source, destinationPath, { recursive: true });
  }

  debugLogger.log(
    `Skill "${sourceName}" successfully installed to ${destinationPath}.`,
  );
}

export const installCommand: CommandModule = {
  command: 'install <source>',
  describe: 'Installs an agent skill from a local path or .skill file.',
  builder: (yargs) =>
    yargs
      .positional('source', {
        describe: 'The local path or .skill file of the skill to install.',
        type: 'string',
        demandOption: true,
      })
      .option('scope', {
        alias: 's',
        describe: 'The scope to install the skill in (user or project).',
        type: 'string',
        default: 'user',
        choices: ['user', 'project'],
      }),
  handler: async (argv) => {
    const scope: LoadableSettingScope =
      argv['scope'] === 'project' ? SettingScope.Workspace : SettingScope.User;
    try {
      await handleInstall({
        source: argv['source'] as string,
        scope,
      });
    } catch (error) {
      debugLogger.error(getErrorMessage(error));
      process.exit(1);
    }
    await exitCli();
  },
};
