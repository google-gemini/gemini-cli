/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { UpdateInfo } from 'update-notifier';
import semver from 'semver';
import { getPackageJson } from '../../utils/package.js';
import type { InstallationInfo } from '../../utils/installationInfo.js';
import { PackageManager } from '../../utils/installationInfo.js';
import {
  type UpdateProvider,
  NpmUpdateProvider,
  HomebrewUpdateProvider,
} from './updateProviders.js';
import { MESSAGES, NPM_DIST_TAGS } from './constants.js';

export interface UpdateObject {
  message: string;
  update: UpdateInfo;
}

function selectUpdateProviders(
  installationInfo: InstallationInfo,
  currentVersion: string,
  packageName: string,
): UpdateProvider[] {
  const { packageManager } = installationInfo;

  switch (packageManager) {
    case PackageManager.HOMEBREW:
      // Don't check for updates for pre-release versions on Homebrew
      if (semver.prerelease(currentVersion)) {
        return [];
      }
      return [new HomebrewUpdateProvider(currentVersion)];

    case PackageManager.NPM:
    case PackageManager.PNPM:
    case PackageManager.YARN:
    case PackageManager.BUN:
    default:
      // Default to NPM check for unknown or standard package managers
      if (currentVersion.includes(NPM_DIST_TAGS.NIGHTLY)) {
        return [
          new NpmUpdateProvider(
            NPM_DIST_TAGS.NIGHTLY,
            currentVersion,
            packageName,
          ),
          new NpmUpdateProvider(
            NPM_DIST_TAGS.LATEST,
            currentVersion,
            packageName,
          ),
        ];
      }
      return [
        new NpmUpdateProvider(
          NPM_DIST_TAGS.LATEST,
          currentVersion,
          packageName,
        ),
      ];
  }
}

function getBestAvailableUpdate(
  updates: Array<UpdateInfo | null>,
): UpdateInfo | null {
  const validUpdates = updates.filter((u): u is UpdateInfo => u !== null);
  if (validUpdates.length === 0) {
    return null;
  }
  if (validUpdates.length === 1) {
    return validUpdates[0];
  }

  // Special case for npm nightly vs stable: prefer nightly if base version is same
  const nightly = validUpdates.find((u) =>
    u.latest.includes(NPM_DIST_TAGS.NIGHTLY),
  );
  const stable = validUpdates.find(
    (u) => !u.latest.includes(NPM_DIST_TAGS.NIGHTLY),
  );

  if (!nightly) return stable || null;
  if (!stable) return nightly || null;

  if (
    semver.coerce(stable.latest)?.version ===
    semver.coerce(nightly.latest)?.version
  ) {
    return nightly;
  }

  return semver.gt(stable.latest, nightly.latest) ? stable : nightly;
}

function formatUpdateObject(
  update: UpdateInfo,
  currentVersion: string,
): UpdateObject {
  const message = MESSAGES.UPDATE_AVAILABLE(currentVersion, update.latest);
  return {
    message,
    update: { ...update, current: currentVersion },
  };
}

export async function checkForUpdates(
  installationInfo: InstallationInfo,
): Promise<UpdateObject | null> {
  // Skip update check when running from source (development mode)
  if (process.env['DEV'] === 'true') {
    return null;
  }

  const packageJson = await getPackageJson();
  if (!packageJson || !packageJson.name || !packageJson.version) {
    return null;
  }
  const { name, version: currentVersion } = packageJson;

  const providers = selectUpdateProviders(
    installationInfo,
    currentVersion,
    name,
  );
  if (providers.length === 0) {
    return null;
  }

  const results = await Promise.all(providers.map((p) => p.fetchUpdate()));

  const bestUpdate = getBestAvailableUpdate(results);

  if (bestUpdate && semver.gt(bestUpdate.latest, currentVersion)) {
    return formatUpdateObject(bestUpdate, currentVersion);
  }

  return null;
}
