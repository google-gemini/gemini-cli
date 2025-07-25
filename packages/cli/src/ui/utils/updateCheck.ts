/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import updateNotifier, { type UpdateInfo as Update } from 'update-notifier';
import semver from 'semver';
import { getPackageJson } from '../../utils/package.js';

export interface UpdateInfo {
  message: string;
  update: Update;
}

export async function checkForUpdates(): Promise<UpdateInfo | null> {
  try {
    // Skip update check when running from source (development mode)
    if (process.env.DEV === 'true') {
      return null;
    }

    const packageJson = await getPackageJson();
    if (!packageJson || !packageJson.name || !packageJson.version) {
      return null;
    }
    const notifier = updateNotifier({
      pkg: {
        name: packageJson.name,
        version: packageJson.version,
      },
      // check every time
      updateCheckInterval: 0,
      // allow notifier to run in scripts
      shouldNotifyInNpmScript: true,
    });

    if (
      notifier.update &&
      semver.gt(notifier.update.latest, notifier.update.current)
    ) {
      return {
        message: `Gemini CLI update available! ${notifier.update.current} → ${notifier.update.latest}`,
        update: notifier.update,
      };
    }

    return null;
  } catch (e) {
    console.warn('Failed to check for updates: ' + e);
    return null;
  }
}
