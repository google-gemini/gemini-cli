/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import updateNotifier, { UpdateInfo } from 'update-notifier';
import semver from 'semver';
import { getPackageJson } from '../../utils/package.js';

export const FETCH_TIMEOUT_MS = 2000;

export interface UpdateObject {
  message: string;
  update: UpdateInfo;
}

export async function checkForUpdates(): Promise<UpdateObject | null> {
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
    // avoid blocking by waiting at most FETCH_TIMEOUT_MS for fetchInfo to resolve
    const timeout = new Promise<null>((resolve) =>
      setTimeout(resolve, FETCH_TIMEOUT_MS, null),
    );
    const updateInfo = await Promise.race([notifier.fetchInfo(), timeout]);

    if (updateInfo && semver.gt(updateInfo.latest, updateInfo.current)) {
      return {
        message: `Gemini CLI update available! ${updateInfo.current} → ${updateInfo.latest}`,
        update: updateInfo,
      };
    }

    return null;
  } catch (e) {
    console.warn('Failed to check for updates: ' + e);
    return null;
  }
}
