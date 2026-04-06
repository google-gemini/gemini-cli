/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'node:child_process';
import { getInstallationInfo, PackageManager } from './installationInfo.js';
import { isUpdateInProgress } from './handleAutoUpdate.js';
import { getPackageJson } from '@google/gemini-cli-core';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import latestVersion from 'latest-version';
import semver from 'semver';
import type { ChildProcess } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type UpdateResult =
  | { status: 'up-to-date'; current: string }
  | { status: 'updated'; from: string; to: string }
  | { status: 'unsupported'; message: string }
  | { status: 'error'; message: string };

/**
 * Resolves the correct npm dist-tag for a version string.
 * Nightly versions use '@nightly', preview versions use '@preview',
 * stable versions pin to exact '@<version>'.
 */
function resolveTag(latestVer: string): string {
  if (latestVer.includes('nightly')) return '@nightly';
  if (latestVer.includes('preview')) return '@preview';
  return `@${latestVer}`;
}

/**
 * Fetches the latest available version from the npm registry.
 * Mirrors the logic in checkForUpdates but without the settings guard
 * (the user explicitly invoked the command).
 */
async function fetchLatestVersion(
  packageName: string,
  currentVersion: string,
): Promise<string | null> {
  const isNightlyBuild = currentVersion.includes('nightly');
  if (isNightlyBuild) {
    const [nightlyVer, stableVer] = await Promise.all([
      latestVersion(packageName, { version: 'nightly' }).catch(() => null),
      latestVersion(packageName).catch(() => null),
    ]);
    // Prefer nightly if base versions are the same (mirrors getBestAvailableUpdate)
    if (!nightlyVer) return stableVer ?? null;
    if (!stableVer) return nightlyVer ?? null;
    if (
      semver.coerce(stableVer)?.version === semver.coerce(nightlyVer)?.version
    ) {
      return nightlyVer;
    }
    return semver.gt(stableVer, nightlyVer) ? stableVer : nightlyVer;
  }

  const isPreviewBuild = currentVersion.includes('preview');
  if (isPreviewBuild) {
    const [previewVer, stableVer] = await Promise.all([
      latestVersion(packageName, { version: 'preview' }).catch(() => null),
      latestVersion(packageName).catch(() => null),
    ]);
    // Prefer preview if base versions are the same (mirrors nightly behavior)
    if (!previewVer) return stableVer ?? null;
    if (!stableVer) return previewVer ?? null;
    if (
      semver.coerce(stableVer)?.version === semver.coerce(previewVer)?.version
    ) {
      return previewVer;
    }
    return semver.gt(stableVer, previewVer) ? stableVer : previewVer;
  }

  return latestVersion(packageName).catch(() => null);
}

/**
 * Core update logic for the explicit `gemini update` / `/update` command.
 *
 * Key difference from handleAutoUpdate:
 *   - Runs the package manager in the FOREGROUND (stdio: 'inherit', no detach)
 *   - Returns a structured UpdateResult promise instead of emitting events
 *   - Always runs regardless of settings.merged.general.enableAutoUpdate
 *   - Supports HOMEBREW with 'brew upgrade gemini-cli'
 */
export async function performUpdate(
  projectRoot: string,
  spawnFn: typeof spawn = spawn,
): Promise<UpdateResult> {
  // Guard: development mode
  if (process.env['DEV'] === 'true') {
    return {
      status: 'error',
      message: 'Cannot update while running in development mode.',
    };
  }

  // Guard: sandbox mode
  if (process.env['GEMINI_SANDBOX']) {
    return {
      status: 'unsupported',
      message:
        'Auto-update is not available in sandbox mode. Please update from outside the sandbox.',
    };
  }

  // Guard: concurrent update
  if (isUpdateInProgress()) {
    return {
      status: 'error',
      message: 'A background update is already in progress. Please wait.',
    };
  }

  // 1. Read package metadata
  const packageJson = await getPackageJson(__dirname);
  if (!packageJson?.name || !packageJson?.version) {
    return { status: 'error', message: 'Cannot determine current version.' };
  }
  const { name, version: currentVersion } = packageJson;

  // 2. Fetch the latest available version
  let latestVer: string | null;
  try {
    latestVer = await fetchLatestVersion(name, currentVersion);
  } catch (e) {
    return {
      status: 'error',
      message: `Failed to check for updates: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  if (!latestVer) {
    return {
      status: 'error',
      message: 'Could not determine the latest version from the registry.',
    };
  }

  // 3. Check if already up to date
  if (!semver.gt(latestVer, currentVersion)) {
    return { status: 'up-to-date', current: currentVersion };
  }

  // 4. Detect installation method
  const installInfo = getInstallationInfo(projectRoot, true);

  // 5. Handle unsupported installers
  const unsupported = [
    PackageManager.NPX,
    PackageManager.PNPX,
    PackageManager.BUNX,
    PackageManager.BINARY,
    PackageManager.UNKNOWN,
  ];
  if (unsupported.includes(installInfo.packageManager)) {
    const hint = installInfo.updateMessage ?? 'Please reinstall manually.';
    return { status: 'unsupported', message: hint };
  }

  // 6. Build the update command
  let updateCommand: string;

  if (installInfo.packageManager === PackageManager.HOMEBREW) {
    updateCommand = 'brew upgrade gemini-cli';
  } else if (installInfo.updateCommand) {
    updateCommand = installInfo.updateCommand.replace(
      '@latest',
      resolveTag(latestVer),
    );
  } else {
    // Local install or other edge case
    const hint = installInfo.updateMessage ?? 'Please update manually.';
    return { status: 'unsupported', message: hint };
  }

  // 7. Run the update in the FOREGROUND
  return new Promise<UpdateResult>((resolve) => {
    let child: ChildProcess;
    try {
      child = spawnFn(updateCommand, {
        shell: true,
        stdio: 'inherit', // KEY DIFFERENCE from handleAutoUpdate
        // No 'detached: true', no child.unref()
      });
    } catch (err) {
      resolve({
        status: 'error',
        message: `Failed to start update: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ status: 'updated', from: currentVersion, to: latestVer });
      } else {
        resolve({
          status: 'error',
          message: `Update command exited with code ${code}. Command: ${updateCommand}`,
        });
      }
    });

    child.on('error', (err) => {
      resolve({
        status: 'error',
        message: `Failed to run update command: ${err.message}`,
      });
    });
  });
}
