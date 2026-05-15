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
  VOLTA = 'volta',
  HOMEBREW = 'homebrew',
  NPX = 'npx',
  BINARY = 'binary',
  UNKNOWN = 'unknown',
}

export interface InstallationInfo {
  packageManager: PackageManager;
  isGlobal: boolean;
  updateCommand?: string;
  updateMessage?: string;
}

function normalizePathForMatching(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function isVoltaPath(realPath: string): boolean {
  const voltaHome = process.env['VOLTA_HOME'];
  if (voltaHome) {
    const normalizedVoltaHome = normalizePathForMatching(voltaHome);
    if (realPath.toLowerCase().startsWith(normalizedVoltaHome.toLowerCase())) {
      return true;
    }
  }

  const lowerRealPath = realPath.toLowerCase();
  return (
    lowerRealPath.includes('/.volta/') ||
    lowerRealPath.includes('/volta/bin/') ||
    lowerRealPath.includes('/volta/tools/')
  );
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
    const realPath = normalizePathForMatching(fs.realpathSync(cliPath));
    const normalizedProjectRoot = projectRoot
      ? normalizePathForMatching(projectRoot)
      : undefined;
    const isGit = isGitRepository(process.cwd());

    // Check for local git clone first
    if (
      isGit &&
      normalizedProjectRoot &&
      realPath.startsWith(normalizedProjectRoot) &&
      !realPath.includes('/node_modules/')
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

    // Check for pnpm
    if (
      realPath.includes('/.pnpm/global') ||
      realPath.includes('/.local/share/pnpm')
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

    // Check for Volta before falling back to npm. Volta shims stay pinned
    // unless the package is updated through Volta itself.
    if (isVoltaPath(realPath)) {
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
