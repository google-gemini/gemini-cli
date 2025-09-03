/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { isGitRepository } from '@google/gemini-cli-core';
import * as fs from 'fs';
import * as path from 'path';
import * as childProcess from 'child_process';
import { t } from '../i18n/index.js';

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

export function getInstallationInfo(
  projectRoot: string,
  isAutoUpdateDisabled: boolean,
): InstallationInfo {
  const cliPath = process.argv[1];
  if (!cliPath) {
    return { packageManager: PackageManager.UNKNOWN, isGlobal: false };
  }

  try {
    // Normalize path separators to forward slashes for consistent matching.
    const realPath = fs.realpathSync(cliPath).replace(/\\/g, '/');
    const normalizedProjectRoot = projectRoot?.replace(/\\/g, '/');
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
        updateMessage: t('installation:gitClone'),
      };
    }

    // Check for npx/pnpx
    if (realPath.includes('/.npm/_npx') || realPath.includes('/npm/_npx')) {
      return {
        packageManager: PackageManager.NPX,
        isGlobal: false,
        updateMessage: t('installation:npx'),
      };
    }
    if (realPath.includes('/.pnpm/_pnpx')) {
      return {
        packageManager: PackageManager.PNPX,
        isGlobal: false,
        updateMessage: t('installation:pnpx'),
      };
    }

    // Check for Homebrew
    if (process.platform === 'darwin') {
      try {
        // The package name in homebrew is gemini-cli
        childProcess.execSync('brew list -1 | grep -q "^gemini-cli$"', {
          stdio: 'ignore',
        });
        return {
          packageManager: PackageManager.HOMEBREW,
          isGlobal: true,
          updateMessage: t('installation:homebrew'),
        };
      } catch (_error) {
        // Brew is not installed or gemini-cli is not installed via brew.
        // Continue to the next check.
      }
    }

    // Check for pnpm
    if (realPath.includes('/.pnpm/global')) {
      const updateCommand = 'pnpm add -g @google/gemini-cli@latest';
      return {
        packageManager: PackageManager.PNPM,
        isGlobal: true,
        updateCommand,
        updateMessage: isAutoUpdateDisabled
          ? `Please run ${updateCommand} to update`
          : t('installation:pnpm'),
      };
    }

    // Check for yarn
    if (realPath.includes('/.yarn/global')) {
      const updateCommand = 'yarn global add @google/gemini-cli@latest';
      return {
        packageManager: PackageManager.YARN,
        isGlobal: true,
        updateCommand,
        updateMessage: isAutoUpdateDisabled
          ? `Please run ${updateCommand} to update`
          : t('installation:yarn'),
      };
    }

    // Check for bun
    if (realPath.includes('/.bun/install/cache')) {
      return {
        packageManager: PackageManager.BUNX,
        isGlobal: false,
        updateMessage: t('installation:bunx'),
      };
    }
    if (realPath.includes('/.bun/bin')) {
      const updateCommand = 'bun add -g @google/gemini-cli@latest';
      return {
        packageManager: PackageManager.BUN,
        isGlobal: true,
        updateCommand,
        updateMessage: isAutoUpdateDisabled
          ? `Please run ${updateCommand} to update`
          : t('installation:bun'),
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
      updateMessage: isAutoUpdateDisabled
        ? `Please run ${updateCommand} to update`
        : t('installation:npm'),
    };
  } catch (error) {
    console.log(error);
    return { packageManager: PackageManager.UNKNOWN, isGlobal: false };
  }
}
