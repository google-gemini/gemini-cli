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
  UNKNOWN = 'unknown',
}

export interface InstallationInfo {
  packageManager: PackageManager;
  isGlobal: boolean;
  updateCommand?: string;
  updateMessage?: string;
}

/**
 * Checks if a path is writable by the current process.
 */
function isWritable(dir: string): boolean {
  try {
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks if the current user is root/admin.
 */
function isRoot(): boolean {
  if (process.getuid) {
    return process.getuid() === 0;
  }
  return false;
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
    // Normalize path separators to forward slashes for consistent matching.
    const realPath = fs.realpathSync(cliPath).replace(/\\/g, '/');
    const cliDir = path.dirname(realPath);
    const normalizedProjectRoot = projectRoot?.replace(/\\/g, '/');

    // Check for local git clone first.
    // We check if the CLI binary itself is inside a git repository (and not in a node_modules folder).
    if (isGitRepository(cliDir) && !realPath.includes('/node_modules/')) {
      return {
        packageManager: PackageManager.UNKNOWN, // Not managed by a package manager in this sense
        isGlobal: false,
        updateMessage:
          'Running from a local git clone/fork. Please update with "git pull".',
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
      } catch (_error) {
        // Brew is not installed or gemini-cli is not installed via brew.
        // Continue to the next check.
      }
    }

    // Check for pnpm
    if (
      realPath.includes('/.pnpm/global') ||
      realPath.includes('/.local/share/pnpm')
    ) {
      let updateCommand = 'pnpm add -g @google/gemini-cli@latest';
      const needsSudo =
        process.platform !== 'win32' && !isRoot() && !isWritable(cliDir);
      if (needsSudo) {
        updateCommand = `sudo ${updateCommand}`;
      }

      return {
        packageManager: PackageManager.PNPM,
        isGlobal: true,
        updateCommand: needsSudo ? undefined : updateCommand,
        updateMessage: needsSudo
          ? `Please run "${updateCommand}" to update (requires sudo).`
          : isAutoUpdateEnabled
            ? 'Installed with pnpm. Attempting to automatically update now...'
            : `Please run ${updateCommand} to update`,
      };
    }

    // Check for yarn
    if (realPath.includes('/.yarn/global')) {
      let updateCommand = 'yarn global add @google/gemini-cli@latest';
      const needsSudo =
        process.platform !== 'win32' && !isRoot() && !isWritable(cliDir);
      if (needsSudo) {
        updateCommand = `sudo ${updateCommand}`;
      }

      return {
        packageManager: PackageManager.YARN,
        isGlobal: true,
        updateCommand: needsSudo ? undefined : updateCommand,
        updateMessage: needsSudo
          ? `Please run "${updateCommand}" to update (requires sudo).`
          : isAutoUpdateEnabled
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
      let updateCommand = 'bun add -g @google/gemini-cli@latest';
      const needsSudo =
        process.platform !== 'win32' && !isRoot() && !isWritable(cliDir);
      if (needsSudo) {
        updateCommand = `sudo ${updateCommand}`;
      }

      return {
        packageManager: PackageManager.BUN,
        isGlobal: true,
        updateCommand: needsSudo ? undefined : updateCommand,
        updateMessage: needsSudo
          ? `Please run "${updateCommand}" to update (requires sudo).`
          : isAutoUpdateEnabled
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
    let updateCommand = 'npm install -g @google/gemini-cli@latest';
    const needsSudo =
      process.platform !== 'win32' && !isRoot() && !isWritable(cliDir);
    if (needsSudo) {
      updateCommand = `sudo ${updateCommand}`;
    }

    return {
      packageManager: PackageManager.NPM,
      isGlobal: true,
      updateCommand: needsSudo ? undefined : updateCommand,
      updateMessage: needsSudo
        ? `Please run "${updateCommand}" to update (requires sudo).`
        : isAutoUpdateEnabled
          ? 'Installed with npm. Attempting to automatically update now...'
          : `Please run ${updateCommand} to update`,
    };
  } catch (error) {
    debugLogger.log(error);
    return { packageManager: PackageManager.UNKNOWN, isGlobal: false };
  }
}

