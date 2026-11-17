/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger, isGitRepository } from '@google/gemini-cli-core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as childProcess from 'node:child_process';
import process from 'node:process';

export const isDevelopment = process.env['NODE_ENV'] === 'development';

export enum PackageManager {
  NPM = 'npm',
  YARN = 'yarn',
  PNPM = 'pnpm',
  PNPX = 'pnpx',
  BUN = 'bun',
  BUNX = 'bunx',
  HOMEBREW = 'homebrew',
  NPX = 'npx',
  BINARY = 'binary',
  VOLTA = 'volta',
  UNKNOWN = 'unknown',
}

export interface InstallationInfo {
  packageManager: PackageManager;
  isGlobal: boolean;
  updateCommand?: string;
  updateMessage?: string;
}

export function getInstallationInfo(
  projectRoot: string,
  isAutoUpdateEnabled: boolean,
): InstallationInfo {
  const cliPath = process.argv[1];
  if (!cliPath) {
    return { packageManager: PackageManager.UNKNOWN, isGlobal: false };
  }

  try {
    // Check for standalone binary first
    if (process.env['IS_BINARY'] === 'true') {
      return {
        packageManager: PackageManager.BINARY,
        isGlobal: true,
        updateMessage:
          'Running as a standalone binary. Please update by downloading the latest version from GitHub.',
      };
    }

    // Normalize path separators to forward slashes for consistent matching.
    const realPath = fs.realpathSync(cliPath).replace(/\\/g, '/');
    const normalizedProjectRoot = projectRoot?.replace(/\\/g, '/');

    // Detect a source checkout from the CLI script's own directory.
    // `projectRoot` is the directory the process was launched in, so a
    // checkout started from anywhere else used to be treated as a global
    // npm install. A Homebrew prefix is itself a git repository, but a
    // directory merely named homebrew, linuxbrew, or Cellar is not one.
    // Only a prefix Homebrew reports is left for the Homebrew check below.
    if (
      !realPath.includes('/node_modules/') &&
      isGitRepository(path.dirname(realPath)) &&
      !isConfirmedHomebrewInstall(realPath)
    ) {
      return {
        packageManager: PackageManager.UNKNOWN, // Not managed by a package manager in this sense
        isGlobal: false,
        updateMessage:
          'Running from a local git clone. Please update with "git pull".',
      };
    }

    // Check for npx/pnpx
    if (realPath.includes('/.npm/_npx') || realPath.includes('/npm/_npx')) {
      return {
        packageManager: PackageManager.NPX,
        isGlobal: false,
        updateMessage: 'Running via npx, update not applicable.',
      };
    }
    if (
      realPath.includes('/.pnpm/_pnpx') ||
      realPath.includes('/.cache/pnpm/dlx')
    ) {
      return {
        packageManager: PackageManager.PNPX,
        isGlobal: false,
        updateMessage: 'Running via pnpx, update not applicable.',
      };
    }

    // Check for Homebrew
    if (process.platform === 'darwin') {
      try {
        const brewPrefix = childProcess
          .execSync('brew --prefix gemini-cli', {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
          })
          .trim();
        const brewRealPath = fs.realpathSync(brewPrefix);

        if (realPath.startsWith(brewRealPath)) {
          return {
            packageManager: PackageManager.HOMEBREW,
            isGlobal: true,
            updateMessage:
              'Installed via Homebrew. Please update with "brew upgrade gemini-cli".',
          };
        }
      } catch {
        // Brew is not installed or gemini-cli is not installed via brew.
        // Continue to the next check.
      }
    }

    // Check for Volta
    if (realPath.includes('/.volta/') || realPath.includes('/Volta/')) {
      const updateCommand = 'volta install @google/gemini-cli@latest';
      return {
        packageManager: PackageManager.VOLTA,
        isGlobal: true,
        updateCommand,
        updateMessage: isAutoUpdateEnabled
          ? 'Installed with Volta. Attempting to automatically update now...'
          : `Please run ${updateCommand} to update`,
      };
    }

    // Check for pnpm
    if (
      realPath.includes('/.pnpm/global') ||
      realPath.includes('/.local/share/pnpm') ||
      realPath.includes('/Library/pnpm/global/') ||
      realPath.includes('/AppData/Local/pnpm/global/')
    ) {
      const updateCommand = 'pnpm add -g @google/gemini-cli@latest';
      return {
        packageManager: PackageManager.PNPM,
        isGlobal: true,
        updateCommand,
        updateMessage: isAutoUpdateEnabled
          ? 'Installed with pnpm. Attempting to automatically update now...'
          : `Please run ${updateCommand} to update`,
      };
    }

    // Check for yarn
    if (realPath.includes('/.yarn/global')) {
      const updateCommand = 'yarn global add @google/gemini-cli@latest';
      return {
        packageManager: PackageManager.YARN,
        isGlobal: true,
        updateCommand,
        updateMessage: isAutoUpdateEnabled
          ? 'Installed with yarn. Attempting to automatically update now...'
          : `Please run ${updateCommand} to update`,
      };
    }

    // Check for bun
    if (realPath.includes('/.bun/install/cache')) {
      return {
        packageManager: PackageManager.BUNX,
        isGlobal: false,
        updateMessage: 'Running via bunx, update not applicable.',
      };
    }
    if (realPath.includes('/.bun/install/global')) {
      const updateCommand = 'bun add -g @google/gemini-cli@latest';
      return {
        packageManager: PackageManager.BUN,
        isGlobal: true,
        updateCommand,
        updateMessage: isAutoUpdateEnabled
          ? 'Installed with bun. Attempting to automatically update now...'
          : `Please run ${updateCommand} to update`,
      };
    }

    // Check for local install
    if (
      normalizedProjectRoot &&
      realPath.startsWith(`${normalizedProjectRoot}/node_modules`)
    ) {
      let pm = PackageManager.NPM;
      if (fs.existsSync(path.join(projectRoot, 'yarn.lock'))) {
        pm = PackageManager.YARN;
      } else if (fs.existsSync(path.join(projectRoot, 'pnpm-lock.yaml'))) {
        pm = PackageManager.PNPM;
      } else if (fs.existsSync(path.join(projectRoot, 'bun.lockb'))) {
        pm = PackageManager.BUN;
      }
      return {
        packageManager: pm,
        isGlobal: false,
        updateMessage:
          "Locally installed. Please update via your project's package.json.",
      };
    }

    // Assume global npm
    const updateCommand = 'npm install -g @google/gemini-cli@latest';
    return {
      packageManager: PackageManager.NPM,
      isGlobal: true,
      updateCommand,
      updateMessage: isAutoUpdateEnabled
        ? 'Installed with npm. Attempting to automatically update now...'
        : `Please run ${updateCommand} to update`,
    };
  } catch (error) {
    debugLogger.log(error);
    return { packageManager: PackageManager.UNKNOWN, isGlobal: false };
  }
}

/**
 * True only when Homebrew itself reports that this CLI path is the
 * gemini-cli formula. A checkout stored under a directory named homebrew,
 * linuxbrew, or Cellar is not excluded unless that command confirms it.
 */
function isConfirmedHomebrewInstall(realPath: string): boolean {
  if (
    !realPath.includes('/Cellar/') &&
    !realPath.includes('/homebrew/') &&
    !realPath.includes('/linuxbrew/')
  ) {
    return false;
  }

  try {
    const brewPrefix = childProcess
      .execSync('brew --prefix gemini-cli', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      .trim();
    if (!brewPrefix) {
      return false;
    }
    const brewRealPath = fs.realpathSync(brewPrefix).replace(/\\/g, '/');
    return brewRealPath.length > 0 && realPath.startsWith(brewRealPath);
  } catch {
    return false;
  }
}
